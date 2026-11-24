import net from "node:net";
import { mkdir, chmod, rm, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ApplicationRuntime } from "./application-runtime.js";
import { maxRuntimeResponseBytes, runtimeControlPath, runtimeProtocolVersion } from "./control-client.js";
import type { createWebServer } from "../server/http-server.js";

export async function createRuntimeControl(runtime: ApplicationRuntime, web: Awaited<ReturnType<typeof createWebServer>>, stop?: () => void) {
  const socketPath = runtimeControlPath(await realpath(runtime.paths.userDataPath));
  await mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  const directory = await lstat(path.dirname(socketPath));
  if (!directory.isDirectory() || directory.isSymbolicLink() || (process.getuid && directory.uid !== process.getuid())) throw new Error("Runtime control directory has an unexpected owner");
  await chmod(path.dirname(socketPath), 0o700);
  // The profile lock is already held; only this owner may replace a stale socket.
  await rm(socketPath, { force: true });
  const clients = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    clients.add(socket);
    const clientId = `desktop-${randomUUID()}`;
    let attachmentUpload: ReturnType<typeof web.openDesktopAttachmentUpload> | undefined;
    let ready = false, buffer = "";
    const send = (value: { id: string; ok: boolean; result?: unknown; error?: string } | { kind: "event"; name: string; payload: unknown }) => {
      if (socket.destroyed) return;
      let data = JSON.stringify(value) + "\n";
      let size = Buffer.byteLength(data);
      if (size > maxRuntimeResponseBytes) {
        if (!("id" in value)) return;
        data = JSON.stringify({ id: value.id, ok: false, error: "Runtime response is too large" }) + "\n";
        size = Buffer.byteLength(data);
      }
      if (socket.writableLength + size > 2 * maxRuntimeResponseBytes) { socket.destroy(); return; }
      socket.write(data);
    };
    const event = (name: string, payload: unknown) => { if (ready) send({ kind: "event", name, payload }); };
    runtime.on("event", event);
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    socket.on("close", () => { attachmentUpload?.close(); clients.delete(socket); runtime.off("event", event); runtime.terminals.releaseClient(clientId); });
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 2 * 1024 * 1024) { socket.destroy(); return; }
      for (let end; (end = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        void (async () => {
          let request: { id?: unknown; method?: unknown; input?: any };
          try { request = JSON.parse(line); } catch { socket.destroy(); return; }
          if (typeof request.id !== "string" || typeof request.method !== "string") { socket.destroy(); return; }
          try {
            let result: unknown;
            if (request.method === "hello") {
              if (request.input?.protocol !== runtimeProtocolVersion) throw new Error("Incompatible SharkBay runtime protocol; update the client and runtime together.");
              ready = true; result = { protocol: runtimeProtocolVersion, pid: process.pid, origin: web.origin, clientId };
            } else {
              if (!ready) throw new Error("Runtime handshake required");
              if (request.method === "connect") result = web.connectionUrl();
              else if (request.method === "revoke") web.revoke();
              else if (request.method === "terminal.attachmentUpload") {
                attachmentUpload ??= web.openDesktopAttachmentUpload(clientId);
                result = { origin: web.origin, token: attachmentUpload.token };
              }
              else if (request.method === "stop" && stop) setTimeout(stop, 50);
              else if (request.method === "terminal.attach") {
                const sessionId = request.input?.sessionId;
                if (typeof sessionId !== "string") throw new Error("Terminal id required");
                await runtime.requireTerminal(sessionId);
                if (!runtime.terminals.owner(sessionId)) runtime.terminals.claim(sessionId, clientId);
                await runtime.terminals.attach(sessionId, (frame) => event("terminal:data", frame));
              } else result = await runtime.executeLocal(request.method, request.input, clientId);
            }
            send({ id: request.id, ok: true, result });
          } catch (error) { send({ id: request.id, ok: false, error: error instanceof Error ? error.message : "Runtime command failed" }); }
        })();
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  await chmod(socketPath, 0o600);
  return { async dispose() { for (const socket of clients) socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(socketPath, { force: true }); } };
}
