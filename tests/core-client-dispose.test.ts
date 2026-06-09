import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

// CoreClient imports utilityProcess from electron at module load; the dispose
// path under test never touches it, but the import must resolve.
vi.mock("electron", () => ({ utilityProcess: { fork: vi.fn() } }));

import { CoreClient } from "../electron/core-client.js";
import type { CoreMessage, CoreRequestMessage } from "../src/core/core-protocol.js";

/** Fake UtilityProcess that auto-acknowledges requests so call() resolves. */
class FakeChild extends EventEmitter {
  readonly sent: CoreRequestMessage[] = [];
  killed = false;

  postMessage(message: CoreRequestMessage): void {
    this.sent.push(message);
    // Respond on the next tick so call() resolves.
    setImmediate(() => {
      this.emit("message", { kind: "response", id: message.id, ok: true, result: undefined } as CoreMessage);
    });
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

async function makeReadyClient(): Promise<{ client: CoreClient; child: FakeChild }> {
  const child = new FakeChild();
  const client = new CoreClient(child as never);
  // Emit the ready handshake the constructor awaits.
  child.emit("message", { kind: "ready" } as CoreMessage);
  await client.ready();
  return { client, child };
}

describe("CoreClient.dispose", () => {
  it("cancels CodeGraph jobs and closes terminals before killing core", async () => {
    const { client, child } = await makeReadyClient();

    await client.dispose();

    const methods = child.sent.map((m) => m.method);
    expect(methods).toEqual(["cancelAllCodeGraphJobs", "closeAllTerminalSessions"]);
    // Core is only killed after the cleanup calls were sent.
    expect(child.killed).toBe(true);
  });

  it("is idempotent and does not send cleanup twice", async () => {
    const { client, child } = await makeReadyClient();

    await client.dispose();
    await client.dispose();

    expect(child.sent.map((m) => m.method)).toEqual(["cancelAllCodeGraphJobs", "closeAllTerminalSessions"]);
  });
});
