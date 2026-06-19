import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { addConfiguredProject } from "./config.js";
import type { CloneProjectInput, CloneProjectResult, IpcRuntimeLike } from "../shared/types.js";

const execFileAsync = promisify(execFile);

function inferCloneTargetName(remoteUrl: string): string | null {
  const cleaned = remoteUrl.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const lastSegment = cleaned.split(/[/:]/).filter(Boolean).pop() ?? "";
  const name = lastSegment.endsWith(".git") ? lastSegment.slice(0, -4) : lastSegment;
  if (!name || name === "." || name === ".." || path.basename(name) !== name) return null;
  return name;
}

export async function cloneProject(runtime: IpcRuntimeLike, input: CloneProjectInput): Promise<CloneProjectResult> {
  const repoUrl = input.url?.trim();
  const parentPath = input.parentPath?.trim();
  if (!repoUrl) throw new Error("Remote repository URL is required");
  if (!parentPath) throw new Error("Clone destination is required");

  const parentStat = await fs.stat(parentPath);
  if (!parentStat.isDirectory()) throw new Error("Clone destination must be a directory");

  const targetName = inferCloneTargetName(repoUrl);
  if (!targetName) throw new Error("Unable to infer project directory from remote URL");

  await execFileAsync("git", ["clone", repoUrl], { cwd: parentPath });

  const projectPath = path.resolve(parentPath, targetName);
  await addConfiguredProject(runtime, { path: projectPath });
  return { cancelled: false, path: projectPath };
}
