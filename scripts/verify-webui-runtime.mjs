import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, realpath, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
const directory = await realpath(await mkdtemp(path.join(tmpdir(), "sharkbay-node-web-")));
const env = { ...process.env };
for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[key];
const project = path.join(directory, "project"); await mkdir(project);
execFileSync("git", ["-c", "init.templateDir=", "init", "--quiet", project], { env });
const config = path.join(directory, "config.json");
await writeFile(config, JSON.stringify({ configuredProjects: [] }));
const child = spawn(process.execPath, ["dist-runtime/src/server/main.js", "--port", "0", "--data-dir", path.join(directory, "data"), "--config", config, "--project", project], { env, stdio: ["pipe", "pipe", "pipe"] });
let output = "", failure = "", socket, session;
child.stdout.on("data", (data) => { output += data; });
child.stderr.on("data", (data) => { failure += data; });
const exited = once(child, "exit");
async function until(read) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { const result = read(); if (result) return result; await new Promise((resolve) => setTimeout(resolve, 20)); }
  throw new Error(`Compiled Web runtime check timed out. ${failure.slice(0, 1000)}`);
}
try {
  const link = await until(() => output.match(/http:\/\/127\.0\.0\.1:\d+\/#connect=[A-Za-z0-9_-]+/)?.[0]);
  const url = new URL(link), origin = url.origin;
  const index = await fetch(origin); assert.equal(index.status, 200);
  const html = await index.text(); const asset = html.match(/src="([^"]+\.js)"/)?.[1]; assert.ok(asset); assert.equal((await fetch(new URL(asset, origin))).status, 200);
  const exchange = await fetch(`${origin}/api/session`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ token: new URLSearchParams(url.hash.slice(1)).get("connect") }) });
  assert.equal(exchange.status, 200); const cookie = exchange.headers.get("set-cookie").split(";")[0];
  socket = new WebSocket(origin.replace("http:", "ws:") + "/api/events", { headers: { Origin: origin, Cookie: cookie } });
  const messages = []; socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  const hello = await until(() => messages.find((message) => message.type === "hello"));
  for (const method of ["config.get", "projects.scan"]) {
    const check = await fetch(`${origin}/api/command`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json", "X-SharkBay-Request": "1", "X-SharkBay-Client": hello.clientId }, body: JSON.stringify({ requestId: `verify-${method.replaceAll(".", "-")}`, method }) });
    const result = await check.json(); assert.equal(result.ok, true, JSON.stringify(result));
    if (method === "config.get") assert.deepEqual(result.result.configuredProjects, [project]);
    else assert.equal(result.result.candidates.length, 1);
  }
  const response = await fetch(`${origin}/api/command`, { method: "POST", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json", "X-SharkBay-Request": "1", "X-SharkBay-Client": hello.clientId }, body: JSON.stringify({ requestId: "compiled-runtime-terminal", method: "terminal.create", input: { cwdUri: `local:${project}` } }) });
  const result = await response.json(); assert.equal(result.ok, true); session = result.result;
  socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
  await until(() => messages.find((message) => message.payload?.reset));
  socket.send(JSON.stringify({ type: "input", sessionId: session.id, data: "printf '%s%s\\n' 'compiled-web-' 'ok'\r" }));
  await until(() => messages.find((message) => message.name === "terminal:data" && message.payload.data.includes("compiled-web-ok")));
  console.log("NODE_WEBUI_OK compiled CLI, static assets, authorization, WS and actual PTY output");
  socket.terminate(); child.kill("SIGTERM");
  const [code] = await exited; assert.equal(code, 0);
  assert.throws(() => process.kill(session.pid, 0), { code: "ESRCH" });
  await assert.rejects(readFile(path.join(directory, "data/runtime.lock")), { code: "ENOENT" });
  console.log("NODE_WEBUI_SHUTDOWN_OK process exited; PTY and profile lock released");
} finally {
  socket?.terminate();
  if (child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await exited; }
  await rm(directory, { recursive: true, force: true });
}
