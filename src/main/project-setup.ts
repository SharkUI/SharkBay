import type { ProjectSetupStatus } from "../shared/types.js";
import type { AgentConnector } from "./hooks/types.js";
import { readGitHubCliStatus } from "./github.js";
import { getHarnessUpdateStatus, isHarnessInstalled } from "./harness.js";

export async function readProjectSetupStatus(repoPath: string, connectors: Map<string, AgentConnector>): Promise<ProjectSetupStatus> {
  const [github, harness, hookEntries] = await Promise.all([
    readGitHubCliStatus(),
    (async () => {
      const installed = await isHarnessInstalled(repoPath);
      const update = installed ? await getHarnessUpdateStatus(repoPath) : null;
      return { installed, updateRequired: update?.required ?? false };
    })(),
    Promise.all([...connectors].map(async ([id, connector]) => [id, await connector.status() === "installed"] as const)),
  ]);
  return { github, harness, hooks: Object.fromEntries(hookEntries) };
}
