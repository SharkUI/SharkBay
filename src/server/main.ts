import { copyFile, mkdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { createDefaultConfig, getConfigPath, loadAppConfig, saveAppConfig } from "../main/config.js";
import { ApplicationRuntime } from "../runtime/application-runtime.js";
import { createRuntimeControl } from "../runtime/control-server.js";
import { RuntimeClient, defaultRuntimeDataPath } from "../runtime/control-client.js";
import { createWebServer } from "./http-server.js";

const args = process.argv.slice(2);
const projects: string[] = [];
let port = 5185;
let background = false;
let stopRequested = false;
let userDataPath = process.env.SHARKBAY_RUNTIME_DATA_DIR ?? defaultRuntimeDataPath();
let configPath: string | undefined;
for (let index = 0; index < args.length; index++) {
  const key = args[index];
  if (key === "--help") {
    console.log("SharkBay WebUI\n  npm start -- [--port 5185] [--data-dir path] [--config path] [--project path ...]\nUse --stop to stop the shared runtime and its terminals. Loopback only. Existing host projects are copied into a separate WebUI profile on first start.\nIn the host terminal: Enter/connect = new connection link; revoke = disconnect authorized browsers.");
    process.exit(0);
  }
  if (key === "--stop") { stopRequested = true; continue; }
  if (key === "--background") { background = true; continue; }
  const value = args[++index];
  if (!value) throw new Error(`Missing value for ${key}`);
  if (key === "--port") port = Number(value);
  else if (key === "--data-dir") userDataPath = path.resolve(value);
  else if (key === "--config") configPath = path.resolve(value);
  else if (key === "--project") projects.push(await realpath(value));
  else throw new Error(`Unknown option: ${key}`);
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
await mkdir(userDataPath, { recursive: true, mode: 0o700 });
const explicitConfig = configPath !== undefined;
configPath ??= path.join(userDataPath, "config.json");

let existing: RuntimeClient | undefined;
try { existing = await RuntimeClient.connect(userDataPath); }
catch (error) { if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
if (existing) {
  try {
    if (stopRequested) { await existing.call("stop"); console.log("SharkBay runtime stop requested."); }
    else {
      for (const project of projects) await existing.call("config.addProject", { path: project });
      console.log(`Existing SharkBay runtime: ${await existing.call("connect")}`);
    }
  } finally { existing.dispose(); }
  process.exit(0);
}
if (stopRequested) { console.log("No SharkBay runtime is running."); process.exit(0); }
const runtime = new ApplicationRuntime({ userDataPath, configPath });
try {
  await runtime.start(async () => {
    try { await stat(configPath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (explicitConfig) throw new Error(`Configuration does not exist: ${configPath}`);
      const existing = getConfigPath();
      try { await copyFile(existing, configPath); }
      catch (copyError) {
        if ((copyError as NodeJS.ErrnoException).code !== "ENOENT") throw copyError;
        await saveAppConfig(createDefaultConfig(), configPath);
      }
    }
    const config = await loadAppConfig(configPath);
    for (const project of projects) {
      if (!(await stat(project)).isDirectory()) throw new Error(`Project is not a directory: ${project}`);
      if (!config.configuredProjects.includes(project)) config.configuredProjects.push(project);
    }
    if (projects.length) await saveAppConfig(config, configPath);
  });
  const config = await loadAppConfig(configPath);
  const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../dist/renderer");
  const server = await createWebServer(runtime, { port, staticRoot });
  const control = await createRuntimeControl(runtime, server, () => { void stop().catch((error) => { console.error(error); process.exitCode = 1; }); });
  console.log(`SharkBay WebUI: ${server.origin}\nHost profile: ${userDataPath}\nProjects: ${config.configuredProjects.length}`);
  const connect = () => console.log(`Connection link (one use, 5 minutes): ${server.connectionUrl()}`);
  if (!background) connect();
  const terminal = readline.createInterface({ input: process.stdin });
  terminal.on("line", (line) => {
    const command = line.trim();
    if (!command || command === "connect") connect();
    else if (command === "revoke") { server.revoke(); console.log("Browser authorization revoked. PTYs remain running."); }
    else console.log("Enter/connect: connection link; revoke: revoke browser access; Ctrl-C: stop runtime.");
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true; terminal.close();
    await control.dispose();
    await server.dispose();
    await runtime.dispose();
    console.log("SharkBay runtime stopped; sessions and watchers cleaned up.");
  };
  process.on("SIGINT", () => { void stop().catch((error) => { console.error(error); process.exitCode = 1; }); });
  process.on("SIGTERM", () => { void stop().catch((error) => { console.error(error); process.exitCode = 1; }); });
} catch (error) {
  await runtime.dispose();
  throw error;
}
