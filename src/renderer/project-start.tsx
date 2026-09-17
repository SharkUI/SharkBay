import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ProjectSetupStatus } from "../shared/types";
import type { AgentCli, SharkBayBridge } from "./types";

export function ProjectStart({ repoPath, agents, bridge, renderLaunchIcon, onLaunch, onCommand, onError }: {
  repoPath: string;
  agents: AgentCli[];
  bridge: SharkBayBridge;
  renderLaunchIcon: (agent?: AgentCli) => ReactNode;
  onLaunch: (agent?: AgentCli) => Promise<unknown>;
  onCommand: (command: string) => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState<ProjectSetupStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const request = useRef(0);
  const actionPending = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    try {
      const next = await bridge.projects!.getSetupStatus!({ repoPath });
      if (version !== request.current) return;
      setStatus(next);
      setLoadError(false);
      for (const [id, enabled] of Object.entries(next.hooks)) {
        localStorage.setItem(`sharkbay:agent-hooks-enabled:${id}`, String(enabled));
      }
    } catch {
      if (version === request.current) { setStatus(null); setLoadError(true); }
    }
  }, [bridge, repoPath]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { if (!actionPending.current) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { request.current++; window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  async function run(name: string, action: () => Promise<unknown>) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(name);
    try { await action(); }
    catch (error) { onError(error instanceof Error ? error.message : String(error)); }
    finally { actionPending.current = false; setBusy(null); }
  }

  const supported = agents.filter(agent => status?.hooks[agent.id] !== undefined);
  const missing = supported.filter(agent => !status?.hooks[agent.id]);
  const loadingLabel = loadError ? "Check failed" : "Checking…";
  const githubReady = status?.github.state === "ready";
  const harnessReady = status?.harness.installed && !status.harness.updateRequired;
  const hooksReady = Boolean(status && supported.length && !missing.length);

  async function configureHarness() {
    const install = status?.harness.installed ? bridge.protocol?.updateHarness : bridge.protocol?.install;
    if (!install) throw new Error("Harness installation is unavailable.");
    await install({ repoPath });
    await refresh();
  }

  async function enableHooks() {
    const enable = bridge.agents?.setHooksEnabled;
    if (!enable) throw new Error("Hook installation is unavailable.");
    try {
      for (const agent of missing) {
        await enable({ agentId: agent.id, enabled: true });
        localStorage.setItem(`sharkbay:agent-hooks-enabled:${agent.id}`, "true");
      }
    } finally { await refresh(); }
  }

  async function configureGitHub() {
    if (status?.github.command) await onCommand(status.github.command);
    else {
      if (!bridge.shell?.openExternal) throw new Error("Cannot open the GitHub CLI installer.");
      await bridge.shell.openExternal({ url: "https://cli.github.com/" });
    }
  }

  return (
    <div className="project-start">
      <div className="project-start-content">
        <div className="project-start-launchers" aria-label="Start a terminal">
          <button className="project-start-launcher" type="button" disabled={Boolean(busy)} onClick={() => void run("launch", () => onLaunch())}>
            <span className="project-start-icon">{renderLaunchIcon()}</span>
            <span>Terminal</span>
          </button>
          {agents.map(agent => (
            <button className="project-start-launcher" type="button" disabled={Boolean(busy)} key={agent.id} onClick={() => void run("launch", () => onLaunch(agent))}>
              <span className="project-start-icon">{renderLaunchIcon(agent)}</span>
              <span>{agent.label}</span>
            </button>
          ))}
        </div>
        <div className="project-start-statuses" aria-label="Project setup" aria-live="polite">
          <div className="project-start-row">
            <span>GitHub</span>
            <span className={githubReady ? "is-ready" : "project-start-muted"}>{!status ? loadingLabel : githubReady ? "✓ Ready" : status.github.state === "missing" ? "Not installed · optional" : "Not signed in · optional"}</span>
            {status && !githubReady && <button className="project-start-action" type="button" disabled={Boolean(busy)} onClick={() => void run("github", configureGitHub)}>{status.github.state === "missing" ? "Install" : "Sign in"}</button>}
          </div>
          <div className="project-start-row">
            <span>Harness</span>
            <span className={harnessReady ? "is-ready" : "project-start-muted"}>{busy === "harness" ? "Installing…" : !status ? loadingLabel : harnessReady ? "✓ Ready" : status.harness.installed ? "Update available" : "Not installed"}</span>
            {status && !harnessReady && <button className="project-start-action" type="button" disabled={Boolean(busy)} onClick={() => void run("harness", configureHarness)}>{status.harness.installed ? "Update" : "Install"}</button>}
          </div>
          <div className="project-start-row">
            <span>Hooks</span>
            <span className={hooksReady ? "is-ready" : "project-start-muted"} title={missing.map(agent => agent.label).join(", ")}>{busy === "hooks" ? "Enabling…" : !status ? loadingLabel : hooksReady ? "✓ Configured" : !supported.length ? "No supported agents" : missing.length === 1 ? `${missing[0]!.label} not enabled` : `${missing.length} agents not enabled`}</span>
            {status && missing.length > 0 && <button className="project-start-action" type="button" disabled={Boolean(busy)} onClick={() => void run("hooks", enableHooks)}>Enable</button>}
          </div>
          {loadError && <button className="project-start-action" type="button" disabled={Boolean(busy)} onClick={() => void refresh()}>Retry status check</button>}
        </div>
      </div>
    </div>
  );
}
