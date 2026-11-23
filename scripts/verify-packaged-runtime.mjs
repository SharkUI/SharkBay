import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, realpath, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RuntimeClient } from "../dist-runtime/src/runtime/control-client.js";

const appPath = path.resolve(process.argv[2] ?? "release/mac-arm64/SharkBay.app");
const runtimeCli = path.resolve(process.argv[3] ?? "dist-runtime/src/server/cli.js");
const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "sharkbay-packaged-")));
const project = path.join(directory, "project"), data = path.join(directory, "runtime"), config = path.join(directory, "config.json");
await mkdir(project); await mkdir(path.join(directory, "electron"));
const env = { ...process.env }; for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[key];
execFileSync("git", ["-c", "init.templateDir=", "init", "--quiet", project], { env });
await writeFile(config, JSON.stringify({ configuredProjects: [project] }));
const runtime = spawn(process.env.SHARKBAY_TEST_NODE ?? process.execPath, [runtimeCli, "serve", "--background", "--port", "0", "--data-dir", data, "--config", config], { env, stdio: ["ignore", "ignore", "pipe"] });
const runtimeExit = once(runtime, "exit");
let diagnostic = "", desktop, client, session;
runtime.stderr.setEncoding("utf8").on("data", (chunk) => { diagnostic += chunk; });
async function until(read, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { const result = await read(); if (result) return result; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error(`Timed out: ${label}`);
}
try {
  await assert.rejects(readFile(path.join(appPath, "Contents/Resources/runtime/bin/node")), { code: "ENOENT" });
  client = await until(async () => { try { return await RuntimeClient.connect(data); } catch { return null; } }, "external runtime startup");
  const hello = await client.call("hello", { protocol: 1 });
  assert.equal(hello.pid, runtime.pid);
  desktop = spawn(path.join(appPath, "Contents/MacOS/SharkBay"), ["--disable-gpu"], {
    env: { ...env, SHARKBAY_RUNTIME_DATA_DIR: data, SHARKBAY_ELECTRON_DATA_DIR: path.join(directory, "electron") },
    stdio: "ignore",
  });
  const desktopExit = once(desktop, "exit");
  await until(async () => {
    const log = await readFile(path.join(directory, "electron/startup.log"), "utf8").catch(() => "");
    return log.includes("existing-runtime-connected") && log.includes("main-renderer-loaded");
  }, "packaged desktop connected and loaded");
  assert.equal((await fetch(hello.origin)).status, 200);
  assert.deepEqual((await client.call("config.get")).configuredProjects, [project]);
  session = await client.call("terminal.create", { cwdUri: `local:${project}` });
  const frames = []; client.on("event", (name, payload) => { if (name === "terminal:data") frames.push(payload); });
  await client.call("terminal.attach", { sessionId: session.id });
  await client.call("terminal.input", { sessionId: session.id, data: "echo PACKAGED_PTY_OK\r" });
  await until(() => frames.some((frame) => frame.data.includes("PACKAGED_PTY_OK")), "packaged PTY output");
  desktop.kill("SIGKILL"); await Promise.race([desktopExit, new Promise((resolve) => setTimeout(resolve, 3000))]);
  assert.equal((await client.call("terminal.list"))[0].session.pid, session.pid);
  await client.call("stop");
  const [code] = await runtimeExit;
  assert.equal(code, 0);
  await assert.rejects(RuntimeClient.connect(data));
  await assert.rejects(fetch(hello.origin, { signal: AbortSignal.timeout(2000) }));
  assert.throws(() => process.kill(session.pid, 0), { code: "ESRCH" });
  await assert.rejects(readFile(path.join(data, "runtime.lock")), { code: "ENOENT" });
  console.log("PACKAGED_RUNTIME_OK external Node, desktop connection, SQLite/config, WebUI, actual PTY, desktop termination survival, explicit shutdown");
} catch (error) {
  console.error("Runtime diagnostics:", diagnostic.slice(-4000));
  console.error("Desktop diagnostics:", (await readFile(path.join(directory, "electron/startup.log"), "utf8").catch(() => "")).slice(-4000));
  throw error;
} finally {
  client?.dispose();
  if (desktop && desktop.exitCode === null && desktop.signalCode === null) desktop.kill("SIGKILL");
  if (runtime.exitCode === null && runtime.signalCode === null) { runtime.kill("SIGTERM"); await runtimeExit; }
  await rm(directory, { recursive: true, force: true });
}
