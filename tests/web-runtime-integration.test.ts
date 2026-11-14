import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm, writeFile, symlink, readFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";
import { createWebBridge } from "../src/renderer/bridge/web-bridge.js";
import { RuntimeClient, runtimeControlPath } from "../src/runtime/control-client.js";
import { createRuntimeControl } from "../src/runtime/control-server.js";
import { ApplicationRuntime } from "../src/runtime/application-runtime.js";
import { createWebServer } from "../src/server/http-server.js";
import { createDefaultConfig, saveAppConfig } from "../src/main/config.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";

type Message = { type: string; clientId?: string; name?: string; code?: string; payload?: any };
type Browser = { socket: WebSocket; clientId: string; cookie: string; messages: Message[] };
let directory: string, project: string, uri: string;
let runtime: ApplicationRuntime;
let server: Awaited<ReturnType<typeof createWebServer>>;
let control: Awaited<ReturnType<typeof createRuntimeControl>>;
const desktops: RuntimeClient[] = [];
const browsers: Browser[] = [];
async function waitFor<T>(read: () => T | undefined, timeout = 5000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = read(); if (result !== undefined) return result; await new Promise((done) => setTimeout(done, 20)); }
  throw new Error("Timed out waiting for runtime event");
}
async function connect(): Promise<Browser> {
  const token = new URLSearchParams(new URL(server.connectionUrl()).hash.slice(1)).get("connect");
  const exchange = await fetch(`${server.origin}/api/session`, { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  expect(exchange.status).toBe(200);
  expect(exchange.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict/);
  const cookie = exchange.headers.get("set-cookie")!.split(";")[0]!;
  const socket = new WebSocket(server.origin.replace("http:", "ws:") + "/api/events", { headers: { Origin: server.origin, Cookie: cookie } });
  const messages: Message[] = [];
  socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  const hello = await waitFor(() => messages.find((message) => message.type === "hello"));
  const browser = { socket, messages, cookie, clientId: hello.clientId! }; browsers.push(browser); return browser;
}
async function command(browser: Browser, method: string, input?: unknown, requestId = randomUUID()) {
  const response = await fetch(`${server.origin}/api/command`, { method: "POST", headers: { Origin: server.origin, Cookie: browser.cookie, "Content-Type": "application/json", "X-SharkBay-Request": "1", "X-SharkBay-Client": browser.clientId }, body: JSON.stringify({ requestId, method, input }) });
  return { status: response.status, ...(await response.json()) };
}
beforeAll(async () => {
  directory = await realpath(await mkdtemp(path.join(tmpdir(), "sharkbay-web-e2e-")));
  project = path.join(directory, "project"); await mkdir(project); uri = toLocalProjectUri(project);
  const gitEnv = { ...process.env }; for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete gitEnv[key];
  execFileSync("git", ["-c", "init.templateDir=", "init", "--quiet", project], { env: gitEnv });
  const staticRoot = path.join(directory, "static"); await mkdir(staticRoot); await writeFile(path.join(staticRoot, "index.html"), "<h1>SharkBay</h1>");
  await writeFile(path.join(project, "hello.txt"), "before");
  await writeFile(path.join(project, "artifact.html"), "<script>fetch('/api/command')</script><h1>Artifact</h1>");
  await writeFile(path.join(directory, "private.txt"), "outside"); await symlink(path.join(directory, "private.txt"), path.join(project, "outside-link"));
  const configPath = path.join(directory, "config.json");
  await saveAppConfig({ ...createDefaultConfig(), configuredProjects: [project] }, configPath);
  runtime = new ApplicationRuntime({ userDataPath: path.join(directory, "data"), configPath }); await runtime.start();
  server = await createWebServer(runtime, { port: 0, staticRoot });
  control = await createRuntimeControl(runtime, server);
}, 15000);
afterAll(async () => {
  for (const browser of browsers) browser.socket.terminate();
  for (const desktop of desktops) desktop.dispose();
  await control?.dispose();
  await server?.dispose(); await runtime?.dispose(); await rm(directory, { recursive: true, force: true });
});
describe("local Web runtime end to end", () => {
  it("shares one actual PTY between the desktop transport and browser without tying it to client lifetime", async () => {
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(desktop);
    const hello = await desktop.call("hello", { protocol: 1 }); expect(hello.pid).toBe(process.pid);
    await expect(desktop.call("hello", { protocol: 99 })).rejects.toThrow("Incompatible");
    const session = await desktop.call("terminal.create", { cwdUri: uri, cols: 90, rows: 25 });
    const browser = await connect();
    expect((await command(browser, "terminal.list")).result.find((entry: any) => entry.session.id === session.id).session.pid).toBe(session.pid);
    const frames: any[] = []; desktop.on("event", (name, frame) => { if (name === "terminal:data") frames.push(frame); });
    await desktop.call("terminal.attach", { sessionId: session.id });
    expect(frames.some((frame) => frame.reset && frame.sessionId === session.id)).toBe(true);
    expect((await command(browser, "terminal.input", { sessionId: session.id, data: "echo SHOULD_NOT_RUN\r" })).status).toBe(409);
    expect((await command(browser, "terminal.claim", { sessionId: session.id })).ok).toBe(true);
    await expect(desktop.call("terminal.input", { sessionId: session.id, data: "echo SHOULD_NOT_RUN\r" })).rejects.toThrow("controlled");
    desktop.dispose();
    const marker = `CLIENT_LIFETIME_${randomUUID().slice(0, 8)}`;
    browser.socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    expect((await command(browser, "terminal.input", { sessionId: session.id, data: `printf '${marker}\\n'\r` })).ok).toBe(true);
    await waitFor(() => browser.messages.find((message) => message.name === "terminal:data" && message.payload?.data.includes(marker)));
    const reconnect = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(reconnect);
    expect((await reconnect.call("terminal.list")).find((entry: any) => entry.session.id === session.id).session.pid).toBe(session.pid);
    await reconnect.call("terminal.claim", { sessionId: session.id });
    await reconnect.call("terminal.close", { sessionId: session.id });
  });
  it("discovers a canonical profile alias and rejects non-private local endpoints", async () => {
    const alias = path.join(directory, "profile-alias"); await symlink(runtime.paths.userDataPath, alias);
    const desktop = await RuntimeClient.connect(alias); desktops.push(desktop);
    expect((await desktop.call("hello", { protocol: 1 })).pid).toBe(process.pid);
    const socketDirectory = path.dirname(runtimeControlPath(await realpath(runtime.paths.userDataPath)));
    try {
      await chmod(socketDirectory, 0o755);
      await expect(RuntimeClient.connect(runtime.paths.userDataPath)).rejects.toThrow("privately");
    } finally { await chmod(socketDirectory, 0o700); }
  });
  it("keeps host administration off the network command endpoint", async () => {
    const browser = await connect();
    expect((await command(browser, "config.addProject", { path: directory })).status).toBe(404);
    expect((await command(browser, "desktop.sessions")).status).toBe(404);
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(desktop);
    expect((await desktop.call("config.get")).caffeinateMode).toBe("auto");
    expect((await desktop.call("config.setCaffeinateMode", { mode: "off" })).caffeinateMode).toBe("off");
    expect((await command(browser, "config.get")).result.caffeinateMode).toBe("off");
    await Promise.all([
      desktop.call("config.setCaffeinateMode", { mode: "on" }),
      command(browser, "config.renameProject", { uri, name: "Shared fixture" }),
    ]);
    const saved = await desktop.call("config.get");
    expect(saved.caffeinateMode).toBe("on"); expect(saved.projectAliases[uri]).toBe("Shared fixture");
  });
  it("protects HTTP/WS, Host, Origin and command envelopes", async () => {
    expect((await fetch(server.origin)).status).toBe(200);
    expect((await fetch(`${server.origin}/api/capabilities`)).status).toBe(401);
    const wrongHost = await new Promise<number>((done) => { http.get(server.origin, { headers: { Host: "attacker.invalid" } }, (response) => { response.resume(); done(response.statusCode!); }); });
    expect(wrongHost).toBe(403);
    expect((await fetch(`${server.origin}/api/session`, { method: "POST", headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    const rejected = new WebSocket(server.origin.replace("http:", "ws:") + "/api/events", { origin: server.origin });
    const status = await new Promise<number>((done) => { rejected.on("unexpected-response", (_request, response) => { response.resume(); rejected.terminate(); done(response.statusCode!); }); rejected.on("error", () => {}); });
    expect(status).toBe(403);
    const browser = await connect();
    expect((await fetch(`${server.origin}/api/command`, { method: "POST", headers: { Cookie: browser.cookie, Origin: server.origin, "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    expect((await command(browser, "cancelAllCodeGraphJobs")).status).toBe(404);
    expect((await command(browser, "terminal.create", { cwdUri: uri, configPath: "/tmp/injected" })).status).toBe(400);
  });
  it("reads actual projects/tasks/files, writes inside the project and isolates artifacts", async () => {
    const browser = await connect();
    const scan = await command(browser, "projects.scan"); expect(scan.ok).toBe(true); expect(scan.result.candidates.some((candidate: any) => candidate.uri === uri)).toBe(true);
    expect((await command(browser, "projects.getDetail", { projectUri: uri })).ok).toBe(true);
    expect((await command(browser, "protocol.getTasks", { repoPath: project })).result).toEqual([]);
    expect((await command(browser, "projects.readFile", { projectUri: uri, relativePath: "hello.txt" })).result.content).toBe("before");
    expect((await command(browser, "projects.writeFile", { projectUri: uri, relativePath: "hello.txt", content: "after" })).result.ok).toBe(true);
    expect(await readFile(path.join(project, "hello.txt"), "utf8")).toBe("after");
    expect((await command(browser, "projects.readFile", { projectUri: uri, relativePath: "../private.txt" })).result?.ok).not.toBe(true);
    expect((await command(browser, "projects.readFile", { projectUri: uri, relativePath: "outside-link" })).result?.ok).not.toBe(true);
    expect((await command(browser, "protocol.getTasks", { repoPath: directory })).ok).toBe(false);
    const preview = await fetch(`${server.origin}/api/preview?url=${encodeURIComponent(pathToFileURL(path.join(project, "artifact.html")).href)}`, { headers: { Cookie: browser.cookie } });
    expect(preview.status).toBe(200); expect(preview.headers.get("content-security-policy")).toContain("sandbox allow-scripts;"); expect(preview.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    expect(preview.headers.get("content-security-policy")).toContain("connect-src 'none'");
  });
  it("runs the real Web bridge through authorization, snapshots and reauthorization", async () => {
    const nativeFetch = globalThis.fetch;
    const location = new URL(server.connectionUrl());
    let cookie = "";
    const sockets: WebSocket[] = [];
    class BrowserSocket extends WebSocket {
      constructor(url: string) { super(url, { headers: { Origin: server.origin, Cookie: cookie } }); sockets.push(this); }
    }
    const window = new EventTarget();
    vi.stubGlobal("window", window); vi.stubGlobal("location", location);
    vi.stubGlobal("history", { replaceState: (_state: unknown, _title: string, url: string) => { location.href = new URL(url, server.origin).href; } });
    vi.stubGlobal("WebSocket", BrowserSocket);
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers); headers.set("Origin", server.origin);
      if (cookie) headers.set("Cookie", cookie);
      const response = await nativeFetch(new URL(input, server.origin), { ...init, headers });
      const next = response.headers.get("set-cookie"); if (next) cookie = next.split(";")[0]!;
      return response;
    });
    let bridge: Awaited<ReturnType<typeof createWebBridge>> | undefined;
    try {
      bridge = await createWebBridge(); expect(location.hash).toBe(""); expect(bridge.runtime.connection()).toBe("connected");
      const frames: Array<{ data: string; reset?: boolean }> = [];
      const off = bridge.terminal!.onData!((event) => frames.push(event));
      const session = await bridge.terminal!.create!({ cwdUri: uri }); bridge.runtime.attachTerminal(session.id);
      await waitFor(() => frames.find((frame) => frame.reset)); expect(bridge.runtime.canControl(session.id)).toBe(true);
      bridge.terminal!.inputFire!({ sessionId: session.id, data: "printf '%s%s\\n' 'web-bridge-' 'ok'\r" });
      await waitFor(() => frames.find((frame) => frame.data.includes("web-bridge-ok")));
      server.revoke(); await waitFor(() => bridge!.runtime.connection() === "unauthorized" ? true : undefined);
      const notices: string[] = []; const offNotice = bridge.runtime.onNotice((notice) => notices.push(notice));
      bridge.terminal!.inputFire!({ sessionId: session.id, data: "do not replay" }); expect(notices).toHaveLength(1);
      location.href = server.connectionUrl(); window.dispatchEvent(new Event("hashchange"));
      await waitFor(() => bridge!.runtime.connection() === "connected" ? true : undefined);
      const terminals = await bridge.runtime.listTerminals(); expect(terminals).toHaveLength(1); expect(terminals[0]!.session.pid).toBe(session.pid);
      await bridge.terminal!.close!({ sessionId: session.id }); off(); offNotice();
    } finally { bridge?.runtime.dispose(); for (const socket of sockets) socket.terminate(); vi.unstubAllGlobals(); }
  }, 10000);
  it("derives Artifact task metadata on the host without accepting client paths", async () => {
    const browser = await connect();
    const taskId = "B9R4N2-u3960864-m464da1";
    await mkdir(path.join(project, ".sharkbay/tasks"), { recursive: true });
    await writeFile(path.join(project, ".sharkbay/tasks", `${taskId}-fixture.md`), `---\nkind: sharkbay_task\ntaskId: ${taskId}\ntaskTag: B9R4N2\nmode: task\ntitle: Artifact fixture\nstatus: active\nactor: SharkUI\ngithubUserId: 3960864\nmachine: 464da1\nagent: Fixture Agent\ncreatedAt: 2026-11-13T00:00:00Z\nupdatedAt: 2026-11-13T00:00:00Z\n---\n\n## Summary\nFixture\n`);
    const original = runtime.core.createTerminal.bind(runtime.core);
    let captured: import("../src/shared/types.js").TerminalCreateInput;
    const listSpy = vi.spyOn(runtime.core, "listAgentClis").mockResolvedValue([{ id: "fixture", command: "/bin/sh", label: "Fixture", executablePath: "/bin/sh" }] as never);
    const createSpy = vi.spyOn(runtime.core, "createTerminal").mockImplementation(async (_paths, input) => {
      captured = input;
      // Use a real shell without submitting a fixture prompt to a model.
      return original(runtime.paths, { cwdUri: uri });
    });
    try {
      expect((await command(browser, "artifacts.start", { repoPath: project, taskId, agentId: "fixture", artifactPath: "/tmp/injected" })).status).toBe(400);
      const result = await command(browser, "artifacts.start", { repoPath: project, taskId, agentId: "fixture" });
      expect(result.ok).toBe(true); expect(captured!.artifact!.taskId).toBe(taskId); expect(captured!.artifact!.sourcePath).toBe(`.sharkbay/tasks/${taskId}-fixture.md`);
      expect(captured!.artifact!.artifactPath!.startsWith(".sharkbay/artifacts/")).toBe(true);
      expect(captured!.artifact!.completionToken).toBeUndefined();
      expect((await command(browser, "terminal.close", { sessionId: result.result.id })).ok).toBe(true);
      await waitFor(() => browser.messages.find((message) => message.name === "terminal:update" && message.payload.reason === "closed"));
    } finally { listSpy.mockRestore(); createSpy.mockRestore(); }
  });
  it("deduplicates terminal creation, restores the same PTY, transfers control and cleans up", async () => {
    const owner = await connect(); const requestId = randomUUID();
    const input = { cwdUri: uri, title: "Web runtime probe", cols: 100, rows: 30 };
    const [first, repeated] = await Promise.all([command(owner, "terminal.create", input, requestId), command(owner, "terminal.create", input, requestId)]);
    expect(first.ok).toBe(true); expect(repeated.result.id).toBe(first.result.id);
    expect((await command(owner, "terminal.create", { ...input, title: "different" }, requestId)).status).toBe(409);
    const session = first.result; expect(session.pid).toBeGreaterThan(0);
    owner.socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    await waitFor(() => owner.messages.find((m) => m.name === "terminal:data" && m.payload.reset));
    owner.socket.send(JSON.stringify({ type: "input", sessionId: session.id, data: "printf '%s%s\\n' 'web-runtime-' 'ok'\r" }));
    await waitFor(() => owner.messages.find((m) => m.name === "terminal:data" && m.payload.data.includes("web-runtime-ok")));
    const observer = await connect(); observer.socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    const snapshot = await waitFor(() => observer.messages.find((m) => m.name === "terminal:data" && m.payload.reset));
    expect(snapshot.payload.data).toContain("web-runtime-ok"); expect(snapshot.payload.cols).toBe(100);
    expect((await command(observer, "terminal.resize", { sessionId: session.id, cols: 80, rows: 24 })).status).toBe(409);
    expect((await command(observer, "terminal.claim", { sessionId: session.id })).ok).toBe(true);
    expect((await command(owner, "terminal.input", { sessionId: session.id, data: "bad" })).status).toBe(409);
    expect((await command(observer, "terminal.resize", { sessionId: session.id, cols: 80, rows: 24 })).ok).toBe(true);
    observer.socket.close(); await waitFor(() => observer.socket.readyState === WebSocket.CLOSED ? true : undefined);
    const reconnect = await connect(); reconnect.socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    const restored = await waitFor(() => reconnect.messages.find((m) => m.name === "terminal:data" && m.payload.reset));
    expect(restored.payload.cols).toBe(80);
    const sessions = (await command(reconnect, "terminal.list")).result;
    expect(sessions).toHaveLength(1); expect(sessions[0].session.pid).toBe(session.pid);
    expect(() => process.kill(session.pid, 0)).not.toThrow();
    server.revoke();
    expect((await fetch(`${server.origin}/api/capabilities`, { headers: { Cookie: reconnect.cookie } })).status).toBe(401);
    const create = runtime.core.createTerminal.bind(runtime.core);
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const spy = vi.spyOn(runtime.core, "createTerminal").mockImplementation(async (paths, input) => { await gate; return create(paths, input); });
    const pending = runtime.execute("terminal.create", { cwdUri: uri }, "shutdown-probe") as Promise<import("../src/shared/types.js").TerminalSession>;
    let stopped = false;
    const stopping = runtime.dispose().then(() => { stopped = true; });
    await expect(runtime.execute("terminal.list", undefined, "shutdown-probe")).rejects.toThrow(/not ready/);
    await new Promise((done) => setTimeout(done, 20)); expect(stopped).toBe(false);
    release(); const late = await pending; await stopping; spy.mockRestore();
    expect(() => process.kill(late.pid!, 0)).toThrow();
    expect(() => process.kill(session.pid, 0)).toThrow();
    await expect(readFile(path.join(directory, "data", "runtime.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 15000);
});
