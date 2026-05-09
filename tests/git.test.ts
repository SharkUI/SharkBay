import { describe, expect, it } from "vitest";
import { parseGitDirtyFiles, readGitDirtyFiles } from "../src/main/git.js";
import { makeTempRoot, writeText } from "./helpers.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

describe("git status parsing", () => {
  it("returns compact dirty file rows from porcelain output", () => {
    expect(parseGitDirtyFiles(" M src/App.tsx\nA  docs/new.md\n?? .env\nR  old.ts -> src/new.ts\n")).toEqual([
      { path: "src/App.tsx", status: "M", staged: " ", unstaged: "M" },
      { path: "docs/new.md", status: "A", staged: "A", unstaged: " " },
      { path: ".env", status: "??", staged: "?", unstaged: "?" },
      { path: "src/new.ts", status: "R", staged: "R", unstaged: " " },
    ]);
  });

  it("keeps the first dirty path intact when status starts with an unstaged marker", async () => {
    const repo = await makeTempRoot("git-dirty-first");
    await execFileAsync("git", ["init"], { cwd: repo });
    await writeText(path.join(repo, "tracked.txt"), "before\n");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: repo });
    await execFileAsync("git", ["commit", "-m", "initial"], {
      cwd: repo,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "SharkBay",
        GIT_AUTHOR_EMAIL: "sharkbay@example.com",
        GIT_COMMITTER_NAME: "SharkBay",
        GIT_COMMITTER_EMAIL: "sharkbay@example.com",
      },
    });
    await writeText(path.join(repo, "tracked.txt"), "after\n");

    expect(await readGitDirtyFiles(repo)).toEqual([
      { path: "tracked.txt", status: "M", staged: " ", unstaged: "M" },
    ]);
  });
});
