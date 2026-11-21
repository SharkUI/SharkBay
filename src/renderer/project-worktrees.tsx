import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import type { GitWorkspace } from "../shared/types.js";
import type { ProjectCandidate } from "./types.js";

export type ProjectTreeRowActions = {
  worktree?: ProjectCandidate;
  open?: () => void;
  remove?: { label: string; run: () => void; unavailable?: string };
};

export function ProjectWorktrees({ repoPath, activePath, candidates, revision, activity, onOpen, onRefresh, hasUnsavedEditors, openMenuAnchor, onActionMenu }: {
  repoPath: string;
  activePath: string;
  candidates: ProjectCandidate[];
  revision: number;
  activity: (candidate: ProjectCandidate) => ReactNode;
  onOpen: (repoPath: string, worktreePath: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  hasUnsavedEditors: (path: string) => boolean;
  openMenuAnchor?: HTMLButtonElement;
  onActionMenu: (anchor: HTMLButtonElement, actions: ProjectTreeRowActions) => void;
}) {
  const [workspace, setWorkspace] = useState<GitWorkspace | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const worktreeStatusPrefix = useId();

  useEffect(() => {
    let cancelled = false;
    const load = window.sharkBay?.projects?.getGitWorkspace;
    if (!load) return;
    void load({ repoPath }).then((result) => {
      if (!cancelled) {
        setWorkspace(result);
        setError("");
      }
    }, (reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; };
  }, [repoPath, revision, reload]);

  const worktrees = workspace?.worktrees ?? [];
  const checkedOut = new Set(worktrees.map((worktree) => worktree.branch));
  const localBranches = new Set(workspace?.branches);
  const branches = [...new Set([...localBranches, ...(workspace?.remoteBranches ?? [])])]
    .filter((branch) => !checkedOut.has(branch)).sort()
    .map((name) => ({ name, isLocal: localBranches.has(name) }));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="project-worktrees" aria-label="Worktrees">
      {worktrees.map((worktree, index) => {
        const candidate = candidates.find((item) => item.displayPath === worktree.path);
        const status = candidate ? activity(candidate) : null;
        const hasMenu = Boolean(candidate && !worktree.prunable);
        const statusId = status && hasMenu ? `${worktreeStatusPrefix}-${index}` : undefined;
        const selected = worktree.path === activePath;
        const directory = worktree.path.split("/").at(-1) || worktree.path;
        const duplicateBranch = worktree.branch && worktrees.some((item) => item.path !== worktree.path && item.branch === worktree.branch);
        const detail = worktree.branch ? (duplicateBranch ? directory : null) : `Detached ${worktree.head}`.trim();
        const canRemove = !worktree.primary && !worktree.locked;
        return (
          <div className={`project-worktree-item${selected ? " is-selected" : ""}`} key={worktree.path}>
            <button
              className="project-worktree-open"
              type="button"
              aria-pressed={selected}
              aria-describedby={statusId}
              title={worktree.path}
              disabled={busy || worktree.prunable}
              onClick={() => void run(() => onOpen(repoPath, worktree.path))}
            >
              <span className="project-worktree-title">
                <strong className="truncate">{worktree.branch ?? directory}</strong>
                {worktree.prunable ? <small>Missing</small> : worktree.locked ? <small>Locked</small> : null}
                {!hasMenu ? status : null}
              </span>
              {detail ? <span className="project-worktree-detail truncate">{detail}</span> : null}
            </button>
            {hasMenu ? <button
              className={`worktree-row-menu${status ? " has-status" : ""}`}
              type="button"
              aria-label={`More actions for worktree ${worktree.branch ?? directory}`}
              aria-expanded={openMenuAnchor?.dataset.sidebarTarget === worktree.path}
              data-sidebar-target={worktree.path}
              disabled={busy}
              onClick={(event) => onActionMenu(event.currentTarget, {
                worktree: candidate,
                remove: canRemove ? {
                  label: "Remove Worktree…",
                  unavailable: selected ? "Switch to another worktree first" : undefined,
                  run: () => {
                    if (hasUnsavedEditors(worktree.path)) { setError("Save your changes in this worktree first"); return; }
                    if (!window.confirm(`Remove the worktree at ${worktree.path}? Its branch will be kept.`)) return;
                    void run(async () => {
                      await window.sharkBay!.config!.removeWorktree!({ repoPath: activePath, worktreePath: worktree.path });
                      await onRefresh();
                    });
                  },
                } : undefined,
              })}
            >
              <span className="worktree-menu-glyph" aria-hidden="true">…</span>
              {status ? <span className="worktree-menu-status" id={statusId}>{status}</span> : null}
            </button> : null}
          </div>
        );
      })}
      {branches.length ? (
        <details className="project-other-branches">
          <summary>
            Other branches
            <span className="project-other-branches-indicator">
              <span className="project-other-branches-count">{branches.length}</span>
              <span className="project-other-branches-arrow" aria-hidden="true">&gt;</span>
            </span>
          </summary>
          {branches.map(({ name: branch, isLocal }) => (
            <button
              className="project-branch-item"
              key={branch}
              type="button"
              title={isLocal ? branch : `origin/${branch}`}
              aria-label={`Actions for branch ${branch}${isLocal ? "" : " (origin)"}`}
              aria-expanded={openMenuAnchor?.dataset.sidebarTarget === branch}
              data-sidebar-target={branch}
              disabled={busy}
              onClick={(event) => onActionMenu(event.currentTarget, {
                open: () => void run(async () => {
                  const created = await window.sharkBay!.config!.createWorktree!({
                    sourceProjectPath: repoPath, branchName: branch, existingBranch: isLocal, trackOrigin: !isLocal,
                  });
                  await onOpen(repoPath, created.targetPath);
                }),
                remove: isLocal ? {
                  label: "Delete Local Branch…",
                  run: () => {
                    if (!window.confirm(`Delete local branch ${branch}?`)) return;
                    void run(async () => { await window.sharkBay!.config!.deleteLocalBranch!({ repoPath, branch }); });
                  },
                } : undefined,
              })}
            >
              <span className="project-branch-label">
                {!isLocal ? (
                  <svg className="project-branch-source" aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <path d="M6 18a4 4 0 0 1-.6-7.95 6 6 0 0 1 11.55-1.38A4.67 4.67 0 1 1 18 18H6Z" />
                  </svg>
                ) : null}
                <span className="truncate">{branch}</span>
              </span>
              <span aria-hidden="true">…</span>
            </button>
          ))}
        </details>
      ) : null}
      {error ? <div className="project-tree-error" role="alert">{error}</div> : null}
    </div>
  );
}
