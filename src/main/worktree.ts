import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { addConfiguredProject, renameProject } from "./config.js";
import type { CreateWorktreeInput, CreateWorktreeResult, IpcRuntimeLike } from "../shared/types.js";

const execFileAsync = promisify(execFile);

function sanitizeBranchForPath(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function createWorktree(runtime: IpcRuntimeLike, input: CreateWorktreeInput): Promise<CreateWorktreeResult> {
  const { sourceProjectPath, branchName } = input;
  if (!branchName.trim()) throw new Error("Branch name is required");

  const baseName = path.basename(sourceProjectPath);
  const targetDir = path.resolve(sourceProjectPath, "..", `${baseName}-${sanitizeBranchForPath(branchName)}`);

  await execFileAsync("git", ["-C", sourceProjectPath, "worktree", "add", targetDir, "-b", branchName]);

  await addConfiguredProject(runtime, { path: targetDir });
  const uri = `local:${encodeURI(targetDir)}`;
  await renameProject(runtime, { uri, name: `${baseName}:${branchName}` });

  return { targetPath: targetDir, branchName };
}
