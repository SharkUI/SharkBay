import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  cleanLocalExcludeContent,
  getHarnessUpdateStatus,
  installHarness,
  isHarnessInstalled,
  prepareTeamworkAgentLaunch,
  teamworkBootstrapPrompt,
  TEAMWORK_BOOTSTRAP_PROMPT,
  uninstallHarness,
  updateHarnessFiles,
} from "../src/main/teamwork-harness.js";
import { SharkBayCoreService } from "../src/core/core-service.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { CODEGRAPH_PLUGIN_ID, codeGraphBundledPlugin } from "../src/plugins/bundled/codegraph-detector.js";
import { PluginHost } from "../src/plugins/plugin-host.js";
import type { IpcRuntimeLike, TerminalCreateInput, TerminalSession } from "../src/shared/types.js";
import { makeTempRoot, makeTestRuntime, writeJson, writeText } from "./helpers.js";

const execFileAsync = promisify(execFile);

const harnessOptions = {
  githubLogin: "SharkUI",
  githubUserId: 3960864,
  machineId: "abcdef",
  agent: "codex",
  repo: "SharkUI/AIBF",
};

class CaptureTerminalProvider extends LocalProvider {
  readonly terminalInputs: TerminalCreateInput[] = [];

  override createTerminal(_runtime: IpcRuntimeLike, input: TerminalCreateInput): Promise<TerminalSession> {
    this.terminalInputs.push(input);
    return Promise.resolve({
      id: `term-${this.terminalInputs.length}`,
      cwdUri: input.cwdUri,
      title: "Terminal",
      shell: "zsh",
      pid: null,
      status: "running",
      createdAt: "2026-05-27T00:00:00Z",
    });
  }
}

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
    expect(protocol).toContain("sessionId: # omit this line if unavailable");
    expect(protocol).toContain(".sharkbay/harness/agent-session-id.sh");
    expect(protocol).toContain("branch: main");
    expect(protocol).toContain("Set `branch` to the current Git branch when the task is created.");
    expect(protocol).toContain("date -u +%Y-%m-%dT%H:%M:%SZ");
    expect(protocol).toContain("Never estimate, round, backfill, or fabricate timestamps.");
    expect(protocol).toContain("Use the actual task executor identity in `agent`");
    expect(protocol).toContain("## Code Intelligence");
    expect(protocol).toContain("This project has CodeGraph installed and configured.");
    expect(protocol).toContain("prefer CodeGraph over `rg`, `grep`, or broad file reads");
    expect(protocol).toContain("codegraph query <symbol-or-name>");
    expect(protocol).toContain('Use `codegraph context "what you need to understand"` only for initial');
    const sessionHelper = await fs.stat(path.join(repo, ".sharkbay", "harness", "agent-session-id.sh"));
    expect(sessionHelper.mode & 0o111).not.toBe(0);
    const sessionHelperText = await fs.readFile(path.join(repo, ".sharkbay", "harness", "agent-session-id.sh"), "utf8");
    expect(sessionHelperText).toContain("*kiro*)");
    expect(sessionHelperText).toContain("*deepseek*)");
    expect(sessionHelperText).toContain(".deepseek/audit.log");
    expect(sessionHelperText).toContain("*opencode*)");
    expect(sessionHelperText).toContain(".local\\/share\\/opencode\\/log");
    expect(sessionHelperText).toContain("SHARKBAY_RESTORED_SESSION_ID");
    expect(sessionHelperText).toContain("*claude*|*gemini*|*qwen*)");
    expect(sessionHelperText).toContain("codex|claude|deepseek|gemini|kiro|opencode|qwen");
    const exclude = await fs.readFile(path.join(repo, ".git", "info", "exclude"), "utf8");
    expect(exclude).toContain("/.sharkbay/");
    expect(exclude).not.toContain("/AGENTS.md");
    expect(exclude).not.toContain("/CLAUDE.md");
  });

  it("resolves DeepSeek session id from the audit log", async () => {
    const root = await makeTempRoot("teamwork-deepseek-session");
    const repo = await createRealGitRepoFixture(root);
    const workspace = await fs.realpath(repo);
    await installHarness(repo, harnessOptions);

    const home = path.join(root, "home");
    const sessionId = "5129eadb-161a-40de-8b6a-764d2176f724";
    await writeText(path.join(home, ".deepseek", "audit.log"), [
      '{"ts":"2026-05-21T14:34:59.403154+00:00","event":"tool.approval.auto_approve","details":{"tool_name":"exec_shell","session_id":"old-session","mode":"AGENT"}}',
      `{"ts":"2026-05-21T14:35:06.441658+00:00","event":"tool.approval.auto_approve","details":{"tool_name":"exec_shell","approval_key":"shell:bash","session_id":"${sessionId}","mode":"AGENT"}}`,
      "",
    ].join("\n"));
    await writeJson(path.join(home, ".deepseek", "sessions", `${sessionId}.json`), {
      metadata: {
        id: sessionId,
        workspace,
        updated_at: "2026-05-21T14:35:06Z",
      },
    });

    const { stdout } = await execFileAsync("sh", [path.join(repo, ".sharkbay", "harness", "agent-session-id.sh"), "deepseek"], {
      cwd: workspace,
      env: { ...process.env, HOME: home },
    });

    expect(stdout.trim()).toBe(sessionId);
  });

  it("returns restored session id directly from the restore environment", async () => {
    const root = await makeTempRoot("teamwork-restored-session");
    const repo = await createRealGitRepoFixture(root);
    const workspace = await fs.realpath(repo);
    await installHarness(repo, harnessOptions);

    const sessionId = "33333333-3333-4333-8333-333333333333";
    const { stdout } = await execFileAsync("sh", [path.join(repo, ".sharkbay", "harness", "agent-session-id.sh"), "codex"], {
      cwd: workspace,
      env: { ...process.env, SHARKBAY_RESTORED_SESSION_ID: sessionId },
    });

    expect(stdout.trim()).toBe(sessionId);
  });

  it("resolves OpenCode session id from the active process logs", async () => {
    const root = await makeTempRoot("teamwork-opencode-session");
    const repo = await createRealGitRepoFixture(root);
    const workspace = await fs.realpath(repo);
    await installHarness(repo, harnessOptions);

    const home = path.join(root, "home");
    const logDir = path.join(home, ".local", "share", "opencode", "log");
    const mainLog = path.join(logDir, "2026-05-21T152022.log");
    const sessionLog = path.join(logDir, "2026-05-21T152023.log");
    const sessionId = "ses_1b4e0115bffeHMF5TVmEhAbyhJ";
    await writeText(mainLog, "INFO service=default args=[] process_role=main run_id=c21572ad opencode\n");
    await writeText(sessionLog, [
      `INFO service=session id=${sessionId} directory=${workspace} path= title=New session created`,
      `INFO service=permission permission=bash pattern=.sharkbay/harness/agent-session-id.sh "OpenCode" evaluated`,
      `INFO service=session.processor session.id=${sessionId} messageID=msg_123 process`,
      "",
    ].join("\n"));

    const bin = path.join(root, "bin");
    await writeText(path.join(bin, "ps"), [
      "#!/bin/sh",
      "case \"$2\" in",
      "  command=) echo opencode ;;",
      "  ppid=) echo 1 ;;",
      "esac",
      "",
    ].join("\n"));
    await writeText(path.join(bin, "lsof"), [
      "#!/bin/sh",
      `printf '%s\\n' 'opencode 48565 shark txt REG 1,2 1 ${mainLog}'`,
      `printf '%s\\n' 'opencode 48565 shark txt REG 1,2 1 ${sessionLog}'`,
      "",
    ].join("\n"));
    await writeText(path.join(bin, "opencode"), [
      "#!/bin/sh",
      "if [ \"$1\" = db ] && [ \"$2\" = path ]; then",
      `  printf '%s\\n' '${path.join(home, ".local", "share", "opencode", "opencode.db")}'`,
      "  exit 0",
      "fi",
      "cat <<'JSON'",
      "[",
      "  {",
      `    "id": "${sessionId}",`,
      `    "directory": "${workspace}",`,
      "    \"path\": \"\"",
      "  }",
      "]",
      "JSON",
      "",
    ].join("\n"));
    await fs.chmod(path.join(bin, "ps"), 0o755);
    await fs.chmod(path.join(bin, "lsof"), 0o755);
    await fs.chmod(path.join(bin, "opencode"), 0o755);

    const { stdout } = await execFileAsync("sh", [path.join(repo, ".sharkbay", "harness", "agent-session-id.sh"), "opencode"], {
      cwd: workspace,
      env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    });

    expect(stdout.trim()).toBe(sessionId);
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

  it("reports harness drift and updates managed files only when requested", async () => {
    const root = await makeTempRoot("teamwork-harness-update");
    const repo = await createRealGitRepoFixture(root);
    await installHarness(repo, harnessOptions);
    const protocolPath = path.join(repo, ".sharkbay", "harness", "protocol.md");
    const helperPath = path.join(repo, ".sharkbay", "harness", "agent-session-id.sh");
    const originalProtocol = await fs.readFile(protocolPath, "utf8");
    await writeText(protocolPath, `${originalProtocol}\n# local stale copy\n`);
    await fs.rm(helperPath);

    const staleStatus = await getHarnessUpdateStatus(repo);
    expect(staleStatus).toEqual({
      required: true,
      files: [
        { path: ".sharkbay/harness/protocol.md", reason: "changed" },
        { path: ".sharkbay/harness/agent-session-id.sh", reason: "missing" },
      ],
    });

    await expect(prepareTeamworkAgentLaunch(repo, "codex", "codex")).resolves.toMatchObject({ injected: true });
    await expect(fs.readFile(protocolPath, "utf8")).resolves.toBe(`${originalProtocol}\n# local stale copy\n`);
    await expect(fs.stat(helperPath).catch(() => null)).resolves.toBeNull();

    await expect(updateHarnessFiles(repo)).resolves.toEqual({ required: false, files: [] });
    await expect(fs.readFile(protocolPath, "utf8")).resolves.toBe(originalProtocol);
    const helperStat = await fs.stat(helperPath);
    expect(helperStat.mode & 0o111).not.toBe(0);
  });

  it("injects a Teamwork bootstrap prompt without creating agent entry files", async () => {
    const root = await makeTempRoot("teamwork-bootstrap");
    const repo = await createRealGitRepoFixture(root);
    await installHarness(repo, harnessOptions);

    const result = await prepareTeamworkAgentLaunch(repo, "codex", "codex", { codeGraphEnabled: true });

    expect(result.injected).toBe(true);
    expect(result.initialCommand).toContain("codex 'I'\\''m working in SharkBay Teamwork mode");
    expect(result.initialCommand).toContain(".sharkbay/harness/protocol.md");
    expect(teamworkBootstrapPrompt({ codeGraphEnabled: true })).toBe([
      "I'm working in SharkBay Teamwork mode for this project.",
      "Please read `.sharkbay/harness/protocol.md` first and follow it for the rest of this session.",
      "CodeGraph is installed and configured for this project; when searching or understanding project code, use CodeGraph before rg/grep/ broad file reads.",
      "If a later request involves editing project files, generating persisted project artifacts, running a multi-step implementation or verification workflow, or preparing a commit, create or update the required task under `.sharkbay/tasks/` before making project changes.",
      "Keep Files and Work updated while working; finish by filling Summary and Verification; record the commit hash if a commit is produced.",
      "Treat `.sharkbay/team-context/` as read-only.",
    ].join(" "));
    expect(TEAMWORK_BOOTSTRAP_PROMPT).not.toContain("CodeGraph is installed and configured");
    await expect(fs.stat(path.join(repo, "AGENTS.md")).catch(() => null)).resolves.toBeNull();
    await expect(fs.stat(path.join(repo, "QWEN.md")).catch(() => null)).resolves.toBeNull();
  });

  it("passes CodeGraph plugin enabled state into terminal bootstrap preparation", async () => {
    const runtime = await makeTestRuntime("teamwork-bootstrap-codegraph-enabled");
    const provider = new CaptureTerminalProvider();
    const host = new PluginHost();
    host.registerPlugin(codeGraphBundledPlugin(), { source: "bundled" });
    const core = new SharkBayCoreService([provider], host);

    await core.createTerminal(runtime, { cwdUri: "local:/tmp/project", agentId: "codex", initialCommand: "codex" });
    expect(provider.terminalInputs[0]?.teamworkBootstrap?.codeGraphEnabled).toBe(true);

    core.setPluginEnabled(CODEGRAPH_PLUGIN_ID, false);
    await core.createTerminal(runtime, {
      cwdUri: "local:/tmp/project",
      agentId: "codex",
      initialCommand: "codex",
      teamworkBootstrap: { codeGraphEnabled: true },
    });
    expect(provider.terminalInputs[1]?.teamworkBootstrap?.codeGraphEnabled).toBe(false);
  });

  it("keeps existing user entry files unchanged during bootstrap preparation", async () => {
    const root = await makeTempRoot("teamwork-bootstrap-existing-entry");
    const repo = await createRealGitRepoFixture(root);
    await installHarness(repo, harnessOptions);
    await writeText(path.join(repo, "CLAUDE.md"), "# Project Claude Rules\n\nKeep this text.\n");

    const result = await prepareTeamworkAgentLaunch(repo, "claude", "claude");

    expect(result.injected).toBe(true);
    const sessionMatch = result.initialCommand.match(/^SHARKBAY_SESSION_ID='([^']+)' claude '--session-id' '([^']+)'/);
    expect(sessionMatch?.[1]).toBe(sessionMatch?.[2]);
    expect(result.initialCommand).toContain("claude '--session-id'");
    expect(result.initialCommand).toContain("'I'\\''m working in SharkBay Teamwork mode");
    await expect(fs.readFile(path.join(repo, "CLAUDE.md"), "utf8")).resolves.toBe("# Project Claude Rules\n\nKeep this text.\n");
  });

  it("uses agent-specific bootstrap command arguments", async () => {
    const root = await makeTempRoot("teamwork-bootstrap-agent-args");
    const repo = await createRealGitRepoFixture(root);
    await installHarness(repo, harnessOptions);

    const geminiResult = await prepareTeamworkAgentLaunch(repo, "gemini", "gemini");
    const geminiSessionMatch = geminiResult.initialCommand.match(/^SHARKBAY_SESSION_ID='([^']+)' gemini '--session-id' '([^']+)'/);
    expect(geminiResult.injected).toBe(true);
    expect(geminiSessionMatch?.[1]).toBe(geminiSessionMatch?.[2]);
    expect(geminiResult.initialCommand).toContain("gemini '--session-id'");
    expect(geminiResult.initialCommand).toContain("'-i' 'I'\\''m working in SharkBay Teamwork mode");
    const qwenResult = await prepareTeamworkAgentLaunch(repo, "qwen", "qwen");
    const qwenSessionMatch = qwenResult.initialCommand.match(/^SHARKBAY_SESSION_ID='([^']+)' qwen '--session-id' '([^']+)'/);
    expect(qwenResult.injected).toBe(true);
    expect(qwenSessionMatch?.[1]).toBe(qwenSessionMatch?.[2]);
    expect(qwenResult.initialCommand).toContain("qwen '--session-id'");
    expect(qwenResult.initialCommand).toContain("'-i' 'I'\\''m working in SharkBay Teamwork mode");
    await expect(prepareTeamworkAgentLaunch(repo, "kiro", "kiro-cli")).resolves.toMatchObject({
      injected: true,
      initialCommand: expect.stringContaining("kiro-cli 'chat' 'I'\\''m working in SharkBay Teamwork mode"),
    });
    await expect(prepareTeamworkAgentLaunch(repo, "deepseek", "deepseek")).resolves.toMatchObject({
      injected: true,
      initialCommand: "deepseek",
    });
    await expect(prepareTeamworkAgentLaunch(repo, "opencode", "opencode")).resolves.toMatchObject({
      injected: true,
      initialCommand: "opencode",
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
    await expect(prepareTeamworkAgentLaunch(repo, "unknown-agent", "unknown-agent")).resolves.toMatchObject({
      injected: false,
      initialCommand: "unknown-agent",
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

});

async function createRealGitRepoFixture(root: string, name = "FixtureApp"): Promise<string> {
  const repo = path.join(root, name);
  await fs.mkdir(repo, { recursive: true });
  await writeJson(path.join(repo, "package.json"), { name: name.toLowerCase(), version: "1.0.0" });
  await execFileAsync("git", ["init"], { cwd: repo });
  return repo;
}
