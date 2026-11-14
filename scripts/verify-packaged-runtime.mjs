import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, realpath, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RuntimeClient } from "../dist-runtime/src/runtime/control-client.js";

const appPath = path.resolve(process.argv[2] ?? "release/mac-arm64/SharkBay.app");
const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "sharkbay-packaged-")));
const project = path.join(directory, "project"), data = path.join(directory, "runtime"), config = path.join(directory, "config.json");
await mkdir(project); await mkdir(path.join(directory, "electron"));
const env = { ...process.env }; for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[key];
execFileSync("git", ["-c", "init.templateDir=", "init", "--quiet", project], { env });
await writeFile(config, JSON.stringify({ configuredProjects: [project] }));
const desktop = spawn(path.join(appPath, "Contents/MacOS/SharkBay"), ["--disable-gpu"], { env: { ...env, SHARKBAY_RUNTIME_DATA_DIR: data, SHARKBAY_CONFIG_PATH: config, SHARKBAY_ELECTRON_DATA_DIR: path.join(directory, "electron") }, stdio: "ignore" });
const desktopExit = once(desktop, "exit");
let client, runtimePid, session, stopped = false;
async function until(read, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { const result = await read(); if (result) return result; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error(`Timed out: ${label}`);
}
try {
  client = await until(async () => { try { return await RuntimeClient.connect(data); } catch { return null; } }, "packaged runtime auto-start");
  const hello = await client.call("hello", { protocol: 1 }); runtimePid = hello.pid;
  const executable = execFileSync("ps", ["-p", String(runtimePid), "-o", "comm="], { encoding: "utf8" }).trim();
  assert.equal(executable, path.join(appPath, "Contents/Resources/runtime/bin/node"));
  assert.equal((await fetch(hello.origin)).status, 200);
  assert.deepEqual((await client.call("config.get")).configuredProjects, [project]);
  session = await client.call("terminal.create", { cwdUri: `local:${project}` });
  const frames = []; client.on("event", (name, payload) => { if (name === "terminal:data") frames.push(payload); });
  await client.call("terminal.attach", { sessionId: session.id });
  await client.call("terminal.input", { sessionId: session.id, data: "echo PACKAGED_PTY_OK\r" });
  await until(() => frames.some((frame) => frame.data.includes("PACKAGED_PTY_OK")), "packaged PTY output");
  desktop.kill("SIGKILL"); await Promise.race([desktopExit, new Promise((resolve) => setTimeout(resolve, 3000))]);
  assert.equal((await client.call("terminal.list"))[0].session.pid, session.pid);
  await client.call("stop"); stopped = true;
  await until(() => {
    const state = spawnSync("ps", ["-p", String(runtimePid), "-o", "stat="], { encoding: "utf8" });
    return state.status !== 0 || /[ZE]/.test(state.stdout.trim());
  }, "packaged runtime exit");
  await assert.rejects(RuntimeClient.connect(data));
  await assert.rejects(fetch(hello.origin, { signal: AbortSignal.timeout(2000) }));
  assert.throws(() => process.kill(session.pid, 0), { code: "ESRCH" });
  await assert.rejects(readFile(path.join(data, "runtime.lock")), { code: "ENOENT" });
  console.log("PACKAGED_RUNTIME_OK bundled Node auto-start, SQLite/config, static WebUI, actual PTY, desktop termination survival, explicit shutdown");
} catch (error) {
  console.error("Packaged runtime diagnostics:", (await readFile(path.join(data, "runtime.log"), "utf8").catch(() => "unavailable")).slice(-4000));
  if (runtimePid) console.error("Runtime process state:", execFileSync("ps", ["-p", String(runtimePid), "-o", "stat="], { encoding: "utf8" }).trim());
  throw error;
} finally {
  if (client) { if (!stopped) await Promise.race([client.call("stop").catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))]); client.dispose(); }
  if (desktop.exitCode === null && desktop.signalCode === null) desktop.kill("SIGKILL");
  desktop.unref();
  if (runtimePid) { try { process.kill(runtimePid, "SIGTERM"); } catch {} }
  await rm(directory, { recursive: true, force: true });
}
