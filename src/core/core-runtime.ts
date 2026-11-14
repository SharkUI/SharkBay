import { SharkBayCoreService } from "./core-service.js";
import { LocalProvider } from "../providers/local/local-provider.js";

export type CoreRuntime = SharkBayCoreService & { dispose(): Promise<void> };

export function createCoreRuntime(): CoreRuntime {
  const core = new SharkBayCoreService([new LocalProvider()]);
  let disposal: Promise<void> | undefined;
  return Object.assign(core, {
    dispose(): Promise<void> {
      return disposal ??= (async () => {
        try { await core.cancelAllCodeGraphJobs(); }
        finally {
          const pending = new Set(core.listTerminalSessions().filter((session) => session.status === "running").map((session) => session.id));
          if (!pending.size) core.closeAllTerminalSessions();
          else await new Promise<void>((resolve, reject) => {
            const cleanup = () => { clearTimeout(timeout); core.off("terminalExit", onExit); };
            const onExit = ({ sessionId }: { sessionId: string }) => { pending.delete(sessionId); if (!pending.size) { cleanup(); resolve(); } };
            const timeout = setTimeout(() => { cleanup(); reject(new Error("Timed out waiting for terminal processes to exit")); }, 5000);
            core.on("terminalExit", onExit);
            try { core.closeAllTerminalSessions(); } catch (error) { cleanup(); reject(error); }
          });
        }
      })();
    },
  });
}
