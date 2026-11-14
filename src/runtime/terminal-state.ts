import Xterm from "@xterm/headless";
import type { Terminal } from "@xterm/headless";
import Serialization from "@xterm/addon-serialize";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { CoreRuntime } from "../core/core-runtime.js";
import type { TerminalSession, TerminalDataEvent, TerminalUpdateEvent } from "../shared/types.js";
import { ApplicationError, type TerminalFrame } from "../shared/application-api.js";

type Screen = { terminal: Terminal; serializer: SerializeAddon; queue: Promise<void>; sequence: number };

export class TerminalState {
  private readonly screens = new Map<string, Screen>();
  private readonly owners = new Map<string, string>();
  constructor(private readonly core: CoreRuntime, private readonly emit: (channel: string, payload: unknown) => void) {
    core.on("terminalUpdate", this.onUpdate);
    core.on("terminalData", this.onData);
  }

  private readonly onUpdate = (event: TerminalUpdateEvent) => {
    if (event.reason === "closed") this.forget(event.session.id);
    if (event.reason === "created") this.register(event.session);
  };
  private readonly onData = (event: TerminalDataEvent) => {
    const screen = this.screens.get(event.sessionId);
    if (!screen) return; // Late output from a closed PTY must not recreate its screen.
    void this.enqueue(screen, async () => {
      await new Promise<void>((done) => screen.terminal.write(event.data, done));
      this.emit("terminal:data", { ...event, sequence: ++screen.sequence } satisfies TerminalFrame);
    }).catch((error) => console.error("Terminal screen:", error));
  };
  private enqueue(screen: Screen, action: () => void | Promise<void>): Promise<void> {
    const operation = screen.queue.then(action);
    // A failed attach/resize is reported to its caller without poisoning later output.
    screen.queue = operation.catch(() => {});
    return operation;
  }
  private screen(sessionId: string): Screen {
    const screen = this.screens.get(sessionId);
    if (!screen) throw new ApplicationError("UNKNOWN_TERMINAL", "Terminal session no longer exists", 404);
    return screen;
  }
  private snapshot(sessionId: string, screen: Screen): TerminalFrame {
    return { sessionId, stream: "stdout", data: screen.serializer.serialize({ scrollback: 2000 }), sequence: screen.sequence,
      reset: true, cols: screen.terminal.cols, rows: screen.terminal.rows };
  }
  register(session: TerminalSession): void {
    const terminal = new Xterm.Terminal({ cols: session.cols ?? 80, rows: session.rows ?? 24, scrollback: 2000, allowProposedApi: true });
    const serializer = new Serialization.SerializeAddon();
    terminal.loadAddon(serializer);
    // Only the host emulator answers terminal queries; observers only render output.
    terminal.onData((data) => { this.core.inputTerminal({ sessionId: session.id, data }); });
    this.screens.set(session.id, { terminal, serializer, queue: Promise.resolve(), sequence: 0 });
  }
  attach(sessionId: string, send: (frame: TerminalFrame) => void): Promise<void> {
    const screen = this.screen(sessionId);
    return this.enqueue(screen, () => send(this.snapshot(sessionId, screen)));
  }
  owner(sessionId: string): string | null { return this.owners.get(sessionId) ?? null; }
  claim(sessionId: string, clientId: string): { ownerId: string } {
    this.screen(sessionId);
    this.owners.set(sessionId, clientId);
    this.emit("terminal:control", { sessionId, ownerId: clientId });
    return { ownerId: clientId };
  }
  assertControl(sessionId: string, clientId: string): void {
    if (this.owner(sessionId) !== clientId) throw new ApplicationError("TERMINAL_OBSERVER", "This terminal is controlled by another connection. Take control to type or resize.", 409);
  }
  resize(sessionId: string, clientId: string, cols: number, rows: number): Promise<void> {
    this.assertControl(sessionId, clientId);
    const screen = this.screen(sessionId);
    return this.enqueue(screen, () => {
      this.assertControl(sessionId, clientId);
      if (!this.core.resizeTerminal({ sessionId, cols, rows })) throw new ApplicationError("TERMINAL_EXITED", "Terminal process has exited", 409);
      screen.terminal.resize(cols, rows);
      screen.sequence++;
      this.emit("terminal:data", this.snapshot(sessionId, screen));
    });
  }
  releaseClient(clientId: string): void {
    for (const [sessionId, owner] of this.owners) if (owner === clientId) {
      this.owners.delete(sessionId);
      this.emit("terminal:control", { sessionId, ownerId: null });
    }
  }
  forget(sessionId: string): void {
    const screen = this.screens.get(sessionId);
    if (screen) void screen.queue.then(() => screen.terminal.dispose());
    this.screens.delete(sessionId); this.owners.delete(sessionId);
  }
  async dispose(): Promise<void> {
    this.core.off("terminalUpdate", this.onUpdate); this.core.off("terminalData", this.onData);
    await Promise.all([...this.screens.values()].map((screen) => screen.queue));
    for (const screen of this.screens.values()) screen.terminal.dispose();
    this.screens.clear(); this.owners.clear();
  }
}
