import { describe, expect, it } from "vitest";
import { parseGitDirtyFiles, readGitDirtyFiles } from "../src/main/git.js";
import { makeTempRoot, writeText } from "./helpers.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

describe("git status parsing", () => {
  it("returns compact dirty file rows from porcelain output", () => {
    expect(parseGitDirtyFiles(" M src/App.tsx\0A  docs/new.md\0?? .env\0R  src/new.ts\0old.ts\0")).toEqual([
      { path: "src/App.tsx", status: "M", staged: " ", unstaged: "M" },
      { path: "docs/new.md", status: "A", staged: "A", unstaged: " " },
      { path: ".env", status: "??", staged: "?", unstaged: "?" },
      { path: "src/new.ts", status: "R", staged: "R", unstaged: " " },
    ]);
  });

  it("preserves raw names and consumes both rename and copy source records", () => {
    expect(parseGitDirtyFiles('R  新\n名 -> .ts\0旧.ts\0C  copy\tname \0original\0??  \"quoted\\name\" \0')).toEqual([
      { path: "新\n名 -> .ts", status: "R", staged: "R", unstaged: " " },
      { path: "copy\tname ", status: "C", staged: "C", unstaged: " " },
      { path: ' "quoted\\name" ', status: "??", staged: "?", unstaged: "?" },
    ]);
  });

  it("reads non-ASCII, whitespace, escaped and literal-arrow names from Git", async () => {
    const repo = await makeTempRoot("git-raw-paths");
    await execFileAsync("git", ["init"], { cwd: repo });
    const names = ["中文.ts", "new\nline.ts", "tab\tfile", '"quote"', "back\\slash", " leading ", "literal -> arrow"];
    for (const name of names) await writeText(path.join(repo, name), "file");
    expect((await readGitDirtyFiles(repo)).map((row) => row.path).sort()).toEqual(names.sort());
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
