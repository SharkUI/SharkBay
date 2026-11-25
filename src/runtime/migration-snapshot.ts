import { copyFile, lstat, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { TokenUsageDb } from "../main/token-usage-db.js";
import { syncMigrationFile } from "./migration-state.js";
import type { RuntimePaths } from "../shared/types.js";

async function isFile(file: string): Promise<boolean> {
  try {
    if (!(await lstat(file)).isFile()) throw new Error(`Not a regular migration file: ${file}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function backupDatabase(source: string, destination: string) {
  const db = new Database(source, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Runtime usage database failed integrity check");
    await db.backup(destination);
  } finally { db.close(); }
  await syncMigrationFile(destination);
}

// ApplicationRuntime calls this inside its profile-lock lifetime, before
// opening the usage database or preparing a missing config.
export async function snapshotRuntimeProfile(file: string, profile: Required<RuntimePaths>): Promise<string> {
  const directory = await mkdtemp(path.join(path.dirname(file), "snapshot-"));
  const database = path.join(profile.userDataPath, "token-usage.db");
  if (await isFile(profile.configPath)) {
    const config = path.join(directory, "config.json");
    await copyFile(profile.configPath, config);
    await syncMigrationFile(config);
  }
  if (await isFile(database)) {
    const snapshot = path.join(directory, "token-usage.db");
    await backupDatabase(database, snapshot);
    const check = new Database(snapshot, { readonly: true, fileMustExist: true });
    try {
      if (check.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Runtime usage snapshot failed integrity check");
    } finally { check.close(); }
  }
  await syncMigrationFile(directory);
  return path.basename(directory);
}

export async function verifyRuntimeUsageSnapshot(file: string, snapshot: string): Promise<void> {
  const directory = await mkdtemp(path.join(path.dirname(file), "probe-"));
  try {
    const source = path.join(path.dirname(file), snapshot, "token-usage.db");
    if (await isFile(source)) await copyFile(source, path.join(directory, "token-usage.db"));
    new TokenUsageDb(directory).close();
  } finally { await rm(directory, { recursive: true, force: true }); }
}
