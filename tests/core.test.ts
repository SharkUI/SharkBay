import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SharkBayCore } from "../src/main/core/sharkbay-core.js";
import { toLocalProjectUri } from "../src/main/core/project-uri.js";
import type { ExecutionProvider } from "../src/main/core/execution-provider.js";
import type {
  GitDirtyFile,
  GitEvent,
  GitMetadata,
  IpcRuntimeLike,
  ProjectFilesInput,
  ProjectFilesResult,
  ProjectScanInput,
  ScanProjectsResult,
  TerminalCloseInput,
  TerminalCreateInput,
  TerminalInput,
  TerminalResizeInput,
  TerminalSession,
} from "../src/shared/types.js";
import { getRuntimeConfigPath } from "../src/main/config.js";
import { createGitRepoFixture, makeTempRoot, makeTestRuntime, writeJson } from "./helpers.js";

class StubExecutionProvider implements ExecutionProvider {
  readonly id = "stub";
  readonly kind = "local" as const;
  readonly label = "Stub";
  readonly readGitMetadataMock = vi.fn<[string], Promise<GitMetadata>>();
  readonly readGitHistoryMock = vi.fn<[string], Promise<GitEvent[]>>();
  readonly readGitDirtyFilesMock = vi.fn<[string], Promise<GitDirtyFile[]>>();

  scanProjects(_runtime: IpcRuntimeLike, _input?: ProjectScanInput): Promise<ScanProjectsResult> {
    return Promise.resolve({ roots: [], candidates: [] });
  }

  listProjectFiles(_runtime: IpcRuntimeLike, _input: ProjectFilesInput): Promise<ProjectFilesResult> {
    return Promise.resolve({ ok: true, projectUri: "", files: [] });
  }

  readGitMetadata(repoPath: string): Promise<GitMetadata> {
    return this.readGitMetadataMock(repoPath);
  }

  readGitHistory(repoPath: string): Promise<GitEvent[]> {
    return this.readGitHistoryMock(repoPath);
  }

  readGitDirtyFiles(repoPath: string): Promise<GitDirtyFile[]> {
    return this.readGitDirtyFilesMock(repoPath);
  }

  createTerminal(_runtime: IpcRuntimeLike, _input: TerminalCreateInput): Promise<TerminalSession> {
    throw new Error("not implemented");
  }

  inputTerminal(_input: TerminalInput): TerminalSession {
    throw new Error("not implemented");
  }

  resizeTerminal(_input: TerminalResizeInput): TerminalSession {
    throw new Error("not implemented");
  }

  closeTerminal(_input: TerminalCloseInput): TerminalSession {
    throw new Error("not implemented");
  }

  closeAllTerminalSessions(): void {
    // No-op for tests.
  }
}

describe("SharkBayCore", () => {
  it("resolves project details through the execution provider boundary", async () => {
    const runtime = await makeTestRuntime("core-config");
    const root = await makeTempRoot("core-root");
    const repo = await createGitRepoFixture(root, "CoreRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
      updatedAt: "2026-05-15",
    });
    await fs.writeFile(path.join(repo, "README.md"), "# CoreRepo\n");

    const provider = new StubExecutionProvider();
    const gitMetadata: GitMetadata = {
      isGitRepository: true,
      gitRoot: repo,
      currentBranch: "main",
      defaultBranch: "main",
      remoteOrigin: "git@example.com:org/core-repo.git",
      githubUrl: "git@example.com:org/core-repo.git",
      dirtyWorktree: true,
    };
    const gitHistory: GitEvent[] = [{
      hash: "abc123",
      selector: "HEAD@{0}",
      action: "commit: initial",
      date: "2026-05-15T00:00:00Z",
    }];
    const gitDirtyFiles: GitDirtyFile[] = [{
      path: "README.md",
      status: "M",
      staged: " ",
      unstaged: "M",
    }];
    provider.readGitMetadataMock.mockResolvedValue(gitMetadata);
    provider.readGitHistoryMock.mockResolvedValue(gitHistory);
    provider.readGitDirtyFilesMock.mockResolvedValue(gitDirtyFiles);

    const core = new SharkBayCore(provider);
    const projectUri = toLocalProjectUri(repo);
    const detail = await core.getProjectDetail(runtime, { projectUri });

    expect(provider.readGitMetadataMock).toHaveBeenCalledWith(toLocalProjectUri(await fs.realpath(repo)));
    expect(detail).toMatchObject({
      name: "CoreRepo",
      repoUrl: "git@example.com:org/core-repo.git",
      currentBranch: "main",
      dirtyWorktree: true,
      gitHistory,
      gitDirtyFiles,
    });
  });

});
