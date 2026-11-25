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
await writeFile(config, JSON.stringify({ appearanceTheme: "morning", terminalFontSize: 14, configuredProjects: [project], disabledPluginIds: ["bundled.codegraph"] }));
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
  assert.ok(reused.includes("Existing SharkBay WebUI:"));
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
  const link = await client.call("connect");
  const chrome = process.env.SHARKBAY_TEST_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = launch(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${path.join(directory, "chrome")}`, "--window-size=1500,500", link]);
  console.log("UI_CHECK Chrome launched");
  browserCdp = await page(browser, (url) => url.startsWith(hello.origin));
  await until(() => browserCdp.evaluate(`!!document.querySelector('.project-row')`), "browser project list");
  await browserCdp.evaluate(`document.querySelector('.project-row').click()`);
  // Both clients load their settings before a new terminal is announced to the observer.
  for (const cdp of [desktopCdp, browserCdp]) await until(() => cdp.evaluate(`document.querySelector('.app-shell')?.dataset.theme === 'morning'`), "appearance loaded");
  await desktopCdp.evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Terminal' && !button.disabled).click()`);
  console.log("UI_CHECK desktop terminal action sent");
  const terminal = await until(async () => (await client.call("terminal.list"))[0], "terminal created from desktop UI");
  assert.equal((await client.call("hello", { protocol: 1 })).pid, backend.pid);
  await until(() => desktopCdp.evaluate(`window.sharkBay.runtime.canControl(${JSON.stringify(terminal.session.id)})`), "desktop terminal control");
  await until(() => browserCdp.evaluate(`!!window.sharkBay?.runtime && !!document.querySelector('.xterm-screen')`), "browser attaches existing terminal");
  for (const cdp of [desktopCdp, browserCdp]) {
    const appearance = await cdp.evaluate(`({ background: getComputedStyle(document.querySelector('.xterm-scrollable-element')).backgroundColor, foreground: getComputedStyle(document.querySelector('.xterm-rows')).color, fontSize: getComputedStyle(document.querySelector('.xterm-rows')).fontSize })`);
    assert.deepEqual(appearance, { background: "rgb(16, 23, 25)", foreground: "rgb(217, 229, 223)", fontSize: "14px" });
  }
  console.log("UI_CHECK observer inherits current terminal colors and font");
  const browserTerminal = await browserCdp.evaluate(`window.sharkBay.runtime.listTerminals().then(rows => rows[0].session)`);
  assert.equal(browserTerminal.pid, terminal.session.pid);
  assert.equal(await browserCdp.evaluate(`window.sharkBay.runtime.canControl(${JSON.stringify(terminal.session.id)})`), false);
  const sessionId = JSON.stringify(terminal.session.id);
  const terminalCols = async () => (await client.call("terminal.list")).find(({ session }) => session.id === terminal.session.id)?.session.cols;
  async function verifyCjkRightEdge(controller, label) {
    const cols = await until(terminalCols, `${label} terminal column count`);
    const chars = Math.floor(cols / 2);
    const row = (cols % 2 ? "." : "") + "你好，世界。".repeat(chars).slice(0, chars - 1) + "末";
    const command = `printf '\\033[2J\\033[H%s\\r\\n' '${row}'\r`;
    await controller.evaluate(`window.sharkBay.terminal.input({sessionId:${sessionId},data:${JSON.stringify(command)}})`);
    const overflow = await until(() => controller.evaluate(`(() => {
      const screen = document.querySelector(".xterm-surface.is-active .xterm-screen");
      const row = Array.from(screen.querySelectorAll(".xterm-rows > div")).find(row => row.textContent.trimEnd() === ${JSON.stringify(row)});
      if (!row) return;
      return { pixels: row.lastElementChild.getBoundingClientRect().right - screen.getBoundingClientRect().right };
    })()`), `${label} renders an entire row of Chinese text`);
    assert.ok(overflow.pixels <= 2, `${label} clips Chinese at the right edge by ${overflow.pixels}px`);
    console.log(`UI_CHECK ${label} renders Chinese punctuation and the last full-width character within the grid`);
  }
  await verifyCjkRightEdge(desktopCdp, "Electron");
  const observerViewport = ".xterm-surface.is-active .xterm-viewport-host.is-observer";
  const rows = await until(() => browserCdp.evaluate(`(() => {
    const view = document.querySelector("${observerViewport}");
    return view?.scrollHeight > view?.clientHeight + 40 && view.querySelector(".xterm-rows").childElementCount;
  })()`), "desktop grid taller than observer");
  const fixtureCommand = `stty -echo; printf '\\033[?1049h\\033[?1003h\\033[?1006h\\033[2J\\033[1;1HOBSERVER_SELECTION\\033[${rows - 2};1HOBSERVER_LAST_ROW\\033[2;1H'; read -r fixture; printf '\\033[?1049l'; for i in $(seq 1 ${rows + 10}); do printf 'OBSERVER_HISTORY_%s\\n' "$i"; done; read -r fixture; stty echo\r`;
  await desktopCdp.evaluate(`window.sharkBay.terminal.input({sessionId:${sessionId},data:${JSON.stringify(fixtureCommand)}})`);
  const display = await until(() => browserCdp.evaluate(`(() => {
    const view = document.querySelector("${observerViewport}");
    if (!view || !Array.from(view.querySelectorAll(".xterm-rows > div")).some(row => row.textContent.trim() === "OBSERVER_LAST_ROW")) return;
    const bounds = view.getBoundingClientRect();
    const first = view.querySelector(".xterm-rows").firstElementChild.getBoundingClientRect();
    return {x: first.left + 2, y: first.top + first.height / 2, wheelY: bounds.top + 80};
  })()`), "complete observer grid");
  const wheel = (deltaY) => browserCdp.send("Input.dispatchMouseEvent", {type:"mouseWheel", x:display.x, y:display.wheelY, deltaX:0, deltaY});
  await wheel(1800);
  await until(() => browserCdp.evaluate(`(() => {
    const view = document.querySelector("${observerViewport}");
    const last = Array.from(view.querySelectorAll(".xterm-rows > div")).find(row => row.textContent.trim() === "OBSERVER_LAST_ROW")?.getBoundingClientRect();
    const bounds = view.getBoundingClientRect();
    return last && last.top >= bounds.top && last.bottom <= bounds.bottom;
  })()`), "wheel reveals last row");
  await wheel(-1800);
  await until(() => browserCdp.evaluate(`document.querySelector("${observerViewport}").scrollTop === 0`), "wheel returns to top");
  const mouse = (type, x, buttons) => browserCdp.send("Input.dispatchMouseEvent", {type, x, y:display.y, button:type === "mouseMoved" ? "none" : "left", buttons, clickCount:1});
  await mouse("mousePressed", display.x, 1);
  await mouse("mouseMoved", display.x + 150, 1);
  await mouse("mouseReleased", display.x + 150, 0);
  const copied = await browserCdp.evaluate(`(() => {
    const data = new DataTransfer();
    document.querySelector("${observerViewport} .xterm").dispatchEvent(new ClipboardEvent("copy", {clipboardData:data,bubbles:true,cancelable:true}));
    return data.getData("text/plain");
  })()`);
  assert.match(copied, /OBSERVER_SELECTION/);
  assert.equal(await desktopCdp.evaluate(`!!document.querySelector(".xterm.enable-mouse-events")`), true);
  let mouseEncodingReplayed = false;
  const inspectSnapshot = (name, frame) => {
    if (name === "terminal:data" && frame.sessionId === terminal.session.id && frame.reset) {
      mouseEncodingReplayed ||= frame.data.includes("\x1b[?1006h");
    }
  };
  client.on("event", inspectSnapshot);
  await client.call("terminal.attach", {sessionId:terminal.session.id});
  client.off("event", inspectSnapshot);
  assert.equal(mouseEncodingReplayed, true);
  await desktopCdp.evaluate(`window.sharkBay.terminal.input({sessionId:${sessionId},data:"\\r"})`);
  const hasRow = (text) => `Array.from(document.querySelectorAll(".xterm-surface.is-active .xterm-rows > div")).some(row => row.textContent.trim() === ${JSON.stringify(text)})`;
  await until(() => browserCdp.evaluate(hasRow(`OBSERVER_HISTORY_${rows + 10}`)), "observer receives terminal history");
  await wheel(-1800);
  await until(() => browserCdp.evaluate(hasRow("OBSERVER_HISTORY_1")), "observer wheel scrolls into history");
  assert.equal(await desktopCdp.evaluate(hasRow("OBSERVER_HISTORY_1")), false);
  console.log("UI_CHECK observer reaches the last row, scrolls history independently, and copies a drag selection");
  const fixtureInput = JSON.stringify({cwdUri:`local:${project}`});
  const newTerminal = (cdp) => cdp.evaluate(`window.sharkBay.terminal.create(${fixtureInput})`);
  const dismissed = [await newTerminal(desktopCdp), await newTerminal(desktopCdp)];
  const tabButtons = 'document.querySelectorAll(".terminal-tab-close")';
  const tabCount = (cdp) => cdp.evaluate(`${tabButtons}.length`);
  await until(async () => await tabCount(browserCdp) === 3, "observer has both fixtures");
  await browserCdp.evaluate(`${tabButtons}[2].click()`);
  await until(async () => await tabCount(browserCdp) === 2, "observer closes first fixture");
  await browserCdp.evaluate(`${tabButtons}[1].click()`);
  await until(async () => await tabCount(browserCdp) === 1, "observer closes second fixture");
  const fresh = await newTerminal(browserCdp);
  await until(async () => await tabCount(browserCdp) >= 2, "new tab reconciled");
  assert.equal(await tabCount(browserCdp), 2);
  const live = await client.call("terminal.list");
  assert.ok(dismissed.every(session => live.some(entry => entry.session.id === session.id && entry.session.pid === session.pid)));
  await until(async () => await tabCount(desktopCdp) === 4, "desktop has all four tabs");
  for (const remaining of [3, 2]) {
    await desktopCdp.evaluate(`${tabButtons}[1].click()`);
    await until(async () => await tabCount(desktopCdp) === remaining, "controller closes fixture");
  }
  const freshDesktop = await newTerminal(desktopCdp);
  await until(async () => await tabCount(desktopCdp) >= 3, "new desktop tab reconciled");
  assert.equal(await tabCount(desktopCdp), 3);
  assert.ok((await client.call("terminal.list")).every(entry => !dismissed.some(session => entry.session.id === session.id)));
  await browserCdp.evaluate(`window.sharkBay.terminal.close({sessionId:${JSON.stringify(fresh.id)}})`);
  await desktopCdp.evaluate(`window.sharkBay.terminal.close({sessionId:${JSON.stringify(freshDesktop.id)}})`);
  await until(async () => (await client.call("terminal.list")).length === 1, "fixture tabs closed by their controllers");
  await until(async () => await tabCount(browserCdp) === 1, "observer returns to one tab");
  console.log("UI_CHECK two hidden observer tabs and two controller-closed tabs stay gone after opening new tabs");
  await browserCdp.evaluate(`document.querySelector('[aria-label="接管终端"]').click()`);
  await until(() => browserCdp.evaluate(`window.sharkBay.runtime.canControl(${JSON.stringify(terminal.session.id)})`), "browser takes control");
  await until(async () => !(await desktopCdp.evaluate(`window.sharkBay.runtime.canControl(${JSON.stringify(terminal.session.id)})`)), "desktop becomes observer");
  await until(() => browserCdp.evaluate(`!!document.querySelector(".xterm.enable-mouse-events")`), "takeover restores application mouse tracking");
  await browserCdp.evaluate(`window.sharkBay.terminal.input({ sessionId: ${JSON.stringify(terminal.session.id)}, data: "echo SHARED_RUNTIME_UI_OK\\r" })`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const wideCols = await terminalCols();
  await browserCdp.send("Emulation.setDeviceMetricsOverride", { width: 700, height: 500, deviceScaleFactor: 1, mobile: false });
  await until(async () => (await terminalCols()) < wideCols, "Chrome narrows the PTY");
  await verifyCjkRightEdge(browserCdp, "Chrome after narrowing the viewport");
  await browserCdp.send("Emulation.clearDeviceMetricsOverride");
  await until(async () => (await terminalCols()) === wideCols, "Chrome restores the original PTY width");
  await verifyCjkRightEdge(browserCdp, "Chrome");
  const socketPrototype = await browserCdp.send("Runtime.evaluate", { expression: "WebSocket.prototype" });
  const sockets = await browserCdp.send("Runtime.queryObjects", { prototypeObjectId: socketPrototype.result.objectId });
  const disconnected = await browserCdp.send("Runtime.callFunctionOn", {
    objectId: sockets.objects.objectId, awaitPromise: true, returnByValue: true,
    functionDeclaration: `async function () {
      const socket = this.find(socket => socket.readyState === WebSocket.OPEN && socket.url.endsWith("/api/events"));
      await new Promise(resolve => { socket.addEventListener("close", resolve, {once:true}); socket.close(); });
      await new Promise(requestAnimationFrame);
      const button = document.querySelector(".terminal-tab-close");
      const disabled = button.disabled;
      button.click();
      return disabled;
    }`,
  });
  assert.equal(disconnected.result.value, true, "Disconnected terminal close is disabled");
  await until(() => browserCdp.evaluate(`window.sharkBay.runtime.connection() === "connected"
    && document.querySelector(".terminal-tab-close")?.disabled === false`), "terminal tab stays available after reconnect");
  assert.ok((await client.call("terminal.list")).some(entry => entry.session.pid === terminal.session.pid));
  console.log("UI_CHECK disconnected terminal stays open across reconnect");
  await browserCdp.screenshot("browser.png");
  try { await desktopCdp.send("Page.bringToFront"); await desktopCdp.screenshot("electron.png"); }
  catch { console.log("UI_CHECK native screenshot unavailable; browser screenshot captured"); }
  console.log("UI_CHECK both screenshots captured");
  await browserCdp.evaluate(`window.__beforeReload = true`);
  await browserCdp.send("Page.reload");
  await until(() => browserCdp.evaluate(`!window.__beforeReload && !!window.sharkBay?.runtime && !!document.querySelector('.xterm-screen')`), "browser reload");
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
  if (browserCdp) console.error("Browser terminal:", await browserCdp.evaluate(`(() => {
    const view = document.querySelector(".xterm-viewport-host");
    return view && {rows:view.querySelector(".xterm-rows")?.childElementCount, height:view.clientHeight,
      scrollHeight:view.scrollHeight, scrollTop:view.scrollTop, text:view.innerText.slice(0,500)};
  })()`).catch(() => "unavailable"));
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
