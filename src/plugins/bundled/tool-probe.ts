import type { MachineProbeContext } from "../../core/execution-provider.js";
import type { ToolProfile } from "../../shared/types.js";

export type ToolProbeSpec = {
  id: string;
  command: string;
  versionArgs?: string[];
};

export async function probeTools(ctx: MachineProbeContext, specs: ToolProbeSpec[], pluginId: string): Promise<ToolProfile[]> {
  return Promise.all(specs.map((spec) => probeTool(ctx, spec, pluginId)));
}

export async function probeTool(ctx: MachineProbeContext, spec: ToolProbeSpec, pluginId: string): Promise<ToolProfile> {
  const path = await ctx.which(spec.command).catch(() => null);
  const version = path ? await readToolVersion(ctx, spec.command, spec.versionArgs) : null;
  return {
    id: spec.id,
    command: spec.command,
    available: Boolean(path),
    path,
    version,
    sourcePluginId: pluginId,
  };
}

async function readToolVersion(ctx: MachineProbeContext, command: string, versionArgs: string[] = ["--version"]): Promise<string | null> {
  const args = versionArgs.map(shellQuote).join(" ");
  const result = await ctx.run(`${shellQuote(command)} ${args} 2>/dev/null || true`, { timeoutMs: 3000 }).catch(() => null);
  const firstLine = result?.stdout.trim().split(/\r?\n/u)[0]?.trim();
  return firstLine || null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
