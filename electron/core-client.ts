import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { utilityProcess, type UtilityProcess } from "electron";
import {
  deserializeError,
  type CoreEventMap,
  type CoreMessage,
  type CoreMethodMap,
  type CoreMethodName,
  type CoreRequestMessage,
} from "../src/core/core-protocol.js";
import type {
  InstallLogEvent,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalUpdateEvent,
} from "../src/shared/types.js";

export type CoreClientEvents = {
  terminalData: [TerminalDataEvent];
  terminalUpdate: [TerminalUpdateEvent];
  terminalExit: [TerminalExitEvent];
  installLog: [InstallLogEvent];
};

type Pending = { resolve: (value: unknown) => void; reject: (error: unknown) => void };

export class CoreClient extends EventEmitter<CoreClientEvents> {
  private readonly child: UtilityProcess;
  private readonly pending = new Map<number, Pending>();
  private readonly readyPromise: Promise<void>;
  private sequence = 0;
  private disposed = false;

  constructor(child: UtilityProcess) {
    super();
    this.child = child;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const onMessage = (message: CoreMessage) => {
        if (!message || typeof message !== "object") return;
        if (message.kind === "ready") {
          this.child.off("message", onMessage);
          resolve();
        }
      };
      const onExit = (code: number) => reject(new Error(`Core utility process exited before ready (code ${code})`));
      this.child.on("message", onMessage);
      this.child.once("exit", onExit);
    });
    this.child.on("message", (message: CoreMessage) => this.handleMessage(message));
    this.child.on("exit", (code) => this.handleExit(code));
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  call<M extends CoreMethodName>(method: M, args: CoreMethodMap[M]["args"]): Promise<CoreMethodMap[M]["result"]> {
    if (this.disposed) return Promise.reject(new Error("Core client is disposed"));
    const id = ++this.sequence;
    const message: CoreRequestMessage = { kind: "request", id, method, args };
    return new Promise<CoreMethodMap[M]["result"]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      try {
        this.child.postMessage(message);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.call("closeAllTerminalSessions", []);
    } catch {
      // Ignore — best-effort cleanup.
    }
    this.child.kill();
  }

  private handleMessage(message: CoreMessage): void {
    if (!message || typeof message !== "object") return;
    if (message.kind === "response") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(deserializeError(message.error));
      return;
    }
    if (message.kind === "event") {
      const name = message.name as keyof CoreEventMap;
      if (name === "terminalData") this.emit("terminalData", message.payload as TerminalDataEvent);
      else if (name === "terminalUpdate") this.emit("terminalUpdate", message.payload as TerminalUpdateEvent);
      else if (name === "terminalExit") this.emit("terminalExit", message.payload as TerminalExitEvent);
      else if (name === "installLog") this.emit("installLog", message.payload as InstallLogEvent);
    }
  }

  private handleExit(code: number): void {
    this.disposed = true;
    const error = new Error(`Core utility process exited (code ${code})`);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

export async function spawnCoreClient(options: { hostScript?: string } = {}): Promise<CoreClient> {
  const hostScript = options.hostScript ?? defaultHostScript();
  const child = utilityProcess.fork(hostScript, [], { serviceName: "sharkbay-core" });
  const client = new CoreClient(child);
  await client.ready();
  return client;
}

function defaultHostScript(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "core-host.js");
}
