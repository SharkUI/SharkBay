import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  cleanLocalExcludeContent,
  installHarness,
  isHarnessInstalled,
  prepareTeamworkAgentLaunch,
  TEAMWORK_BOOTSTRAP_PROMPT,
  uninstallHarness,
} from "../src/main/teamwork-harness.js";
import { makeTempRoot, writeJson, writeText } from "./helpers.js";

const execFileAsync = promisify(execFile);

const harnessOptions = {
  githubLogin: "SharkUI",
  githubUserId: 3960864,
  machineId: "abcdef",
  agent: "codex",
  repo: "SharkUI/AIBF",
};

describe("teamwork harness install", () => {
  it("writes only local harness files and ignores the sharkbay directory", async () => {
    const root = await makeTempRoot("teamwork-harness");
    const repo = await createRealGitRepoFixture(root);

    await installHarness(repo, harnessOptions);

    await expect(isHarnessInstalled(repo)).resolves.toBe(true);
    await expect(fs.stat(path.join(repo, "AGENTS.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "CLAUDE.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "GEMINI.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "QWEN.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, ".kiro", "steering", "sharkbay-protocol.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, ".sharkbay", "harness", "instructions")).catch(() => null)).resolves.toBeNull();
    const protocol = await fs.readFile(path.join(repo, ".sharkbay", "harness", "protocol.md"), "utf8");
    expect(protocol).toContain("Repo: SharkUI/AIBF");
    expect(protocol).not.toContain("- Agent:");
    expect(protocol).toContain("agent: # e.g. Codex GPT-5.5");
    expect(protocol).toContain("branch: main");
    expect(protocol).toContain("Set `branch` to the current Git branch when the task is created.");
    expect(protocol).toContain("Use the actual task executor identity in `agent`");
    const exclude = await fs.readFile(path.join(repo, ".git", "info", "exclude"), "utf8");
    expect(exclude).toContain("/.sharkbay/");
    expect(exclude).not.toContain("/AGENTS.md");
    expect(exclude).not.toContain("/CLAUDE.md");
  });

  it("installs without touching existing user root instruction files", async () => {
    const root = await makeTempRoot("teamwork-harness-conflict");
    const repo = await createRealGitRepoFixture(root);
    const agentsPath = path.join(repo, "AGENTS.md");
    await writeText(agentsPath, "# Existing agent rules\n");

    await installHarness(repo, harnessOptions);

    await expect(fs.readFile(agentsPath, "utf8")).resolves.toBe("# Existing agent rules\n");
    await expect(isHarnessInstalled(repo)).resolves.toBe(true);
  });

  it("refuses to install into a directory that is not a git worktree", async () => {
    const root = await makeTempRoot("teamwork-harness-no-git");
    const repo = path.join(root, "plain-folder");
    await fs.mkdir(repo, { recursive: true });

    await expect(installHarness(repo, harnessOptions)).rejects.toThrow(/requires a Git repository/);
    await expect(fs.stat(path.join(repo, ".git")).catch(() => null)).resolves.toBeNull();
    await expect(isHarnessInstalled(repo)).resolves.toBe(false);
  });

  it("injects a Teamwork bootstrap prompt without creating agent entry files", async () => {
    const root = await makeTempRoot("teamwork-bootstrap");
    const repo = await createRealGitRepoFixture(root);
    await installHarness(repo, harnessOptions);

    const result = await prepareTeamworkAgentLaunch(repo, "codex", "codex");

    expect(result.injected).toBe(true);
    expect(result.initialCommand).toContain("codex 'I'\\''m working in SharkBay Teamwork mode");
    expect(result.initialCommand).toContain(".sharkbay/harness/protocol.md");
    expect(TEAMWORK_BOOTSTRAP_PROMPT).toContain("This bootstrap message itself does not require a task record.");
    await expect(fs.stat(path.join(repo, "AGENTS.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "QWEN.md")).catch(() => null)).resolves.toBeNull();
  });

  it("keeps existing user entry files unchanged during bootstrap preparation", async () => {
    const root = await makeTempRoot("teamwork-bootstrap-existing-entry");
    const repo = await createRealGitRepoFixture(root);
    await installHarness(repo, harnessOptions);
    await writeText(path.join(repo, "CLAUDE.md"), "# Project Claude Rules\n\nKeep this text.\n");

    const result = await prepareTeamworkAgentLaunch(repo, "claude", "claude");

    expect(result.injected).toBe(true);
    expect(result.initialCommand).toContain("claude 'I'\\''m working in SharkBay Teamwork mode");
    await expect(fs.readFile(path.join(repo, "CLAUDE.md"), "utf8")).resolves.toBe("# Project Claude Rules\n\nKeep this text.\n");
  });

  it("uses agent-specific bootstrap command arguments", async () => {
    const root = await makeTempRoot("teamwork-bootstrap-agent-args");
    const repo = await createRealGitRepoFixture(root);
    await installHarness(repo, harnessOptions);

    await expect(prepareTeamworkAgentLaunch(repo, "gemini", "gemini")).resolves.toMatchObject({
      injected: true,
      initialCommand: expect.stringContaining("gemini '-i' 'I'\\''m working in SharkBay Teamwork mode"),
    });
    await expect(prepareTeamworkAgentLaunch(repo, "qwen", "qwen")).resolves.toMatchObject({
      injected: true,
      initialCommand: expect.stringContaining("qwen '-i' 'I'\\''m working in SharkBay Teamwork mode"),
    });
    await expect(prepareTeamworkAgentLaunch(repo, "kiro", "kiro-cli")).resolves.toMatchObject({
      injected: true,
      initialCommand: expect.stringContaining("kiro-cli 'chat' 'I'\\''m working in SharkBay Teamwork mode"),
    });
    await expect(prepareTeamworkAgentLaunch(repo, "opencode", "opencode")).resolves.toMatchObject({
      injected: true,
      initialCommand: expect.stringContaining("opencode '--prompt' 'I'\\''m working in SharkBay Teamwork mode"),
    });
  });

  it("skips bootstrap injection when Teamwork is not installed or the agent is unsupported", async () => {
    const root = await makeTempRoot("teamwork-bootstrap-skip");
    const repo = await createRealGitRepoFixture(root);

    await expect(prepareTeamworkAgentLaunch(repo, "codex", "codex")).resolves.toMatchObject({
      injected: false,
      initialCommand: "codex",
      skippedReason: "not-installed",
    });
    await installHarness(repo, harnessOptions);
    await expect(prepareTeamworkAgentLaunch(repo, "deepseek", "deepseek")).resolves.toMatchObject({
      injected: false,
      initialCommand: "deepseek",
      skippedReason: "unsupported-agent",
    });
  });

  it("uninstalls local teamwork files and removes only SharkBay exclude entries", async () => {
    const root = await makeTempRoot("teamwork-harness-uninstall");
    const repo = await createRealGitRepoFixture(root);
    await writeText(path.join(repo, ".git", "info", "exclude"), ["node_modules/", "dist/", ""].join("\n"));

    await installHarness(repo, harnessOptions);
    const result = await uninstallHarness(repo);

    expect(result.removedPaths).toContain(".sharkbay");
    expect(result.removedPaths).not.toContain("AGENTS.md");
    expect(result.excludeRemovedLines).toEqual(["/.sharkbay/"]);
    await expect(isHarnessInstalled(repo)).resolves.toBe(false);
    await expect(fs.stat(path.join(repo, ".sharkbay")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "AGENTS.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "CLAUDE.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "GEMINI.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "QWEN.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, ".kiro", "steering", "sharkbay-protocol.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.readFile(path.join(repo, ".git", "info", "exclude"), "utf8")).resolves.toBe("node_modules/\ndist/\n");
  });

  it("restores preexisting local exclude content exactly", async () => {
    const root = await makeTempRoot("teamwork-harness-uninstall-exclude-restore");
    const repo = await createRealGitRepoFixture(root);
    const originalExclude = ["node_modules/", "/.sharkbay/", "# user note", ""].join("\n");
    await writeText(path.join(repo, ".git", "info", "exclude"), originalExclude);

    await installHarness(repo, harnessOptions);
    await uninstallHarness(repo);

    await expect(fs.readFile(path.join(repo, ".git", "info", "exclude"), "utf8")).resolves.toBe(originalExclude);
  });

  it("preserves user exclude edits made after install while removing SharkBay's line", async () => {
    const root = await makeTempRoot("teamwork-harness-uninstall-exclude-edits");
    const repo = await createRealGitRepoFixture(root);
    await writeText(path.join(repo, ".git", "info", "exclude"), "node_modules/\n");

    await installHarness(repo, harnessOptions);
    await writeText(path.join(repo, ".git", "info", "exclude"), "node_modules/\n/.sharkbay/\n/AGENTS.md\n");
    const result = await uninstallHarness(repo);

    expect(result.excludeRemovedLines).toEqual(["/.sharkbay/"]);
    await expect(fs.readFile(path.join(repo, ".git", "info", "exclude"), "utf8")).resolves.toBe("node_modules/\n/AGENTS.md\n");
  });

  it("removes only the Teamwork block from user-owned entry files during uninstall", async () => {
    const root = await makeTempRoot("teamwork-harness-uninstall-user-file");
    const repo = await createRealGitRepoFixture(root);
    await installHarness(repo, harnessOptions);
    await writeText(path.join(repo, "AGENTS.md"), [
      "# User agent rules",
      "",
      "<!-- sharkbay-teamwork:start -->",
      "legacy managed block",
      "<!-- sharkbay-teamwork:end -->",
      "",
    ].join("\n"));

    const result = await uninstallHarness(repo);

    expect(result.removedPaths).toContain("AGENTS.md");
    await expect(fs.readFile(path.join(repo, "AGENTS.md"), "utf8")).resolves.toBe("# User agent rules\n");
    await expect(fs.stat(path.join(repo, ".sharkbay")).catch(() => null)).resolves.toBeNull();
  });

  it("cleans local exclude content without touching unrelated lines", () => {
    const cleaned = cleanLocalExcludeContent(["# local", "/.sharkbay/", "/AGENTS.md", "/CLAUDE.md", "/GEMINI.md", "/QWEN.md", "/.kiro/steering/sharkbay-protocol.md", ".env", ""].join("\n"));

    expect(cleaned.removedLines).toEqual(["/.sharkbay/"]);
    expect(cleaned.content).toBe("# local\n/AGENTS.md\n/CLAUDE.md\n/GEMINI.md\n/QWEN.md\n/.kiro/steering/sharkbay-protocol.md\n.env\n");
  });

  it("injects bootstrap prompt when launched from a linked worktree", async () => {
    const root = await makeTempRoot("teamwork-bootstrap-linked-worktree");
    const mainRepo = await createRealGitRepoFixture(root, "MainRepo");
    await execFileAsync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: mainRepo });
    await installHarness(mainRepo, harnessOptions);
    const worktreePath = path.join(root, "linked-wt");
    await execFileAsync("git", ["worktree", "add", "-b", "feature", worktreePath], { cwd: mainRepo });

    const result = await prepareTeamworkAgentLaunch(worktreePath, "codex", "codex");

    expect(result.injected).toBe(true);
    expect(result.initialCommand).toContain("codex 'I'\\''m working in SharkBay Teamwork mode");
  });

});

async function createRealGitRepoFixture(root: string, name = "FixtureApp"): Promise<string> {
  const repo = path.join(root, name);
  await fs.mkdir(repo, { recursive: true });
  await writeJson(path.join(repo, "package.json"), { name: name.toLowerCase(), version: "1.0.0" });
  await execFileAsync("git", ["init"], { cwd: repo });
  return repo;
}
