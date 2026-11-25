import { copyFile, mkdir, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { createDefaultConfig, getConfigPath, loadAppConfig, saveAppConfig } from "../main/config.js";
import { ApplicationRuntime } from "../runtime/application-runtime.js";
import { createRuntimeControl } from "../runtime/control-server.js";
import { RuntimeClient, defaultRuntimeDataPath, type RuntimeHello } from "../runtime/control-client.js";
import { createWebServer } from "./http-server.js";
import { createStartupTimer } from "../main/startup-timing.js";
import { snapshotRuntimeProfile, verifyRuntimeUsageSnapshot } from "../runtime/migration-snapshot.js";
import { decideRuntimeMigration, readRuntimeMigration, sameProfile } from "../runtime/migration-state.js";
import { persistentMigrationServicePid } from "../runtime/mac-runtime-service.js";
import { canonicalRuntimeProfile } from "../runtime/profile-lock.js";

const args = process.argv.slice(2);
const projects: string[] = [];
let port = 17777;
let host: "127.0.0.1" | "0.0.0.0" = "0.0.0.0";
let background = false;
let stopRequested = false;
let userDataPath = process.env.SHARKBAY_RUNTIME_DATA_DIR ?? defaultRuntimeDataPath();
let configPath: string | undefined;
let migrationFile: string | undefined;
let serviceLabel: string | undefined;
let migrationAttempt: string | undefined;
for (let index = 0; index < args.length; index++) {
  const key = args[index];
  if (key === "--help") {
    console.log("SharkBay WebUI\n  sharkbay serve [--port 17777] [--lan] [--data-dir path] [--config path] [--project path ...]\n  sharkbay serve --stop\nUse --lan on a trusted network to allow other devices to access host projects and terminals.");
    process.exit(0);
  }
  if (key === "--stop") { stopRequested = true; continue; }
  if (key === "--background") { background = true; continue; }
  if (key === "--lan") { host = "0.0.0.0"; continue; }
  const value = args[++index];
  if (!value) throw new Error(`Missing value for ${key}`);
  if (key === "--port") port = Number(value);
  else if (key === "--host" && (value === "127.0.0.1" || value === "0.0.0.0")) host = value;
  else if (key === "--data-dir") userDataPath = path.resolve(value);
  else if (key === "--config") configPath = path.resolve(value);
  else if (key === "--migration-record") migrationFile = path.resolve(value);
  else if (key === "--migration-service") serviceLabel = value;
  else if (key === "--migration-attempt") migrationAttempt = value;
  else if (key === "--project") projects.push(await realpath(value));
  else throw new Error(`Unknown option: ${key}`);
}
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
if (migrationFile && (process.platform !== "darwin" || !serviceLabel || !background || stopRequested || projects.length)) {
  throw new Error("Runtime migration requires its macOS background service");
}
await mkdir(userDataPath, { recursive: true, mode: 0o700 });
const explicitConfig = configPath !== undefined;
configPath ??= path.join(userDataPath, "config.json");

let existing: RuntimeClient | undefined;
try { existing = await RuntimeClient.connect(userDataPath); }
catch (error) { if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
if (existing && migrationFile) {
  existing.dispose();
  throw new Error("A SharkBay Runtime already owns this profile");
}
if (existing) {
  try {
    if (stopRequested) { await existing.call("stop"); console.log("SharkBay runtime stop requested."); }
    else {
      for (const project of projects) await existing.call("config.addProject", { path: project });
      const hello = await existing.call<{ origin: string }>("hello", { protocol: 1 });
      console.log(`Existing SharkBay WebUI: ${hello.origin}`);
    }
  } finally { existing.dispose(); }
  process.exit(0);
}
if (stopRequested) { console.log("No SharkBay runtime is running."); process.exit(0); }
const startup = createStartupTimer("server");
startup("initialization-started");
const runtime = new ApplicationRuntime({ userDataPath, configPath });
const staticRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../dist/renderer");
let endpoints: Awaited<ReturnType<typeof openEndpoints>> | undefined;
let ready = false;
let stopping = false;
let terminal: readline.Interface | undefined;

async function openEndpoints(isReady?: () => boolean) {
  const server = await createWebServer(runtime, { port, staticRoot, host, isReady });
  startup("http-listening");
  try {
    const control = await createRuntimeControl(runtime, server, () => { void stop().catch(reportStopError); }, isReady,
      background && process.platform === "darwin" && !migrationFile ? await readStandaloneIdentity().catch(() => undefined) : undefined);
    startup("control-ready");
    return { server, async close() { try { await control.dispose(); } finally { await server.dispose(); } } };
  } catch (error) { await server.dispose(); throw error; }
}

async function readStandaloneIdentity(): Promise<RuntimeHello["runtime"]> {
  if (!process.argv[1]) return undefined;
  const cli = await realpath(fileURLToPath(new URL("./cli.js", import.meta.url)));
  if (await realpath(process.argv[1]) !== cli) return undefined;
  const pkg = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  if ((pkg.name !== "sharkbay" && pkg.name !== "@sharkbay/runtime") || typeof pkg.version !== "string") return undefined;
  return { version: pkg.version, executable: await realpath(process.execPath), cli };
}

function reportStopError(error: unknown) { console.error(error); process.exitCode = 1; }
async function stop() {
  if (stopping) return;
  stopping = true;
  terminal?.close();
  if (migrationFile) await runtime.dispose();
  else {
    try { await endpoints?.close(); } finally { await runtime.dispose(); }
  }
  console.log("SharkBay runtime stopped; sessions and watchers cleaned up.");
}

const prepareProfile = async () => {
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
};

try {
  await runtime.start(migrationFile ? undefined : prepareProfile, migrationFile && serviceLabel ? async () => {
    const record = await readRuntimeMigration(migrationFile);
    if (!record || record.phase === "adopted" || record.phase === "cancelled" || record.attempt !== migrationAttempt
      || !sameProfile(record, await canonicalRuntimeProfile(runtime.paths))) throw new Error("Runtime migration is no longer active for this profile");
    let snapshot: string | undefined;
    if (record.phase === "staged") {
      if (!record.attempt) throw new Error("Runtime migration has no active attempt");
      const config = JSON.parse(await readFile(configPath, "utf8"));
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid Runtime configuration");
      if (!(await stat(path.join(staticRoot, "index.html"))).isFile()) throw new Error("Runtime WebUI is missing");
      snapshot = await snapshotRuntimeProfile(migrationFile, record);
      await verifyRuntimeUsageSnapshot(migrationFile, snapshot);
    }
    if (record.service.label !== serviceLabel || record.service.node !== process.execPath || record.service.port !== port
      || record.service.lan !== (host === "0.0.0.0") || await persistentMigrationServicePid(migrationFile, record) !== process.pid) {
      throw new Error("Runtime was not started by its registered LaunchAgent");
    }
    const listeners = await openEndpoints(() => ready);
    try {
      if (snapshot && record.attempt
        && (await decideRuntimeMigration(migrationFile, record.attempt, { phase: "committed", snapshot })).phase !== "committed") {
        throw new Error("Runtime migration was cancelled before activation");
      }
      endpoints = listeners;
      return listeners.close;
    } catch (error) { await listeners.close(); throw error; }
  } : undefined);
  if (!endpoints) endpoints = await openEndpoints();
  const { server } = endpoints;
  ready = true;
  startup("runtime-ready");
  const config = await loadAppConfig(configPath);
  console.log(`SharkBay WebUI: ${server.origin}\nHost profile: ${userDataPath}\nProjects: ${config.configuredProjects.length}`);
  const connect = () => {
    console.log(`SharkBay WebUI: ${server.origin}`);
    if (host === "127.0.0.1") return;
    const addresses = new Set(Object.values(os.networkInterfaces()).flatMap((entries) => entries?.filter((entry) => entry.family === "IPv4" && !entry.internal).map((entry) => entry.address) ?? []));
    for (const address of addresses) console.log(`SharkBay LAN WebUI: ${server.origin.replace("127.0.0.1", address)}`);
  };
  if (!background) connect();
  terminal = readline.createInterface({ input: process.stdin });
  terminal.on("line", (line) => {
    const command = line.trim();
    if (!command || command === "connect") connect();
    else if (command === "revoke") { server.revoke(); console.log("Grant/session access revoked. PTYs remain running."); }
    else console.log("Enter/connect: show WebUI addresses; revoke: revoke grant/session access; Ctrl-C: stop runtime.");
  });
  process.on("SIGINT", () => { void stop().catch(reportStopError); });
  process.on("SIGTERM", () => { void stop().catch(reportStopError); });
} catch (error) {
  await stop();
  throw error;
}
