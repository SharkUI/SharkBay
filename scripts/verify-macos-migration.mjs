import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { RuntimeClient } from "../dist-runtime/src/runtime/control-client.js";
import { createDefaultConfig } from "../dist-runtime/src/main/config.js";
import { changeRegisteredMacRuntimeService, installMigrationService, macRuntimeServicePid } from "../dist-runtime/src/runtime/mac-runtime-service.js";
import { readRuntimeMigration } from "../dist-runtime/src/runtime/migration-state.js";

const args = process.argv.slice(2);
const adoptionOnly = args.includes("--adopt-standalone");
const input = JSON.parse(await readFile(args.find((arg) => arg !== "--adopt-standalone") ?? "release/desktop-migration-qa/single-repo-inputs.json", "utf8"));
const { qa, owner, repo } = input;
assert(qa && /^SharkBay [A-Za-z0-9 -]+$/.test(qa.name) && /^xyz\.sharkbay\.runtime\.[a-z0-9-]+$/.test(qa.serviceLabel)
  && /^127\.0\.0\.1:[1-9]\d{0,4}$/.test(qa.host), "Use an isolated loopback QA configuration");
const directory = path.resolve("release/desktop-migration-single-repo-qa");
const preferences = path.join(homedir(), "Library", "Application Support", qa.name);
const profile = path.join(preferences, "qa-runtime");
const recordFile = path.join(preferences, "runtime-migration", "profile.json");
const plist = path.join(homedir(), "Library", "LaunchAgents", qa.serviceLabel + ".plist");
const debug = 18574;
const [host, feedPort] = qa.host.split(":");
const archive = path.resolve("release/sharkbay-runtime-1.0.0-macos-arm64.tar.gz");
const requestLog = [];
const old = { tag: "v0.3.14", directory: path.join(directory, "bridge") };
const next = { tag: "v1.0.0", directory: path.join(directory, "1.0") };
const releasesPath = `/${owner}/${repo}/releases`;
let latest = next;
const releaseAsset = (release, name) => `${releasesPath}/download/${release.tag}/${name}`;
const fetched = (release, name) => requestLog.some(([, request]) => request === releaseAsset(release, name));
assert.deepEqual(await readFile(path.join(old.directory, "latest-mac.yml")), await readFile(path.join(old.directory, "desktop-mac.yml")));
await assert.rejects(access(path.join(next.directory, "latest-mac.yml")), { code: "ENOENT" });
const routes = new Map();
for (const release of [old, next]) {
  for (const file of await readdir(release.directory)) {
    if (!["latest-mac.yml", "desktop-mac.yml"].includes(file) && !file.includes(".zip")) continue;
    routes.set(releaseAsset(release, file.replaceAll(" ", "-")), path.join(release.directory, file));
  }
}
routes.set("/runtime.tar.gz", archive);
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    requestLog.push([req.method, pathname, req.headers.range]);
    if (pathname === `${releasesPath}.atom`) {
      res.writeHead(200, { "Content-Type": "application/atom+xml" });
      const releases = latest === next ? [next, old] : [old];
      const entries = releases.map(({ tag }) => `<entry><link href="https://${qa.host}${releasesPath}/tag/${tag}"/><title>${tag}</title><content>Signed QA release</content></entry>`);
      res.end(`<?xml version="1.0"?><feed>${entries.join("")}</feed>`);
      return;
    }
    if (pathname === `/api/v3/repos${releasesPath}/latest`) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tag_name: latest.tag })); return;
    }
    if (latest === old && pathname.startsWith(releaseAsset(next, ""))) {
      res.writeHead(404).end(); return;
    }
    const file = routes.get(pathname);
    if (!file) { res.writeHead(404).end(); return; }
    const { size } = await stat(file);
    const range = req.headers.range && /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end) { res.writeHead(416).end(); return; }
    res.writeHead(range ? 206 : 200, {
      "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
      "Content-Type": "application/octet-stream", ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(file, { start, end }).pipe(res);
  } catch (error) { console.error(error); res.destroy(); }
});
const accessible = async (file) => access(file).then(() => true, () => false);
assert(!(await accessible(preferences)), `QA preferences already exist: ${preferences}`);
assert(!(await accessible(plist)), "QA service already exists");
const workspace = await realpath(await mkdtemp(path.join(tmpdir(), "sharkbay-migration-chain-")));
const project = path.join(workspace, "project");
const app = path.join(workspace, qa.name + ".app");
const executable = path.join(app, "Contents", "MacOS", qa.name);
const installedVersion = () => execFileSync("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", path.join(app, "Contents", "Info.plist")], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
let child, client;
const appPids = () => execFileSync("/bin/ps", ["-axo", "pid=,comm="], { encoding: "utf8" }).split("\n")
  .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line)).filter((line) => line && (line[2] === executable || line[2] === qa.name)).map((line) => Number(line[1]));
async function stopDesktop() {
  for (const pid of appPids()) process.kill(pid, "SIGTERM");
  await delay(700);
  for (const pid of appPids()) process.kill(pid, "SIGKILL");
}
function quitDesktop(pid) {
  const result = execFileSync("/usr/bin/osascript", ["-l", "JavaScript", "-e", `
    ObjC.import('AppKit');
    function run(args) {
      return $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(args[0])).terminate;
    }
  `, String(pid)], { encoding: "utf8" });
  assert.equal(result.trim(), "true", "The QA Desktop should accept a normal quit");
}
let cleanupSignal = false;
async function until(label, fn, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let detail;
  while (Date.now() < deadline) {
    try { const result = await fn(); if (result) return result; } catch (error) { detail = error; }
    await delay(250);
  }
  throw new Error(`${label} timed out`, { cause: detail });
}
async function evaluate(expression) {
  const tabs = await (await fetch(`http://127.0.0.1:${debug}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
  const tab = tabs.find((entry) => entry.type === "page" && entry.url.includes("renderer/index.html"));
  if (!tab) return undefined;
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  try {
    await once(ws, "open", { signal: AbortSignal.timeout(2000) });
    const result = once(ws, "message", { signal: AbortSignal.timeout(6000) });
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    const [message] = await result;
    const parsed = JSON.parse(message.data);
    if (parsed.result?.exceptionDetails) throw new Error(JSON.stringify(parsed.result.exceptionDetails));
    return parsed.result?.result?.value;
  } finally { ws.close(); }
}
function launchDesktop(overrides = {}) {
  const { SHARKBAY_RUNTIME_DATA_DIR, SHARKBAY_CONFIG_PATH, SHARKBAY_ELECTRON_DATA_DIR, GH_TOKEN, ...env } = process.env;
  child = spawn(executable, [`--remote-debugging-port=${debug}`, "--remote-debugging-address=127.0.0.1"], {
    env: { ...env, ...overrides }, stdio: ["ignore", "inherit", "inherit"],
  });
}
const runtime = () => RuntimeClient.connect(profile);
const hello = async (peer) => peer.call("hello", { protocol: 1 });
const state = () => evaluate("window.sharkBay?.updates.getState()");
const update = () => evaluate("window.sharkBay.updates.install()");
const stage = (name) => console.log("QA:", name);
const ptyOutput = () => readFile(path.join(project, "pty.log"), "utf8");
async function nativeDesktopConnected(previousPid) {
  const active = appPids().filter((pid) => pid !== previousPid);
  const lines = (await readFile(path.join(preferences, "startup.log"), "utf8")).split("\n");
  return active.some((pid) => lines.some((line) => line.includes('"pid":' + pid + ',') && line.includes('"stage":"runtime-connected"')));
}
try {
  await new Promise((resolve, reject) => server.listen(Number(feedPort), host, resolve).once("error", reject));
  await mkdir(project);
  execFileSync("/usr/bin/git", ["init", "-q", project]);
  await mkdir(profile, { recursive: true });
  await writeFile(path.join(profile, "config.json"), JSON.stringify({ ...createDefaultConfig(), configuredProjects: [project] }));
  await writeFile(path.join(project, "keep-pty.sh"), "#!/bin/sh\nwhile :; do date >> pty.log; sleep 1; done\n");
  if (adoptionOnly) await verifyStandalone();
  else await verifyMigration();
} catch (error) {
  console.error("QA failure:", error);
  throw error;
} finally {
  if (cleanupSignal) try { process.kill(cleanupSignal, "SIGCONT"); } catch {}
  try { await stopDesktop(); } catch {}
  if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  if (client) {
    if (!(await accessible(plist))) await client.call("stop").catch(() => {});
    client.dispose();
    await delay(1000);
  }
  if (await accessible(plist)) {
    const target = `gui/${process.getuid()}/${qa.serviceLabel}`;
    try { execFileSync("/bin/launchctl", ["bootout", target]); } catch {}
    if (adoptionOnly) execFileSync("/bin/launchctl", ["enable", target]);
    await rm(plist, { force: true });
  }
  const suffix = adoptionOnly ? "-standalone" : "";
  await writeFile(path.join(directory, `requests${suffix}.json`), JSON.stringify(requestLog, null, 2) + "\n");
  for (const [source, target] of [[path.join(profile, "runtime.log"), `runtime-qa${suffix}.log`], [path.join(preferences, "startup.log"), `desktop-qa${suffix}.log`]]) {
    if (await accessible(source)) await writeFile(path.join(directory, target), await readFile(source));
  }
  server.closeAllConnections();
  server.close();
  await rm(preferences, { recursive: true, force: true, maxRetries: 8, retryDelay: 300 }).catch(console.warn);
  await rm(workspace, { recursive: true, force: true });
}

async function verifyMigration() {
  execFileSync("/usr/bin/ditto", [path.join(directory, "legacy-qa", "mac-arm64", qa.name + ".app"), app]);
  assert.equal(installedVersion(), "0.3.13");
  launchDesktop();
  client = await until("legacy Runtime", runtime);
  const original = await hello(client);
  const terminal = await client.call("terminal.create", { cwdUri: `local:${project}`, initialCommand: "/bin/sh ./keep-pty.sh" });
  await until("active PTY", () => accessible(path.join(project, "pty.log")));
  const legacyOutput = await ptyOutput();
  await until("legacy client cannot find a 1.0 installer after the transition", async () =>
    fetched(next, "latest-mac.yml") && (await state())?.status === "error");
  assert.equal(installedVersion(), "0.3.13");
  assert(!requestLog.some(([, request]) => request.startsWith(releaseAsset(next, "")) && request.includes(".zip")));
  assert(!fetched(next, "desktop-mac.yml"));
  stage("after the transition, 0.3.13 requested only the legacy manifest and never downloaded 1.0");
  latest = old;
  await evaluate("window.sharkBay.updates.check()");
  await until("signed bridge download", async () => (await state())?.version === "0.3.14" && (await state())?.status === "ready", 90_000);
  await update().catch(() => {});
  await until("native bridge App replacement", () => installedVersion() === "0.3.14", 90_000);
  assert.equal((await hello(client)).pid, original.pid);
  assert((await client.call("terminal.list")).some((item) => item.session.id === terminal.id));
  await until("legacy PTY continued after native bridge replacement", async () => (await ptyOutput()).length > legacyOutput.length);
  assert((await fetch(original.origin)).ok);
  const newPty = await client.call("terminal.create", { cwdUri: `local:${project}` });
  await client.call("terminal.close", { sessionId: newPty.id });
  await client.call("usage.getSummary", { periodDays: 1 });
  await until("pinned Runtime download", async () => (await readdir(path.dirname(recordFile))).some((entry) => entry.startsWith("runtime-") && entry.endsWith(input.runtime.sha256)), 75_000);
  assert(fetched(old, "latest-mac.yml"));
  assert(requestLog.some(([, request]) => request.startsWith(releaseAsset(old, "")) && request.endsWith(".zip")));
  assert(!fetched(old, "desktop-mac.yml") && !fetched(next, "desktop-mac.yml"));
  stage("signed native 0.3.13 -> 0.3.14 and live legacy Runtime, PTY, WebUI + new PTY");
  console.log("QA PIDs before bridge restart:", appPids());
  await stopDesktop();
  await until("bridge stopped", () => !appPids().length);
  stage("bridge stopped");
  await client.call("stop").catch((error) => console.warn("Legacy stop response:", error.message));
  client.dispose();
  client = undefined;
  await until("legacy Runtime stopped", async () => {
    const peer = await runtime().catch(() => undefined);
    peer?.dispose();
    return !peer;
  });
  stage("legacy stopped, launching bridge");
  launchDesktop();
  client = await until("committed migration service", async () => {
    const record = await readRuntimeMigration(recordFile);
    if (record?.phase !== "committed") return undefined;
    const peer = await runtime();
    if ((await hello(peer)).pid === macRuntimeServicePid(qa.serviceLabel, record.service.node)) return peer;
    peer.dispose();
  }, 40_000);
  const migrated = await hello(client);
  const record = await readRuntimeMigration(recordFile);
  assert.equal((await client.call("config.get")).configuredProjects[0], project);
  await until("migrated bridge sees no update during the transition", async () =>
    fetched(old, "desktop-mac.yml") && (await state())?.status === "up-to-date");
  latest = next;
  await evaluate("window.sharkBay.updates.check()");
  await until("signed 1.0 ZIP cached", async () => (await state())?.version === "1.0.0" && (await state())?.status === "ready", 105_000);
  assert(fetched(next, "desktop-mac.yml"));
  const parkedPlist = plist + ".qa-parked";
  assert(!(await accessible(parkedPlist)));
  await rename(plist, parkedPlist);
  try {
    assert.equal((await hello(client)).pid, migrated.pid);
    await update();
    assert.equal((await state()).status, "error");
    assert.equal(installedVersion(), "0.3.14");
  } finally { await rename(parkedPlist, plist); }
  stage("cached 1.0 install denied with healthy Runtime and missing persistent plist");
  await evaluate("window.sharkBay.updates.check()");
  await until("cached 1.0 is ready after restoring plist", async () => (await state())?.status === "ready");
  process.kill(migrated.pid, "SIGSTOP");
  cleanupSignal = migrated.pid;
  quitDesktop(child.pid);
  await until("normal quit with 1.0 cached", () => !appPids().length);
  assert.equal(installedVersion(), "0.3.14");
  launchDesktop();
  await until("bridge reopened while Runtime is unresponsive", () => appPids().includes(child.pid));
  assert.equal(installedVersion(), "0.3.14");
  process.kill(migrated.pid, "SIGCONT");
  cleanupSignal = false;
  await until("cached update ready after the bridge reopens", async () => (await state())?.status === "ready");
  stage("normal quit and reopen kept 0.3.14 while 1.0 was cached and Runtime was suspended");

  process.kill(migrated.pid, "SIGSTOP");
  cleanupSignal = migrated.pid;
  await update();
  assert.equal((await state()).status, "error");
  assert.equal(installedVersion(), "0.3.14");
  process.kill(migrated.pid, "SIGCONT");
  cleanupSignal = false;
  stage("cached 1.0 install denied while LaunchAgent Runtime is unresponsive");
  await evaluate("window.sharkBay.updates.check()");
  await until("cached 1.0 is ready after recovery", async () => (await state())?.status === "ready");
  await update().catch(() => {});
  await until("native 1.0 App replacement", () => installedVersion() === "1.0.0", 90_000);
  assert.equal((await hello(client)).pid, migrated.pid);
  assert(!(await accessible(path.join(app, "Contents", "Resources", "runtime"))));
  await until("1.0 desktop connects on native relaunch", () => nativeDesktopConnected(child.pid));
  assert((await fetch(migrated.origin)).ok);
  const finalPty = await client.call("terminal.create", {
    cwdUri: `local:${project}`,
    initialCommand: "printf '1.0 PTY ready' > final-pty.log",
  });
  await until("a PTY can run commands after the 1.0 replacement", async () =>
    await readFile(path.join(project, "final-pty.log"), "utf8") === "1.0 PTY ready");
  await client.call("terminal.close", { sessionId: finalPty.id });
  process.kill(migrated.pid, "SIGKILL");
  client.dispose();
  client = await until("LaunchAgent recovered without bridge", async () => {
    const peer = await runtime();
    const { pid } = await hello(peer);
    if (pid !== migrated.pid && pid === macRuntimeServicePid(qa.serviceLabel, record.service.node)) return peer;
    peer.dispose();
  }, 45_000);
  assert.equal((await client.call("config.get")).configuredProjects[0], project);
  stage("signed native 0.3.14 -> 1.0.0 and LaunchAgent restart with 1.0 installed");
  const domain = `gui/${process.getuid()}`;
  await stopDesktop();
  client.dispose();
  client = undefined;
  execFileSync("/bin/launchctl", ["bootout", `${domain}/${qa.serviceLabel}`]);
  await until("user service stopped", async () => {
    const peer = await runtime().catch(() => undefined);
    peer?.dispose();
    return !peer;
  });
  launchDesktop();
  await until("1.0 reconnects with no bridge or profile variables", async () => (await state()) !== undefined);
  client = await until("RunAtLoad candidate after Desktop re-registration", runtime, 45_000);
  assert.equal((await client.call("config.get")).configuredProjects[0], project);
  stage("1.0 re-registered the verified LaunchAgent and connected to the original profile");
  const beforeRestart = await hello(client);
  const originalDesktop = child.pid;
  process.kill(beforeRestart.pid, "SIGKILL");
  client.dispose();
  client = await until("replacement Runtime while Desktop stays open", async () => {
    const peer = await runtime();
    if ((await hello(peer)).pid !== beforeRestart.pid) return peer;
    peer.dispose();
  }, 45_000);
  await until("Desktop IPC bound to replacement Runtime", async () =>
    await evaluate("(async () => window.sharkBay.runtime.connection() === 'connected' && Array.isArray(await window.sharkBay.runtime.listTerminals()))()"), 30_000);
  assert(appPids().includes(originalDesktop));
  stage("open 1.0 Desktop reconnected and used the replacement Runtime");
  await verifyServiceRestart();
}

async function verifyStandalone() {
  const standalone = path.join(workspace, "standalone-runtime");
  await mkdir(standalone);
  execFileSync("/usr/bin/tar", ["-xzf", archive, "-C", standalone]);
  const configPath = path.join(workspace, "custom-profile.json");
  await rename(path.join(profile, "config.json"), configPath);
  const node = path.join(standalone, "bin", "node");
  const cli = path.join(standalone, "dist-runtime", "src", "server", "cli.js");
  const serviceArgs = [node, cli, "serve", "--background", "--data-dir", profile, "--config", configPath, "--port", String(qa.port)];
  await installMigrationService(qa.serviceLabel, serviceArgs, profile);
  client = await until("existing standalone Runtime", runtime);
  const original = await hello(client);
  assert.equal(original.runtime?.version, input.runtime.version);
  const terminal = await client.call("terminal.create", { cwdUri: `local:${project}`, initialCommand: "/bin/sh ./keep-pty.sh" });
  await until("active standalone PTY", () => accessible(path.join(project, "pty.log")));
  execFileSync("/usr/bin/ditto", [path.join(directory, "bridge", "mac-arm64", qa.name + ".app"), app]);
  const env = { SHARKBAY_CONFIG_PATH: configPath };
  const parked = plist + ".qa-parked";
  await rename(plist, parked);
  try {
    launchDesktop(env);
    await until("bridge UI with unverified service", async () => (await state()) !== undefined);
    await evaluate("window.sharkBay.updates.check()");
    assert.equal((await readRuntimeMigration(recordFile))?.phase, "staged");
    assert(!requestLog.some(([, request]) => request.startsWith(releasesPath) || request.startsWith(`/api/v3/repos${releasesPath}`)));
    assert.equal((await hello(client)).pid, original.pid);
    await stopDesktop();
  } finally { await rename(parked, plist); }
  stage("bridge kept the existing Runtime but refused the 1.x feed without a persistent LaunchAgent");

  launchDesktop(env);
  const record = await until("verified standalone service adopted", async () => {
    const candidate = await readRuntimeMigration(recordFile);
    return candidate?.phase === "adopted" ? candidate : undefined;
  });
  assert.equal(record.configPath, configPath);
  assert.deepEqual(record.arguments, serviceArgs);
  assert.equal((await hello(client)).pid, original.pid);
  assert((await client.call("terminal.list")).some((item) => item.session.id === terminal.id));
  await until("1.0 ready with adopted Runtime", async () => (await state())?.version === "1.0.0" && (await state())?.status === "ready", 105_000);
  const standaloneOutput = await ptyOutput();
  await update().catch(() => {});
  await until("native 1.0 replacement with adopted Runtime", () => installedVersion() === "1.0.0", 90_000);
  await until("1.0 using adopted Runtime after native relaunch", () => nativeDesktopConnected(child.pid));
  assert.equal((await hello(client)).pid, original.pid);
  assert((await client.call("terminal.list")).some((item) => item.session.id === terminal.id));
  await until("standalone PTY continued after native 1.0 replacement", async () => (await ptyOutput()).length > standaloneOutput.length);
  stage("bridge and signed 1.0 replacement reused the same standalone Runtime, profile and active PTY");
  await stopDesktop();
  launchDesktop();
  await until("adopted 1.0 opened without profile environment overrides", async () =>
    await evaluate("window.sharkBay?.runtime.connection()") === "connected");
  await verifyServiceRestart();
}

async function verifyServiceRestart() {
  const { pid } = await hello(client);
  const saved = await readFile(plist, "utf8");
  await changeRegisteredMacRuntimeService(qa.serviceLabel, "disable", false);
  await until("standalone service stopped", async () => {
    const peer = await runtime().catch(() => undefined);
    peer?.dispose();
    return !peer;
  });
  assert.equal(await readFile(plist, "utf8"), saved);
  assert(execFileSync("/bin/launchctl", ["print-disabled", `gui/${process.getuid()}`], { encoding: "utf8" })
    .includes(`"${qa.serviceLabel}" => disabled`));
  await changeRegisteredMacRuntimeService(qa.serviceLabel, "disable", false);
  await changeRegisteredMacRuntimeService(qa.serviceLabel, "enable", false);
  client.dispose();
  client = await until("same profile after enabling service", runtime, 45_000);
  const restarted = await hello(client);
  assert.notEqual(restarted.pid, pid);
  await changeRegisteredMacRuntimeService(qa.serviceLabel, "enable", false);
  assert.equal((await hello(client)).pid, restarted.pid);
  assert.equal((await client.call("config.get")).configuredProjects[0], project);
  assert.equal(await readFile(plist, "utf8"), saved);
  await until("open Desktop reconnected after re-enable", async () =>
    await evaluate("(async () => window.sharkBay.runtime.connection() === 'connected' && Array.isArray(await window.sharkBay.runtime.listTerminals()))()"));
  stage("disable/re-enable retained the LaunchAgent and original configuration, and the open 1.0 Desktop reconnected");
}
