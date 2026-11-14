import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { resolveCommandPath } from "../src/main/command-path.js";
import { RuntimeClient, defaultRuntimeDataPath } from "../src/runtime/control-client.js";

export async function ensureRuntime(): Promise<RuntimeClient> {
  const dataPath = process.env.SHARKBAY_RUNTIME_DATA_DIR ?? defaultRuntimeDataPath();
  try { return await RuntimeClient.connect(dataPath); }
  catch (error) { if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
  await mkdir(dataPath, { recursive: true, mode: 0o700 });
  const node = process.env.SHARKBAY_NODE_PATH ?? (app.isPackaged ? join(process.resourcesPath, "runtime", "bin", process.platform === "win32" ? "node.exe" : "node") : await resolveCommandPath("node"));
  if (!node) throw new Error("Node runtime was not found. Build the runtime before starting SharkBay.");
  const root = app.isPackaged ? join(process.resourcesPath, "runtime") : app.getAppPath();
  const args = [join(root, "dist-runtime/src/server/main.js"), "--background", "--port", process.env.SHARKBAY_RUNTIME_PORT ?? "0", "--data-dir", dataPath];
  if (process.env.SHARKBAY_CONFIG_PATH) args.push("--config", process.env.SHARKBAY_CONFIG_PATH);
  const log = await open(join(dataPath, "runtime.log"), "a", 0o600);
  let spawnError: Error | undefined;
  try {
    const child = spawn(node, args, { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, detached: true, stdio: ["ignore", log.fd, log.fd] });
    child.once("error", (error) => { spawnError = error; });
    child.unref();
  } finally { await log.close(); }
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    try { return await RuntimeClient.connect(dataPath); }
    catch (error) { if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Runtime did not start. See ${join(dataPath, "runtime.log")}`);
}
