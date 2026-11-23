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

  const harnessInstalled = status?.harness.installed === true;
  useEffect(() => {
    if (harnessInstalled) return;
    return bridge.protocol?.onTasksChanged?.((event) => {
      if (event.repoPath === repoPath && !actionPending.current) void refresh();
    });
  }, [bridge, harnessInstalled, refresh, repoPath]);

  async function run(name: string, action: () => Promise<unknown>) {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(name);
    try { await action(); }
    catch (error) { onError(error instanceof Error ? error.message : String(error)); }
    finally { actionPending.current = false; setBusy(null); }
  }

  const supported = agents.filter(agent => status?.hooks[agent.id] !== undefined);
  const loadingLabel = loadError ? "Check failed" : "Checking…";
  const githubReady = status?.github.state === "ready";
  const harnessReady = harnessInstalled && !status?.harness.updateRequired;
  const hooksEnabled = supported.some(agent => status?.hooks[agent.id]);

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
          {harnessInstalled && <div className="project-start-row">
            <span>Harness</span>
            <span className={harnessReady ? "is-ready" : "project-start-muted"}>{harnessReady ? "✓ Ready" : "Local changes · see Tasks"}</span>
          </div>}
          <div className="project-start-row">
            <span>Hooks</span>
            <span className={hooksEnabled ? "is-ready" : "project-start-muted"}>{!status ? loadingLabel : hooksEnabled ? "Automatic" : !supported.length ? "No supported agents" : "Off"}</span>
          </div>
          {loadError && <button className="project-start-action" type="button" disabled={Boolean(busy)} onClick={() => void refresh()}>Retry status check</button>}
        </div>
      </div>
    </div>
  );
}
