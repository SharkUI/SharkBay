import { EventEmitter, once } from "node:events";
import { request } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { expect, it, vi } from "vitest";
import { createWebServer } from "../src/server/http-server.js";
import { SessionAuth } from "../src/server/session-auth.js";
import type { ApplicationRuntime } from "../src/runtime/application-runtime.js";

it("allows direct local HTTP and WS without cookies while preserving request checks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sharkbay-direct-server-"));
  await writeFile(path.join(root, "index.html"), "<html>fixture</html>");
  const runtime = Object.assign(new EventEmitter(), { execute: vi.fn(async () => ({ fixture: true })), terminals: { releaseClient: vi.fn() } });
  const server = await createWebServer(runtime as unknown as ApplicationRuntime, { port: 0, staticRoot: root });
  let socket: WebSocket | undefined;
  try {
    const origin = server.origin;
    const response = await fetch(`${origin}/api/capabilities`);
    expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toBeNull();
    socket = new WebSocket(`${origin.replace("http:", "ws:")}/api/events`, { origin });
    const hello = once(socket, "message"); await once(socket, "open");
    const clientId = JSON.parse((await hello)[0].toString()).clientId;
    const command = (requestOrigin: string) => fetch(`${origin}/api/command`, {
      method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json", "x-sharkbay-request": "1", "x-sharkbay-client": clientId },
      body: JSON.stringify({ requestId: "direct-request-1", method: "fixture" }),
    });
    expect((await command("https://untrusted.example")).status).toBe(403);
    expect((await command(origin)).status).toBe(200);
    server.revoke();
    expect((await command(origin)).status).toBe(200);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(runtime.execute).toHaveBeenCalledOnce();
  } finally { socket?.terminate(); await server.dispose(); await rm(root, { recursive: true, force: true }); }
});

it("requires grants and enforces in-flight revocation for modeled public peers", async () => {
  // The transport uses loopback; model a public TCP peer at the authentication boundary.
  const originalAuthenticate = SessionAuth.prototype.authenticate;
  const authenticatePublic = function (this: SessionAuth, cookie: string | undefined) { return originalAuthenticate.call(this, cookie, "203.0.113.1"); };
  const peer = vi.spyOn(SessionAuth.prototype, "authenticate").mockImplementation(authenticatePublic);
  const root = await mkdtemp(path.join(os.tmpdir(), "sharkbay-auth-server-"));
  await writeFile(path.join(root, "index.html"), "<html>fixture</html>");
  const runtime = Object.assign(new EventEmitter(), {
    execute: vi.fn(async () => ({ fixture: true })),
    requireTerminal: vi.fn(async (_sessionId: string) => {}),
    core: { inputTerminal: vi.fn() },
    terminals: { releaseClient: vi.fn(), assertControl: vi.fn() },
  });
  const server = await createWebServer(runtime as unknown as ApplicationRuntime, { port: 0, staticRoot: root });
  let socket: WebSocket | undefined;
  try {
    const origin = server.origin;
    expect((await fetch(`${origin}/api/capabilities`)).status).toBe(401);
    const denied = new WebSocket(`${origin.replace("http:", "ws:")}/api/events`, { origin });
    await expect(once(denied, "open")).rejects.toThrow(/403/);
    const connect = server.connectionUrl();
    const token = new URLSearchParams(new URL(connect).hash.slice(1)).get("connect");
    const exchange = () => fetch(`${origin}/api/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const response = await exchange();
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    expect((await exchange()).status).toBe(401);
    expect((await fetch(`${origin}/api/capabilities`, { headers: { Cookie: cookie } })).status).toBe(200);
    socket = new WebSocket(`${origin.replace("http:", "ws:")}/api/events`, { origin, headers: { Cookie: cookie } });
    const hello = once(socket, "message");
    await once(socket, "open");
    const clientId = JSON.parse((await hello)[0].toString()).clientId;
    const command = await fetch(`${origin}/api/command`, {
      method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json", "x-sharkbay-request": "1", "x-sharkbay-client": clientId },
      body: JSON.stringify({ requestId: "fixture-request-1", method: "fixture", input: {} }),
    });
    expect(command.status).toBe(200);
    expect(runtime.execute).toHaveBeenCalledOnce();
    let releaseTerminal!: () => void;
    let terminalEntered!: () => void;
    const terminalGate = new Promise<void>(resolve => { terminalEntered = resolve; });
    runtime.requireTerminal.mockImplementationOnce(() => {
      terminalEntered();
      return new Promise<void>(resolve => { releaseTerminal = resolve; });
    });
    socket.send(JSON.stringify({ type: "input", sessionId: "fixture-terminal", data: "test" }));
    await terminalGate;
    // Revoke after authentication but before the command body finishes arriving.
    let authenticated!: () => void;
    const reachedBody = new Promise<void>(resolve => { authenticated = resolve; });
    peer.mockImplementation(function (this: SessionAuth, value) {
      const result = authenticatePublic.call(this, value);
      authenticated();
      return result;
    });
    const slow = request(`${origin}/api/command`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json", "x-sharkbay-request": "1", "x-sharkbay-client": clientId } });
    const slowResponse = new Promise<number>(resolve => slow.on("response", res => { res.resume(); resolve(res.statusCode!); }));
    slow.write('{"requestId":"slow-request-1",');
    await reachedBody;
    peer.mockImplementation(authenticatePublic);
    const pendingToken = new URLSearchParams(new URL(server.connectionUrl()).hash.slice(1)).get("connect");
    const closed = once(socket, "close");
    server.revoke();
    releaseTerminal();
    slow.end('"method":"fixture","input":{}}');
    expect(await slowResponse).toBe(401);
    expect((await closed)[0]).toBe(4001);
    expect((await fetch(`${origin}/api/capabilities`, { headers: { Cookie: cookie } })).status).toBe(401);
    expect((await fetch(`${origin}/api/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ token: pendingToken }) })).status).toBe(401);
    expect(runtime.execute).toHaveBeenCalledOnce();
    expect(runtime.core.inputTerminal).not.toHaveBeenCalled();
  } finally {
    socket?.terminate();
    await server.dispose();
    await rm(root, { recursive: true, force: true });
    peer.mockRestore();
  }
});
