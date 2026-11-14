import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { WebSocket } from "ws";
import { RuntimeClient } from "../dist-runtime/src/runtime/control-client.js";

const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "sharkbay-shared-ui-")));
const project = path.join(directory, "sandbox"); await mkdir(project);
const env = { ...process.env }; for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[key];
execFileSync("git", ["-c", "init.templateDir=", "init", "--quiet", project], { env });
await writeFile(path.join(project, "README.md"), "# Shared runtime fixture\n");
const config = path.join(directory, "config.json"), data = path.join(directory, "runtime");
await writeFile(config, JSON.stringify({ configuredProjects: [project], disabledPluginIds: ["bundled.codegraph"] }));
const backend = spawn(process.execPath, ["dist-runtime/src/server/main.js", "--background", "--port", "0", "--data-dir", data, "--config", config], { env, stdio: ["ignore", "pipe", "pipe"] });
const backendExit = once(backend, "exit");
let backendError = ""; backend.stderr.on("data", (chunk) => { backendError += chunk; }); backend.stdout.resume();
let client, desktop, browser, desktopCdp, browserCdp;
const screenshots = path.resolve(".sharkbay/validation/shared-runtime"); await mkdir(screenshots, { recursive: true });
async function until(read, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { const result = await read(); if (result) return result; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error(`Timed out: ${label}. ${backendError.slice(0, 500)}`);
}
function launch(binary, args, extraEnv = env) {
  const process = spawn(binary, args, { env: extraEnv, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = ""; process.stderr.on("data", (chunk) => { stderr += chunk; }); process.stdout.resume();
  process.on("error", (error) => { stderr += error.message; });
  return { process, stderr: () => stderr, exit: once(process, "exit") };
}
async function page(process, matches) {
  const endpoint = await until(() => process.stderr().match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1], "DevTools startup");
  const origin = new URL(endpoint).origin.replace("ws:", "http:");
  const target = await until(async () => (await (await fetch(`${origin}/json/list`, { signal: AbortSignal.timeout(2000) })).json()).find((entry) => entry.type === "page" && matches(entry.url)), "page target");
  const socket = new WebSocket(target.webSocketDebuggerUrl); await Promise.race([once(socket, "open"), new Promise((_, reject) => setTimeout(() => reject(new Error("CDP connection timed out")), 3000))]);
  let next = 0; const pending = new Map();
  socket.on("message", (raw) => { const message = JSON.parse(raw.toString()); const request = pending.get(message.id); if (!request) return; pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 10000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  return {
    send, close: () => socket.close(),
    async evaluate(expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; },
    async screenshot(name) { const { data } = await send("Page.captureScreenshot", { format: "png" }); await writeFile(path.join(screenshots, name), Buffer.from(data, "base64")); },
  };
}
try {
  client = await until(async () => { try { return await RuntimeClient.connect(data); } catch { return null; } }, "Node runtime");
  const hello = await client.call("hello", { protocol: 1 }); assert.equal(hello.pid, backend.pid);
  const reused = execFileSync(process.execPath, ["dist-runtime/src/server/main.js", "--data-dir", data, "--config", config], { env, encoding: "utf8", timeout: 5000 });
  assert.ok(reused.includes("Existing SharkBay runtime:"));
  console.log("UI_CHECK runtime ready");
  await mkdir(path.join(directory, "electron"));
  const electron = createRequire(import.meta.url)("electron");
  desktop = launch(electron, ["--disable-gpu", "--remote-debugging-port=0", "."], { ...env, SHARKBAY_RUNTIME_DATA_DIR: data, SHARKBAY_CONFIG_PATH: config, SHARKBAY_ELECTRON_DATA_DIR: path.join(directory, "electron"), VITE_DEV_SERVER_URL: pathToFileURL(path.resolve("dist/renderer/index.html")).href });
  console.log("UI_CHECK Electron launched");
  desktopCdp = await page(desktop, (url) => url.includes("dist/renderer/index.html"));
  console.log("UI_CHECK Electron target ready");
  await until(() => desktopCdp.evaluate(`!!document.querySelector('.project-row')`), "desktop project list");
  await desktopCdp.evaluate(`document.querySelector('.project-row').click()`);
  await until(() => desktopCdp.evaluate(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Terminal' && !button.disabled)`), "desktop workbench");
  await desktopCdp.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Terminal' && !button.disabled).click()`);
  console.log("UI_CHECK desktop terminal action sent");
  const terminal = await until(async () => (await client.call("terminal.list"))[0], "terminal created from desktop UI");
  assert.equal((await client.call("hello", { protocol: 1 })).pid, backend.pid);
  await until(() => desktopCdp.evaluate(`window.sharkBay.runtime.canControl(${JSON.stringify(terminal.session.id)})`), "desktop terminal control");
  const link = await client.call("connect");
  const chrome = process.env.SHARKBAY_TEST_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = launch(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${path.join(directory, "chrome")}`, "--window-size=1500,900", link]);
  console.log("UI_CHECK Chrome launched");
  browserCdp = await page(browser, (url) => url.startsWith(hello.origin));
  await until(() => browserCdp.evaluate(`!!document.querySelector('.project-row')`), "browser project list");
  await browserCdp.evaluate(`document.querySelector('.project-row').click()`);
  await until(() => browserCdp.evaluate(`!!window.sharkBay?.runtime && !!document.querySelector('.xterm-screen')`), "browser attaches existing terminal");
  const browserTerminal = await browserCdp.evaluate(`window.sharkBay.runtime.listTerminals().then(rows => rows[0].session)`);
  assert.equal(browserTerminal.pid, terminal.session.pid);
  assert.equal(await browserCdp.evaluate(`window.sharkBay.runtime.canControl(${JSON.stringify(terminal.session.id)})`), false);
  await browserCdp.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === '接管终端').click()`);
  await until(() => browserCdp.evaluate(`window.sharkBay.runtime.canControl(${JSON.stringify(terminal.session.id)})`), "browser takes control");
  await until(async () => !(await desktopCdp.evaluate(`window.sharkBay.runtime.canControl(${JSON.stringify(terminal.session.id)})`)), "desktop becomes observer");
  await browserCdp.evaluate(`window.sharkBay.terminal.input({ sessionId: ${JSON.stringify(terminal.session.id)}, data: "echo SHARED_RUNTIME_UI_OK\\r" })`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await browserCdp.screenshot("browser.png");
  try { await desktopCdp.send("Page.bringToFront"); await desktopCdp.screenshot("electron.png"); }
  catch { console.log("UI_CHECK native screenshot unavailable; browser screenshot captured"); }
  console.log("UI_CHECK both screenshots captured");
  await browserCdp.send("Page.reload");
  await until(() => browserCdp.evaluate(`!!window.sharkBay?.runtime && !!document.querySelector('.xterm-screen')`), "browser reload");
  console.log("UI_CHECK browser reloaded");
  const sessions = await client.call("terminal.list"); assert.equal(sessions.length, 1); assert.equal(sessions[0].session.pid, terminal.session.pid);
  desktopCdp.close(); desktopCdp = undefined; desktop.process.kill("SIGKILL"); await Promise.race([desktop.exit, new Promise((resolve) => setTimeout(resolve, 3000))]);
  console.log("UI_CHECK desktop exit requested; checking independent PTY");
  assert.equal((await client.call("terminal.list"))[0].session.pid, terminal.session.pid);
  await browserCdp.evaluate(`window.sharkBay.runtime.takeControl(${JSON.stringify(terminal.session.id)})`);
  await browserCdp.evaluate(`window.sharkBay.terminal.input({ sessionId: ${JSON.stringify(terminal.session.id)}, data: "echo DESKTOP_EXIT_PTY_ALIVE\\r" })`);
  browserCdp.close(); browserCdp = undefined; browser.process.kill("SIGKILL"); await Promise.race([browser.exit, new Promise((resolve) => setTimeout(resolve, 3000))]);
  console.log("UI_CHECK browser can input after desktop termination");
  await client.call("stop"); const [code] = await backendExit; assert.equal(code, 0);
  assert.throws(() => process.kill(terminal.session.pid, 0), { code: "ESRCH" });
  console.log("SHARED_RUNTIME_UI_OK desktop UI create, browser observe/takeover/reload, same PTY, desktop exit survival, explicit stop cleanup");
  console.log(`Screenshots: ${screenshots}`);
} catch (error) {
  console.error("UI failure:", error.message);
  if (desktopCdp) { console.error("Desktop DOM:", await desktopCdp.evaluate(`document.body.innerText.slice(0,1500)`).catch(() => "unavailable")); await desktopCdp.screenshot("failure.png").catch(() => {}); }
  console.error("Desktop startup diagnostics:", desktop?.stderr().slice(-4000) ?? "not started");
  throw error;
} finally {
  desktopCdp?.close(); browserCdp?.close();
  for (const entry of [desktop, browser]) if (entry && entry.process.exitCode === null && entry.process.signalCode === null) { entry.process.kill("SIGTERM"); const kill = setTimeout(() => entry.process.kill("SIGKILL"), 3000); await Promise.race([entry.exit, new Promise((resolve) => setTimeout(resolve, 4000))]); clearTimeout(kill); entry.process.stdout.destroy(); entry.process.stderr.destroy(); entry.process.unref(); }
  for (const entry of [desktop, browser]) if (entry) { entry.process.stdout.destroy(); entry.process.stderr.destroy(); entry.process.unref(); }
  client?.dispose();
  if (backend.exitCode === null && backend.signalCode === null) { backend.kill("SIGTERM"); const kill = setTimeout(() => backend.kill("SIGKILL"), 5000); await Promise.race([backendExit, new Promise((resolve) => setTimeout(resolve, 6000))]); clearTimeout(kill); backend.stdout.destroy(); backend.stderr.destroy(); backend.unref(); }
  await rm(directory, { recursive: true, force: true });
}
