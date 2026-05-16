import type { MachineProfile, ProfileDepth, ProjectProfile } from "../shared/types.js";
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

export class PluginHost {
  private readonly machineDetectors: MachineDetector[] = [];
  private readonly projectDetectors: ProjectDetector[] = [];

  registerMachineDetector(detector: MachineDetector): void {
    this.machineDetectors.push(detector);
  }

  registerProjectDetector(detector: ProjectDetector): void {
    this.projectDetectors.push(detector);
  }

  listMachineDetectors(): MachineDetector[] {
    return [...this.machineDetectors];
  }

  listProjectDetectors(): ProjectDetector[] {
    return [...this.projectDetectors];
  }
}
