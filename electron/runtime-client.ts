import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { resolveCommandPath } from "../src/main/command-path.js";
import { RuntimeClient, defaultRuntimeDataPath } from "../src/runtime/control-client.js";
import { committedDesktopRuntime, connectCommittedDesktopRuntime, effectiveMigrationProfile } from "./desktop-migration.js";
import { sameProfile } from "../src/runtime/migration-state.js";

export async function ensureRuntime(report: (stage: string) => void = () => {}): Promise<RuntimeClient> {
  const migrated = await committedDesktopRuntime();
  if (migrated) {
    if (!sameProfile(migrated, await effectiveMigrationProfile(migrated, migrated.userDataPath))) {
      throw new Error("The requested Runtime profile differs from the migrated profile. Check SHARKBAY_RUNTIME_DATA_DIR and SHARKBAY_CONFIG_PATH.");
    }
    return connectCommittedDesktopRuntime(migrated);
  }
  const qaProfile = app.isPackaged && existsSync(join(process.resourcesPath, "runtime-migration-qa"));
  const dataPath = process.env.SHARKBAY_RUNTIME_DATA_DIR
    ?? (qaProfile ? join(app.getPath("userData"), "qa-runtime") : defaultRuntimeDataPath());
  report("runtime-connect-started");
  try { const client = await RuntimeClient.connect(dataPath); report("existing-runtime-connected"); return client; }
  catch (error) { if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
  if (app.isPackaged) {
    throw new Error("SharkBay Runtime is not running. Install SharkBay Runtime and start it with sharkbay serve, then reopen SharkBay Desktop.");
  }
  await mkdir(dataPath, { recursive: true, mode: 0o700 });
  const node = process.env.SHARKBAY_NODE_PATH ?? await resolveCommandPath("node");
  if (!node) throw new Error("Node runtime was not found. Build the runtime before starting SharkBay.");
  const root = app.getAppPath();
  const args = [join(root, "dist-runtime/src/server/main.js"), "--background", "--port", process.env.SHARKBAY_RUNTIME_PORT ?? "17777", "--data-dir", dataPath];
  if (process.env.SHARKBAY_CONFIG_PATH) args.push("--config", process.env.SHARKBAY_CONFIG_PATH);
  const log = await open(join(dataPath, "runtime.log"), "a", 0o600);
  let spawnError: Error | undefined;
  try {
    const child = spawn(node, args, { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, detached: true, stdio: ["ignore", log.fd, log.fd] });
    child.once("error", (error) => { spawnError = error; });
    child.unref();
    report("runtime-spawned");
  } finally { await log.close(); }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    try { const client = await RuntimeClient.connect(dataPath); report("runtime-handshake-ready"); return client; }
    catch (error) { if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  report("runtime-connect-timeout");
  throw new Error(`Runtime did not start. See ${join(dataPath, "runtime.log")}`);
}
