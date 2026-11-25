import { randomUUID } from "node:crypto";
import { link, lstat, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { RuntimePaths } from "../shared/types.js";

type Profile = Required<RuntimePaths>;
type MigrationProfile = Profile & {
  service: { label: string; node: string; port: number; lan: boolean };
};
type StagedMigration = MigrationProfile & { phase: "staged"; attempt?: string };
type CommittedDecision = { phase: "committed"; snapshot: string };
type MigrationDecision = CommittedDecision | { phase: "cancelled" };
export type AdoptedRuntime = MigrationProfile & { phase: "adopted"; cli: string; version: string; arguments: string[]; attempt?: undefined };
export type RuntimeMigration = StagedMigration
  | (MigrationProfile & { attempt: string } & MigrationDecision)
  | (MigrationProfile & { attempt?: undefined } & CommittedDecision)
  | AdoptedRuntime;

const validAttempt = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const validSnapshot = (value: unknown): value is string => typeof value === "string" && /^snapshot-[A-Za-z0-9]{6}$/.test(value);

export function sameProfile(left: Profile, right: Profile): boolean {
  return left.userDataPath === right.userDataPath && left.configPath === right.configPath;
}

async function readPrivateJson(file: string): Promise<unknown> {
  const info = await lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (!info) return undefined;
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) {
    throw new Error("Runtime migration record is not private to this user");
  }
  return JSON.parse(await readFile(file, "utf8"));
}

async function readDecision(file: string): Promise<MigrationDecision | undefined> {
  const decision = await readPrivateJson(file) as Partial<MigrationDecision> | undefined;
  if (decision === undefined || decision?.phase === "cancelled"
    || (decision?.phase === "committed" && validSnapshot(decision.snapshot))) return decision as MigrationDecision | undefined;
  throw new Error("Invalid Runtime migration decision");
}

export async function readRuntimeMigration(file: string): Promise<RuntimeMigration | undefined> {
  const record = await readPrivateJson(file) as (Partial<MigrationProfile> & {
    phase?: string; attempt?: string; snapshot?: string; cli?: string; version?: string; arguments?: string[];
  }) | undefined;
  if (record === undefined) return undefined;
  if (!record || typeof record.userDataPath !== "string" || !path.isAbsolute(record.userDataPath)
    || typeof record.configPath !== "string" || !path.isAbsolute(record.configPath)
    || !record.service || typeof record.service.node !== "string" || !path.isAbsolute(record.service.node)
    || typeof record.service.label !== "string" || !/^xyz\.sharkbay\.runtime(?:\.[a-z0-9-]+)?$/.test(record.service.label)
    || !Number.isInteger(record.service.port) || record.service.port < 1 || record.service.port > 65535
    || typeof record.service.lan !== "boolean"
    || (record.attempt !== undefined && (record.phase !== "staged" || !validAttempt(record.attempt)))) {
    throw new Error("Invalid Runtime migration record");
  }
  if (record.phase === "adopted" && typeof record.cli === "string" && path.isAbsolute(record.cli)
    && typeof record.version === "string" && /^\d+\.\d+\.\d+$/.test(record.version)
    && Array.isArray(record.arguments) && record.arguments.every((arg) => typeof arg === "string")) return record as AdoptedRuntime;
  if (record.phase !== "staged" && ((record.phase !== "snapshotted" && record.phase !== "committed") || !validSnapshot(record.snapshot))) {
    throw new Error("Invalid Runtime migration record");
  }
  if (record.phase === "committed") return record as RuntimeMigration;
  const staged = { userDataPath: record.userDataPath, configPath: record.configPath, service: record.service, phase: "staged" as const };
  if (!record.attempt) return staged;
  const decision = await readDecision(`${file}.${record.attempt}.decision`);
  return { ...staged, attempt: record.attempt, ...decision };
}

export async function syncMigrationFile(file: string): Promise<void> {
  const handle = await open(file, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writePrivateJson(file: string, value: object, exclusive = false): Promise<void> {
  const temporary = `${file}.${randomUUID()}`;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value) + "\n");
      await handle.sync();
    } finally { await handle.close(); }
    if (exclusive) await link(temporary, file);
    else await rename(temporary, file);
    await syncMigrationFile(path.dirname(file));
  } finally { await rm(temporary, { force: true }); }
}

export function writeRuntimeMigration(file: string, record: StagedMigration | AdoptedRuntime): Promise<void> {
  return writePrivateJson(file, record);
}

// A fully written hard link is the single decision for this attempt. A process
// resuming after cancellation cannot publish a committed record or touch live data.
export async function decideRuntimeMigration(file: string, attempt: string, decision: MigrationDecision): Promise<MigrationDecision> {
  if (!validAttempt(attempt)) throw new Error("Invalid Runtime migration attempt");
  const decisionFile = `${file}.${attempt}.decision`;
  try { await writePrivateJson(decisionFile, decision, true); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const winner = await readDecision(decisionFile);
  if (!winner) throw new Error("Runtime migration has no decision");
  return winner;
}
