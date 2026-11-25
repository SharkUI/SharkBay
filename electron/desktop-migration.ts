import { app, Notification } from "electron";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { RuntimeClient, defaultRuntimeDataPath, runtimeProtocolVersion, type RuntimeHello } from "../src/runtime/control-client.js";
import { decideRuntimeMigration, readRuntimeMigration, sameProfile, writeRuntimeMigration, type RuntimeMigration } from "../src/runtime/migration-state.js";
import { canonicalRuntimeProfile } from "../src/runtime/profile-lock.js";
import { installMigrationService, macRuntimeServiceLabel, matchesAdoptedRuntime, migrationServiceArguments, persistentMigrationServicePid, removeCancelledMigrationService, standaloneRuntimeService, startRecordedMacRuntimeService } from "../src/runtime/mac-runtime-service.js";
import { readInstalledMigrationPackage, stageMigrationPackage, migrationPackagePaths, type MigrationPackage } from "../src/runtime/migration-package.js";

type BridgeManifest = { runtime: MigrationPackage; serviceLabel?: string; owner: string; repo: string; channel: "desktop"; host?: string; protocol?: "http"; qa?: boolean };
type PersistentRuntime = Extract<RuntimeMigration, { phase: "adopted" | "committed" }>;

function migrationRecordPath() {
  return path.join(app.getPath("userData"), "runtime-migration", "profile.json");
}

export async function committedDesktopRuntime() {
  if (!app.isPackaged || process.platform !== "darwin") return undefined;
  const record = await readRuntimeMigration(migrationRecordPath());
  return record?.phase === "committed" || record?.phase === "adopted" ? record : undefined;
}

async function connectExisting(dataDir: string, timeoutMs?: number) {
  try { return await RuntimeClient.connect(dataDir, timeoutMs); }
  catch (error) {
    if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    return undefined;
  }
}

export function effectiveMigrationProfile(record: RuntimeMigration | undefined, defaultDataPath: string) {
  const userDataPath = process.env.SHARKBAY_RUNTIME_DATA_DIR ?? record?.userDataPath ?? defaultDataPath;
  const configPath = process.env.SHARKBAY_CONFIG_PATH ?? record?.configPath ?? path.join(userDataPath, "config.json");
  return canonicalRuntimeProfile({ userDataPath, configPath });
}

async function verifiedService(recordFile: string, record: PersistentRuntime, hello: RuntimeHello) {
  return hello.origin === `http://127.0.0.1:${record.service.port}`
    && (record.phase === "adopted" ? await matchesAdoptedRuntime(record, hello) : hello.pid === await persistentMigrationServicePid(recordFile, record))
    && await verifiedProfileOwner(record, hello.pid);
}

async function webReady(origin: string) {
  const response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
  await response.body?.cancel();
  return response.ok && (response.headers.get("content-type") ?? "").startsWith("text/html");
}

export async function connectCommittedDesktopRuntime(record: PersistentRuntime) {
  const canonical = await canonicalRuntimeProfile(record);
  if (!sameProfile(record, canonical)) throw new Error("The migrated Runtime profile paths have changed");
  const recordFile = migrationRecordPath();
  await startRecordedMacRuntimeService(recordFile, record);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const client = await connectExisting(record.userDataPath, 1000).catch(() => undefined);
    if (client) {
      try {
        const hello = await client.call<RuntimeHello>("hello", { protocol: runtimeProtocolVersion }, 1000);
        if (await verifiedService(recordFile, record, hello)) return client;
        throw new Error("A different Runtime is using the migrated profile");
      } catch (error) {
        client.dispose();
        throw error;
      }
    }
    await delay(200);
  }
  throw new Error(`SharkBay Runtime service is unavailable. Check ${path.join(record.userDataPath, "runtime.log")} and restart the ${record.service.label} user service.`);
}

async function verifiedProfileOwner(profile: { userDataPath: string; configPath: string }, pid: number) {
  const locks = [path.join(profile.userDataPath, "runtime.lock"), `${profile.configPath}.runtime.lock`];
  const owners = await Promise.all(locks.map(async (file) => {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error("Unexpected Runtime profile lock");
    return JSON.parse(await readFile(file, "utf8")) as { token?: string; pid?: number };
  }));
  return owners.every((owner) => owner.pid === pid && !!owner.token && owner.token === owners[0]?.token);
}

export async function openDesktopMigrationBridge() {
  if (!app.isPackaged || process.platform !== "darwin" || process.arch !== "arm64") return undefined;
  const manifest = JSON.parse(await readFile(path.join(process.resourcesPath, "runtime-migration.json"), "utf8")) as BridgeManifest;
  const manifestLabel = manifest.serviceLabel ?? macRuntimeServiceLabel;
  const recordFile = migrationRecordPath();
  await mkdir(path.dirname(recordFile), { recursive: true, mode: 0o700 });
  const packageRoot = await realpath(path.dirname(recordFile));
  const target = migrationPackagePaths(packageRoot, manifest.runtime);
  const defaultDataPath = manifest.qa ? path.join(app.getPath("userData"), "qa-runtime") : defaultRuntimeDataPath();
  let downloadPending = false;

  function matchesBridge(record: RuntimeMigration) {
    return record.service.label === manifestLabel && (record.phase === "adopted"
      ? record.version === manifest.runtime.version : record.service.node === target.node);
  }

  function stage(record: RuntimeMigration) {
    if (downloadPending) return;
    downloadPending = true;
    void stageMigrationPackage(packageRoot, manifest.runtime, manifest.host).then(() => {
      const lan = record.service.lan
        ? Object.values(networkInterfaces()).flatMap((entries) => entries ?? [])
          .filter((entry) => entry.family === "IPv4" && !entry.internal)
          .map((entry) => `http://${entry.address}:${record.service.port}`).join(", ")
        : "";
      if (Notification.isSupported()) new Notification({
        title: "SharkBay Runtime is ready",
        body: "Restart your Mac and open SharkBay to finish moving the Runtime to its background service."
          + (lan ? ` WebUI LAN: ${lan}` : ""),
      }).show();
    }).catch((error) => {
      console.warn("Unable to prepare the SharkBay Runtime migration", error);
      setTimeout(() => { downloadPending = false; stage(record); }, 60_000).unref();
    });
  }

  async function allowUpdate(): Promise<boolean> {
    let client: RuntimeClient | undefined;
    try {
      const record = await readRuntimeMigration(recordFile);
      if ((record?.phase !== "committed" && record?.phase !== "adopted") || !matchesBridge(record)
        || !sameProfile(record, await effectiveMigrationProfile(record, defaultDataPath))) return false;
      client = await connectExisting(record.userDataPath, 1000);
      if (!client) return false;
      const hello = await client.call<RuntimeHello>("hello", { protocol: runtimeProtocolVersion }, 1000);
      return await verifiedService(recordFile, record, hello) && await webReady(hello.origin);
    } catch { return false; } finally { client?.dispose(); }
  }

  async function connectLegacy(ensureLegacy: (dataDir?: string, configPath?: string) => Promise<RuntimeClient>) {
    let record = await readRuntimeMigration(recordFile);
    const profile = await effectiveMigrationProfile(record, defaultDataPath);
    if (record && (!sameProfile(record, profile) || !matchesBridge(record))) {
      if (record.phase === "committed" || record.phase === "adopted") throw new Error("The requested Runtime profile or installation differs from the committed migration.");
      console.warn("SharkBay Runtime migration profile or installation changed");
      return ensureLegacy(profile.userDataPath, profile.configPath);
    }
    if (record?.phase === "committed" || record?.phase === "adopted") return connectCommittedDesktopRuntime(record);
    let client = await connectExisting(profile.userDataPath).catch((error: unknown) => {
      if (record?.attempt && error instanceof Error && error.message === "Runtime migration is in progress") return undefined;
      throw error;
    });
    if (!client && record && await readInstalledMigrationPackage(packageRoot, manifest.runtime)) {
      const staged = { ...profile, service: record.service, phase: "staged" as const };
      if (record.phase === "cancelled") {
        await removeCancelledMigrationService(manifestLabel, migrationServiceArguments(recordFile, record));
        record = staged;
        await writeRuntimeMigration(recordFile, record);
      }
      const attempt = record.attempt ?? randomUUID();
      const candidate = { ...staged, attempt };
      if (!record.attempt) await writeRuntimeMigration(recordFile, candidate);
      const args = migrationServiceArguments(recordFile, candidate);
      try {
        await installMigrationService(manifestLabel, args, profile.userDataPath);
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          if (await allowUpdate()) {
            const connected = await connectExisting(profile.userDataPath);
            if (connected) return connected;
          }
          await delay(200);
        }
      } catch (error) {
        console.warn("Unable to start the SharkBay Runtime migration service", error);
      }
      if ((await decideRuntimeMigration(recordFile, attempt, { phase: "cancelled" })).phase === "committed") {
        const latest = await readRuntimeMigration(recordFile);
        if (latest?.phase !== "committed") throw new Error("The committed Runtime migration record changed");
        return connectCommittedDesktopRuntime(latest);
      }
      await removeCancelledMigrationService(manifestLabel, args);
      record = staged;
      await writeRuntimeMigration(recordFile, record);
    }
    const defaultConfig = path.join(profile.userDataPath, "config.json");
    client ??= await ensureLegacy(profile.userDataPath, profile.configPath === defaultConfig ? undefined : profile.configPath);
    try {
      const hello = await client.call<RuntimeHello>("hello", { protocol: runtimeProtocolVersion });
      const { pid, origin } = hello;
      const port = Number(new URL(origin).port) || 80;
      if (await verifiedProfileOwner(profile, pid)) {
        if (!record?.attempt) {
          const standalone = await standaloneRuntimeService(manifestLabel, hello, manifest.runtime.version);
          if (standalone && sameProfile(standalone, profile) && await webReady(origin)) {
            await writeRuntimeMigration(recordFile, standalone);
            return client;
          }
        }
        if (!record) {
          record = { ...profile, phase: "staged", service: {
            label: manifestLabel, node: target.node, port, lan: process.env.SHARKBAY_MIGRATION_LAN === "1",
          } };
          await writeRuntimeMigration(recordFile, record);
        }
        if (!await readInstalledMigrationPackage(packageRoot, manifest.runtime)) stage(record);
      }
    } catch (error) { console.warn("Unable to verify the SharkBay Runtime migration profile", error); }
    return client;
  }

  return {
    feed: { provider: "github" as const, owner: manifest.owner, repo: manifest.repo, channel: manifest.channel, host: manifest.host, protocol: manifest.protocol },
    connectLegacy, allowUpdate,
  };
}
