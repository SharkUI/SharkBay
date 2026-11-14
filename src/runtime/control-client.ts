import { EventEmitter } from "node:events";
import net from "node:net";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { lstat, realpath } from "node:fs/promises";

export const runtimeProtocolVersion = 1;
export const defaultRuntimeDataPath = () => path.join(os.homedir(), ".sharkbay", "runtime");
export function runtimeControlPath(dataPath: string): string {
  const hash = createHash("sha256").update(path.resolve(dataPath)).digest("hex").slice(0, 12);
  return path.join(os.tmpdir(), `sharkbay-runtime-${process.getuid?.() ?? 0}-${hash}`, "control.sock");
}

export class RuntimeClient extends EventEmitter<{ event: [string, unknown]; disconnected: [] }> {
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private constructor(private socket: net.Socket) {
    super();
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 4 * 1024 * 1024) { socket.destroy(new Error("Runtime response is too large")); return; }
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message;
        try { message = JSON.parse(line); } catch { socket.destroy(new Error("Invalid runtime response")); return; }
        if (message.kind === "event") { this.emit("event", message.name, message.payload); continue; }
        const request = this.pending.get(message.id);
        if (!request) continue;
        this.pending.delete(message.id); clearTimeout(request.timer);
        if (message.ok) request.resolve(message.result); else request.reject(new Error(message.error ?? "Runtime command failed"));
      }
    });
    const disconnected = () => {
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Runtime disconnected")); }
      this.pending.clear(); this.emit("disconnected");
    };
    socket.on("error", () => {});
    socket.once("close", disconnected);
  }

  static async connect(dataPath: string): Promise<RuntimeClient> {
    const socketPath = runtimeControlPath(await realpath(dataPath));
    const directory = await lstat(path.dirname(socketPath));
    const endpoint = await lstat(socketPath);
    if (!directory.isDirectory() || directory.isSymbolicLink() || !endpoint.isSocket()
      || (process.getuid && (directory.uid !== process.getuid() || endpoint.uid !== process.getuid()))
      || (directory.mode & 0o077) !== 0) {
      throw new Error("Runtime control endpoint is not owned privately by this system user");
    }
    const socket = net.createConnection(socketPath);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error("Runtime connection timed out")); }, 2000);
      socket.once("connect", () => { clearTimeout(timeout); resolve(); });
      socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    });
    const client = new RuntimeClient(socket);
    try { await client.call("hello", { protocol: runtimeProtocolVersion }); return client; }
    catch (error) { client.dispose(); throw error; }
  }

  call<T = any>(method: string, input?: unknown): Promise<T> {
    if (this.socket.destroyed) return Promise.reject(new Error("Runtime disconnected"));
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Runtime command timed out: ${method}`)); }, 120000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ id, method, input }) + "\n");
    });
  }
  dispose(): void { this.socket.destroy(); }
}
