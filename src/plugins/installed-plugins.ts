import { promises as fs } from "node:fs";
import path from "node:path";
import type { IpcRuntimeLike, SharkBayPluginManifest } from "../shared/types.js";
import { parsePluginManifest } from "./plugin-manifest.js";
import type { BundledPlugin } from "./plugin-host.js";

export type InstalledPluginRecord = {
  manifest: SharkBayPluginManifest;
  manifestPath: string;
  installDir: string;
};

export function installedPluginsDir(runtime: IpcRuntimeLike): string {
  return path.join(runtime.userDataPath, "plugins", "installed");
}

export async function scanInstalledPlugins(runtime: IpcRuntimeLike): Promise<InstalledPluginRecord[]> {
  const root = installedPluginsDir(runtime);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: InstalledPluginRecord[] = [];
  for (const entry of entries) {
    const installDir = path.join(root, entry);
    const stat = await fs.stat(installDir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const manifestPath = path.join(installDir, "sharkbay-plugin.json");
    const raw = await fs.readFile(manifestPath, "utf8").catch(() => null);
    if (!raw) continue;
    try {
      const manifest = parsePluginManifest(JSON.parse(raw));
      records.push({ manifest, manifestPath, installDir });
    } catch {
      // Skip plugins with invalid manifests; surfaced via warnings later.
    }
  }
  return records;
}

export function declarativeInstalledPlugin(record: InstalledPluginRecord): BundledPlugin {
  return {
    manifest: record.manifest,
    register() {
      // Phase 5.0: only the manifest is loaded. Detector / agent / installer code
      // execution from disk requires sandboxing and is deferred to Phase 5.x.
    },
  };
}
