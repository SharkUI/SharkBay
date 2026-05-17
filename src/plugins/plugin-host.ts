import type { InstallRecipe, MachineProfile, PluginTrustState, ProfileDepth, ProjectProfile, SharkBayPluginManifest } from "../shared/types.js";
import type { MachineProbeContext, ProjectProbeContext } from "../core/execution-provider.js";

export type MachineProfilePatch = Partial<Omit<MachineProfile, "targetId" | "targetKind" | "detectedAt">>;
export type ProjectProfilePatch = Partial<Omit<ProjectProfile, "projectUri" | "targetId" | "targetKind" | "detectedAt">>;

export type MachineDetector = {
  id: string;
  pluginId: string;
  label: string;
  runOn?: ProfileDepth[];
  run(ctx: MachineProbeContext): Promise<MachineProfilePatch>;
};

export type ProjectDetector = {
  id: string;
  pluginId: string;
  label: string;
  runOn?: ProfileDepth[];
  run(ctx: ProjectProbeContext): Promise<ProjectProfilePatch>;
};

export function detectorMatchesDepth(detector: { runOn?: ProfileDepth[] }, depth: ProfileDepth): boolean {
  if (!detector.runOn?.length) return true;
  return detector.runOn.includes(depth);
}

export type PluginSource = "bundled" | "installed";

export type PluginContributionApi = {
  registerMachineDetector(detector: MachineDetector): void;
  registerProjectDetector(detector: ProjectDetector): void;
  registerInstallRecipe(recipe: InstallRecipe): void;
};

export type BundledPlugin = {
  manifest: SharkBayPluginManifest;
  register(api: PluginContributionApi): void;
};

export type PluginRecord = {
  manifest: SharkBayPluginManifest;
  source: PluginSource;
  trustState: PluginTrustState;
  enabled: boolean;
  machineDetectors: MachineDetector[];
  projectDetectors: ProjectDetector[];
  installRecipes: InstallRecipe[];
};

export type PluginSummary = {
  id: string;
  name: string;
  version: string;
  publisher: string;
  source: PluginSource;
  trustState: PluginTrustState;
  enabled: boolean;
  contributes: {
    machineDetectors: number;
    projectDetectors: number;
    installRecipes: number;
  };
};

export class PluginHost {
  private readonly plugins = new Map<string, PluginRecord>();
  private readonly disabledIds = new Set<string>();

  registerPlugin(plugin: BundledPlugin, options: { source?: PluginSource } = {}): PluginRecord {
    const source: PluginSource = options.source ?? "bundled";
    const trustState: PluginTrustState = source === "bundled" ? "bundled" : "untrusted";
    const record: PluginRecord = {
      manifest: plugin.manifest,
      source,
      trustState,
      enabled: !this.disabledIds.has(plugin.manifest.id),
      machineDetectors: [],
      projectDetectors: [],
      installRecipes: [],
    };
    const api: PluginContributionApi = {
      registerMachineDetector: (detector) => record.machineDetectors.push(detector),
      registerProjectDetector: (detector) => record.projectDetectors.push(detector),
      registerInstallRecipe: (recipe) => record.installRecipes.push(recipe),
    };
    plugin.register(api);
    this.plugins.set(plugin.manifest.id, record);
    return record;
  }

  applyEnabledState(disabledIds: Iterable<string>): void {
    this.disabledIds.clear();
    for (const id of disabledIds) this.disabledIds.add(id);
    for (const [id, record] of this.plugins.entries()) {
      record.enabled = !this.disabledIds.has(id);
    }
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    if (enabled) this.disabledIds.delete(pluginId);
    else this.disabledIds.add(pluginId);
    const record = this.plugins.get(pluginId);
    if (record) record.enabled = enabled;
  }

  listMachineDetectors(): MachineDetector[] {
    return [...this.plugins.values()].filter((record) => record.enabled).flatMap((record) => record.machineDetectors);
  }

  listProjectDetectors(): ProjectDetector[] {
    return [...this.plugins.values()].filter((record) => record.enabled).flatMap((record) => record.projectDetectors);
  }

  listInstallRecipes(): InstallRecipe[] {
    return [...this.plugins.values()].filter((record) => record.enabled).flatMap((record) => record.installRecipes);
  }

  listPluginRecords(): PluginRecord[] {
    return [...this.plugins.values()];
  }

  listPlugins(): PluginSummary[] {
    return this.listPluginRecords().map((record) => ({
      id: record.manifest.id,
      name: record.manifest.name,
      version: record.manifest.version,
      publisher: record.manifest.publisher,
      source: record.source,
      trustState: record.trustState,
      enabled: record.enabled,
      contributes: {
        machineDetectors: record.machineDetectors.length,
        projectDetectors: record.projectDetectors.length,
        installRecipes: record.installRecipes.length,
      },
    }));
  }
}
