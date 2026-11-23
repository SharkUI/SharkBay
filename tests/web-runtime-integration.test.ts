import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm, writeFile, symlink, readFile, chmod } from "node:fs/promises";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocket } from "ws";
import { createWebBridge } from "../src/renderer/bridge/web-bridge.js";
import { RuntimeClient, runtimeControlPath } from "../src/runtime/control-client.js";
import { createRuntimeControl } from "../src/runtime/control-server.js";
import { ApplicationRuntime } from "../src/runtime/application-runtime.js";
import { createWebServer } from "../src/server/http-server.js";
import { createDefaultConfig, saveAppConfig } from "../src/main/config.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { attachmentPromptForm, maxPromptAttachmentTotalBytes, maxPromptImageBytes, promptAttachmentSizeError } from "../src/shared/application-api.js";

type Message = { type: string; clientId?: string; name?: string; code?: string; payload?: any };
type Browser = { cookie: string; origin: string; socket: WebSocket; clientId: string; messages: Message[] };
const lanAddress = Object.values(networkInterfaces()).flat().find((address) => address?.family === "IPv4" && !address.internal)?.address;
let directory: string, project: string, uri: string;
let runtime: ApplicationRuntime;
let server: Awaited<ReturnType<typeof createWebServer>>;
let control: Awaited<ReturnType<typeof createRuntimeControl>>;
const desktops: RuntimeClient[] = [];
const browsers: Browser[] = [];
async function waitFor<T>(read: () => T | undefined, timeout = 5000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = read(); if (result !== undefined) return result; await new Promise((done) => setTimeout(done, 20)); }
  throw new Error("Timed out waiting for runtime event");
}
async function connect(origin = server.origin): Promise<Browser> {
  const cookie = "";
  const capabilities = await fetch(`${origin}/api/capabilities`, { headers: { Cookie: cookie } });
  expect(capabilities.status).toBe(200);
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/api/events", { headers: { Origin: origin, Cookie: cookie } });
  const messages: Message[] = [];
  socket.on("message", (raw) => messages.push(JSON.parse(raw.toString())));
  const hello = await waitFor(() => messages.find((message) => message.type === "hello"));
  const browser = { cookie, origin, socket, messages, clientId: hello.clientId! }; browsers.push(browser); return browser;
}
async function command(browser: Browser, method: string, input?: unknown, requestId = randomUUID()) {
  const response = await fetch(`${browser.origin}/api/command`, { method: "POST", headers: { Cookie: browser.cookie, Origin: browser.origin, "Content-Type": "application/json", "X-SharkBay-Request": "1", "X-SharkBay-Client": browser.clientId }, body: JSON.stringify({ requestId, method, input }) });
  return { status: response.status, ...(await response.json()) };
}
beforeAll(async () => {
  directory = await realpath(await mkdtemp(path.join(tmpdir(), "sharkbay-web-e2e-")));
  project = path.join(directory, "project"); await mkdir(project); uri = toLocalProjectUri(project);
  const gitEnv = { ...process.env }; for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete gitEnv[key];
  execFileSync("git", ["-c", "init.templateDir=", "init", "--quiet", project], { env: gitEnv });
  const staticRoot = path.join(directory, "static"); await mkdir(staticRoot); await writeFile(path.join(staticRoot, "index.html"), "<h1>SharkBay</h1>");
  await mkdir(path.join(staticRoot, "assets"));
  await writeFile(path.join(staticRoot, "assets", "main-12345678.js"), "console.log('SharkBay');\n".repeat(100));
  await writeFile(path.join(project, "hello.txt"), "before");
  await writeFile(path.join(project, "artifact.html"), "<script>fetch('/api/command')</script><h1>Artifact</h1>");
  await writeFile(path.join(directory, "private.txt"), "outside"); await symlink(path.join(directory, "private.txt"), path.join(project, "outside-link"));
  const configPath = path.join(directory, "config.json");
  await saveAppConfig({ ...createDefaultConfig(), configuredProjects: [project] }, configPath);
  runtime = new ApplicationRuntime({ userDataPath: path.join(directory, "data"), configPath }); await runtime.start();
  server = await createWebServer(runtime, { port: 0, staticRoot });
  control = await createRuntimeControl(runtime, server);
}, 15000);
afterAll(async () => {
  for (const browser of browsers) browser.socket.terminate();
  for (const desktop of desktops) desktop.dispose();
  await control?.dispose();
  await server?.dispose(); await runtime?.dispose(); await rm(directory, { recursive: true, force: true });
});
describe("local Web runtime end to end", () => {
  it("prepares Harness before a managed Agent starts and respects uninstall on both transports", async () => {
    const browser = await connect();
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath);
    desktops.push(desktop);
    const repoPath = path.join(project, "harness-launch");
    const cwdUri = toLocalProjectUri(repoPath);
    const protocol = path.join(repoPath, ".sharkbay/harness/protocol.md");
    const helper = path.join(repoPath, ".sharkbay/harness/review.sh");
    const observed = path.join(repoPath, "agent-args");
    const launch = { cwdUri, agentId: "codex", initialCommand: "sh ./fixture-agent.sh" };
    await mkdir(repoPath);
    await writeFile(path.join(repoPath, "fixture-agent.sh"),
      'test -f .sharkbay/harness/protocol.md && test -x .sharkbay/harness/review.sh && printf "%s\\n" "$@" > agent-args\n');
    try {
      expect((await command(browser, "protocol.getStatus", { repoPath })).result.installed).toBe(false);
      for (const input of [{ cwdUri, initialCommand: "true" }, { ...launch, agentId: "unsupported" }, { ...launch, initialCommand: "true # resume" }]) {
        expect((await command(browser, "terminal.create", input)).ok).toBe(true);
        await expect(readFile(protocol)).rejects.toMatchObject({ code: "ENOENT" });
      }

      expect((await command(browser, "terminal.create", launch)).ok).toBe(true);
      await vi.waitFor(async () => expect(await readFile(observed, "utf8")).toContain(".sharkbay/harness/protocol.md"));
      const customProtocol = (await readFile(protocol, "utf8")) + "\n# Keep my Harness edits\n";
      const machineId = await readFile(path.join(repoPath, ".sharkbay/machine-id"), "utf8");
      await writeFile(protocol, customProtocol);
      await rm(helper);
      await desktop.call("terminal.create", launch);
      await expect(readFile(helper, "utf8")).resolves.toContain("sharkbay-review-control");
      expect(await readFile(protocol, "utf8")).toContain("# Keep my Harness edits");
      expect(await readFile(path.join(repoPath, ".sharkbay/machine-id"), "utf8")).toBe(machineId);

      expect((await command(browser, "protocol.uninstall", { repoPath })).ok).toBe(true);
      await desktop.call("terminal.create", launch);
      await expect(readFile(protocol)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await command(browser, "protocol.getStatus", { repoPath })).result).toMatchObject({ installed: false, autoInstallDisabled: true });
      expect((await command(browser, "protocol.install", { repoPath })).result.installed).toBe(true);
      expect((await command(browser, "config.get")).result.protocolAutoInstallDisabled).toBeUndefined();
    } finally {
      runtime.core.closeAllTerminalSessions();
    }
  });

  it("starts Agents without injecting Task Protocol when automatic Harness preparation fails", async () => {
    const browser = await connect();
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath);
    desktops.push(desktop);
    const fresh = path.join(project, "harness-path-conflict");
    const existing = path.join(project, "harness-incomplete");
    const blockedFile = path.join(fresh, ".sharkbay");
    const existingProtocol = path.join(existing, ".sharkbay", "harness", "protocol.md");
    await mkdir(fresh);
    await writeFile(blockedFile, "Existing project file\n");
    await mkdir(path.join(path.dirname(existingProtocol), "review.sh"), { recursive: true });
    await writeFile(existingProtocol, "Existing Task Protocol\n");
    const launch = (repoPath: string) => ({ cwdUri: toLocalProjectUri(repoPath), agentId: "codex", initialCommand: "sh ./fixture-agent.sh" });
    for (const repoPath of [fresh, existing]) {
      await writeFile(path.join(repoPath, "fixture-agent.sh"), 'printf "%s\\n" started "$@" > launch-args\n');
    }

    try {
      const browserLaunch = await command(browser, "terminal.create", launch(fresh));
      expect(browserLaunch.ok).toBe(true);
      expect(browserLaunch.result.launchWarning).toMatch(/Task Protocol.*unsafe file type/);
      const desktopLaunch = await desktop.call<{ launchWarning?: string }>("terminal.create", launch(existing));
      expect(desktopLaunch.launchWarning).toMatch(/Task Protocol.*(?:EISDIR|illegal operation on a directory)/);
      for (const repoPath of [fresh, existing]) {
        await vi.waitFor(async () => {
          const args = await readFile(path.join(repoPath, "launch-args"), "utf8");
          expect(args).toMatch(/^started\n/);
          expect(args).not.toContain(".sharkbay/harness/protocol.md");
        });
      }
      expect((await command(browser, "protocol.install", { repoPath: fresh })).ok).toBe(false);
      expect(await readFile(blockedFile, "utf8")).toBe("Existing project file\n");
      expect(await readFile(existingProtocol, "utf8")).toBe("Existing Task Protocol\n");
    } finally {
      runtime.core.closeAllTerminalSessions();
    }
  });

  it("adds session Hooks from either transport and keeps the host opt-out", async () => {
    const browser = await connect();
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath);
    desktops.push(desktop);
    const repoPath = path.join(project, "scoped-hooks");
    const cwdUri = toLocalProjectUri(repoPath);
    await mkdir(repoPath);
    await writeFile(path.join(repoPath, "hook-fixture.sh"),
      'printf "%s\\n" "${SHARKBAY_DISABLED_STATUS_HOOK_AGENT:-}" "$@" > "$1"\n');
    const args = (name: string) => readFile(path.join(repoPath, name), "utf8");
    const launch = (agentId: string, file: string) => ({ cwdUri, agentId, initialCommand: `sh ./hook-fixture.sh ${file}` });
    try {
      expect((await command(browser, "terminal.create", launch("codex", "codex-on"))).ok).toBe(true);
      await vi.waitFor(async () => {
        const output = await args("codex-on");
        expect(output).toContain("\n-c\nhooks = { ");
        expect(output).toContain("--source codex");
        expect(output).not.toContain("--dangerously-bypass-hook-trust");
      });
      await desktop.call("terminal.create", launch("claude", "claude-on"));
      await vi.waitFor(async () => {
        const output = await args("claude-on");
        const [, , flag, settings] = output.split("\n");
        expect(flag).toBe("--settings");
        expect(JSON.parse(settings!).hooks.SessionStart[0].hooks[0].command).toContain("--source claude");
      });
      expect((await command(browser, "agents.setHooksEnabled", { agentId: "codex", enabled: false })).ok).toBe(true);
      expect((await command(browser, "config.get")).result.disabledSessionHooks).toEqual(["codex"]);
      await desktop.call("terminal.create", launch("codex", "codex-off"));
      await vi.waitFor(async () => {
        const output = await args("codex-off");
        expect(output).toMatch(/^codex\n/);
        expect(output).not.toContain("hooks = {");
      });
    } finally {
      await desktop.call("agents.setHooksEnabled", { agentId: "codex", enabled: true });
      runtime.core.closeAllTerminalSessions();
    }
  });

  it("loads session Hook plugins and defaults only in the launched Agent command", async () => {
    const browser = await connect();
    const repoPath = path.join(project, "additional-hooks");
    const cwdUri = toLocalProjectUri(repoPath);
    await mkdir(repoPath);
    await writeFile(path.join(repoPath, "capture.sh"),
      'file="$1"; shift\nprintf "%s\\n" "${GEMINI_CLI_SYSTEM_DEFAULTS_PATH:-}" "${QWEN_CODE_SYSTEM_DEFAULTS_PATH:-}" "${OPENCODE_CONFIG_CONTENT:-}" "${SHARKBAY_DISABLED_STATUS_HOOK_AGENT:-}" "$@" > "$file"\n');
    const opencodeCli = path.join(repoPath, "opencode");
    const opencodeHome = path.join(repoPath, "open code home");
    await mkdir(opencodeHome);
    await writeFile(opencodeCli, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.19.0; exit; fi\nexec sh ./capture.sh "$@"\n', { mode: 0o755 });
    const output = async (name: string) => (await readFile(path.join(repoPath, name), "utf8")).split("\n");
    async function launch(agentId: string, file = agentId, prefix = "") {
      const next = agentId === "cursor" ? "" : `; sh ./capture.sh ${file}-next`;
      const executable = agentId === "opencode" ? `'${opencodeCli}'` : "sh ./capture.sh";
      const input = { cwdUri, agentId, initialCommand: `${prefix}${executable} ${file} --resume native-id${next}` };
      const created = await command(browser, "terminal.create", input);
      expect(created.ok).toBe(true);
      try {
        await vi.waitFor(async () => expect((await output(file)).slice(4, 6)).toEqual(["--resume", "native-id"]), { timeout: 2500 });
      } catch (error) {
        const terminalOutput = browser.messages.filter(message => message.name === "terminal:data" && message.payload.sessionId === created.result.id);
        throw new Error(`Agent fixture ${file} did not launch: ${terminalOutput.map(message => message.payload.data).join("")}`, { cause: error });
      }
      return output(file);
    }
    try {
      for (const [id, index] of [["gemini", 0], ["qwen", 1]] as const) {
        const captured = await launch(id);
        const settings = JSON.parse(await readFile(captured[index]!, "utf8"));
        expect(settings.hooks.SessionStart[0].hooks[0].command).toContain(`--source ${id}`);
      }
      const cursor = await launch("cursor");
      expect(cursor[6]).toBe("--plugin-dir");
      const cursorHooks = JSON.parse(await readFile(path.join(cursor[7]!, "hooks", "hooks.json"), "utf8"));
      expect(cursorHooks.hooks.sessionStart[0].command).toContain("--source cursor");
      expect(cursorHooks.hooks.beforeShellExecution).toBeUndefined();
      vi.stubEnv("HOME", opencodeHome);
      vi.stubEnv("XDG_CONFIG_HOME", opencodeHome);
      vi.stubEnv("SHELL", "/bin/sh");
      expect((await launch("opencode", "cold"))[2]).toBe("");
      const userPlugin = path.join(opencodeHome, "opencode", "plugins", "sharkbay-status.js");
      expect(await readFile(userPlugin, "utf8")).toContain('SHARKBAY_MANAGED_STATUS_HOOK_AGENT !== "opencode"');
      expect((await launch("opencode", "cold-again"))[2]).toBe("");
      const warmHome = path.join(repoPath, "open code warm home");
      vi.stubEnv("XDG_CONFIG_HOME", warmHome);
      const sdk = path.join(warmHome, "opencode", "node_modules", "@opencode-ai", "plugin");
      await mkdir(sdk, { recursive: true });
      await writeFile(path.join(sdk, "package.json"), '{"version":"1.19.0"}');
      const opencode = await launch("opencode", "open-code-on");
      const [plugin] = JSON.parse(opencode[2]!).plugin;
      expect(await readFile(new URL("index.js", plugin), "utf8")).toContain("SHARKBAY_AGENT_LAUNCH_TOKEN");
      expect((await launch("qwen", "explicit", "QWEN_CODE_SYSTEM_DEFAULTS_PATH=chosen "))[1]).toBe("chosen");
      await vi.waitFor(async () => {
        for (const id of ["open-code-on", "gemini", "qwen"]) {
          expect((await output(`${id}-next`)).slice(0, 4)).toEqual(["", "", "", ""]);
        }
      });
      expect((await command(browser, "agents.setHooksEnabled", { agentId: "opencode", enabled: false })).ok).toBe(true);
      expect((await launch("opencode", "disabled")).slice(0, 4)).toEqual(["", "", "", "opencode"]);
      await vi.waitFor(async () => expect((await output("disabled-next")).slice(0, 4)).toEqual(["", "", "", ""]));
    } finally {
      vi.unstubAllEnvs();
      await command(browser, "agents.setHooksEnabled", { agentId: "opencode", enabled: true });
      runtime.core.closeAllTerminalSessions();
    }
  }, 10000);

  it("registers managed Reasonix and Kiro hooks before launching and preserves user settings", async () => {
    const browser = await connect();
    const repoPath = path.join(project, "auto-registered-hooks");
    const kiroHome = path.join(repoPath, "kiro-home");
    const reasonixHome = path.join(repoPath, "reasonix-home");
    const profile = path.join(kiroHome, "agents", "custom.json");
    const reasonixSettings = path.join(reasonixHome, "settings.json");
    await mkdir(path.dirname(profile), { recursive: true });
    await mkdir(path.dirname(reasonixSettings), { recursive: true });
    await writeFile(profile, '{"name":"custom","tools":["fs_read"],"allowedTools":[],"hooks":{"stop":[{"command":"echo user"}]}}');
    await writeFile(reasonixSettings, '{"theme":"dark","hooks":{"Stop":[{"command":"echo user"}]}}');
    const kiro = path.join(repoPath, "kiro-cli");
    await writeFile(kiro, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "kiro-cli $KIRO_FIXTURE_VERSION"; exit; fi\nprintf "%s\\n" "$SHARKBAY_MANAGED_STATUS_HOOK_AGENT" "$@" > kiro-args\n', { mode: 0o755 });
    const commandPrefix = `'${kiro}' chat`;
    async function launch(agentId: string, initialCommand: string) {
      expect((await command(browser, "terminal.create", { cwdUri: toLocalProjectUri(repoPath), agentId, initialCommand })).ok).toBe(true);
    }
    const read = async (file: string) => JSON.parse(await readFile(file, "utf8"));
    try {
      vi.stubEnv("KIRO_HOME", kiroHome);
      vi.stubEnv("REASONIX_HOME", reasonixHome);
      vi.stubEnv("KIRO_FIXTURE_VERSION", "2.14.1");
      await launch("reasonix", "true --resume");
      const reasonix = await read(reasonixSettings);
      expect(reasonix.theme).toBe("dark");
      expect(reasonix.hooks.Stop).toEqual([{ command: "echo user" }, expect.objectContaining({ command: expect.stringContaining("--source reasonix --managed-launch") })]);
      await launch("reasonix", "true --resume");
      expect(await read(reasonixSettings)).toEqual(reasonix);

      await launch("kiro", `${commandPrefix} --agent custom --resume-id session-123`);
      const custom = await read(profile);
      expect(custom.tools).toEqual(["fs_read"]);
      expect(custom.allowedTools).toEqual([]);
      expect(custom.hooks.stop).toEqual([{ command: "echo user" }, expect.objectContaining({ command: expect.stringContaining("--source kiro --managed-launch") })]);
      await vi.waitFor(async () => expect(await readFile(path.join(repoPath, "kiro-args"), "utf8")).toBe("kiro\nchat\n--agent\ncustom\n--resume-id\nsession-123\n"));

      await launch("kiro", `${commandPrefix} --resume-id session-123`);
      expect(await read(path.join(kiroHome, "agents", "sharkbay-status.json"))).toMatchObject({ name: "sharkbay-status", tools: ["*"] });
      await vi.waitFor(async () => expect(await readFile(path.join(repoPath, "kiro-args"), "utf8")).toContain("--agent\nsharkbay-status\n"));

      vi.stubEnv("KIRO_FIXTURE_VERSION", "3.1.0");
      await launch("kiro", `${commandPrefix} --v3 --resume-id session-123`);
      const v3 = await read(path.join(kiroHome, "hooks", "sharkbay-status.json"));
      expect(v3.version).toBe("v1");
      expect(v3.hooks).toContainEqual(expect.objectContaining({ trigger: "SessionStart", action: expect.objectContaining({ command: expect.stringContaining("--managed-launch") }) }));
      await vi.waitFor(async () => expect(await readFile(path.join(repoPath, "kiro-args"), "utf8")).toBe("kiro\nchat\n--v3\n--resume-id\nsession-123\n"));
      expect(await read(profile)).toEqual(custom);
    } finally {
      vi.unstubAllEnvs();
      runtime.core.closeAllTerminalSessions();
    }
  }, 10000);

  it("opens linked worktrees and manages local branches without deleting local files", async () => {
    const browser = await connect();
    const repoPath = path.join(directory, "Sidebar repo");
    const linked = path.join(directory, "Linked worktree");
    const git = (...args: string[]) => execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" });
    await mkdir(repoPath);
    git("init", "-b", "main");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--allow-empty", "-m", "initial");
    git("worktree", "add", "-b", "feature/linked", linked);
    git("branch", "feature/available");
    expect((await command(browser, "config.addProject", { path: repoPath })).ok).toBe(true);
    const workspace = (await command(browser, "projects.getGitWorkspace", { repoPath })).result;
    expect(workspace.worktrees.map((item: { path: string; branch: string }) => [item.path, item.branch])).toEqual([
      [repoPath, "main"], [linked, "feature/linked"],
    ]);
    expect(workspace.branches).toContain("feature/available");
    expect((await command(browser, "config.openWorktree", { repoPath, worktreePath: directory })).status).toBe(400);
    expect((await command(browser, "config.openWorktree", { repoPath, worktreePath: linked })).ok).toBe(true);

    const protectedFile = path.join(linked, ".local-task");
    await writeFile(protectedFile, "keep this");
    expect((await command(browser, "config.removeWorktree", { repoPath, worktreePath: linked })).ok).toBe(false);
    expect(await readFile(protectedFile, "utf8")).toBe("keep this");
    await rm(protectedFile);
    expect((await command(browser, "config.removeWorktree", { repoPath, worktreePath: linked })).ok).toBe(true);
    expect(git("branch", "--list", "feature/linked")).toContain("feature/linked");
    expect((await command(browser, "config.deleteLocalBranch", { repoPath, branch: "feature/linked" })).ok).toBe(true);

    const opened = await command(browser, "config.createWorktree", { sourceProjectPath: repoPath, branchName: "feature/available", existingBranch: true });
    expect(opened.ok).toBe(true);
    expect(git("worktree", "list", "--porcelain")).toContain("branch refs/heads/feature/available");
    expect((await command(browser, "config.deleteLocalBranch", { repoPath, branch: "feature/available" })).ok).toBe(false);
    expect((await command(browser, "config.removeWorktree", { repoPath, worktreePath: opened.result.targetPath })).ok).toBe(true);
    expect((await command(browser, "config.removeProject", { path: repoPath })).ok).toBe(true);
  });

  it("fetches origin branches and opens one with tracking, excluding the team context branch", async () => {
    const browser = await connect();
    const repoPath = path.join(directory, "Remote branches repo");
    const origin = path.join(directory, "origin.git");
    const git = (...args: string[]) => execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    await mkdir(repoPath);
    git("init", "-b", "main");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--allow-empty", "-m", "initial");
    git("init", "--bare", origin);
    git("push", origin, "HEAD:refs/heads/main", "HEAD:refs/heads/feature/on-origin", "HEAD:refs/heads/sharkbay-team-context");
    git("remote", "add", "-t", "main", "origin", origin);
    git("branch", "sharkbay-team-context");
    git("update-ref", "refs/remotes/origin/expired", "HEAD");
    expect((await command(browser, "config.addProject", { path: repoPath })).ok).toBe(true);

    expect((await command(browser, "projects.getGitWorkspace", { repoPath })).result.remoteBranches).toEqual(["expired"]);
    expect((await command(browser, "projects.fetchGitBranches", { repoPath })).ok).toBe(true);
    git("remote", "set-head", "origin", "main");
    const workspace = (await command(browser, "projects.getGitWorkspace", { repoPath })).result;
    expect(workspace.branches).toEqual(["main"]);
    expect(workspace.remoteBranches).toEqual(["feature/on-origin", "main"]);
    expect(git("show-ref", "--verify", "refs/remotes/origin/sharkbay-team-context")).toContain("sharkbay-team-context");
    expect(git("config", "--get-all", "remote.origin.fetch")).toBe("+refs/heads/main:refs/remotes/origin/main");

    const open = (branchName: string) => command(browser, "config.createWorktree", { sourceProjectPath: repoPath, branchName, trackOrigin: true });
    expect((await open("sharkbay-team-context")).ok).toBe(false);
    const opened = await open("feature/on-origin");
    expect(opened.ok).toBe(true);
    expect(git("rev-parse", "--symbolic-full-name", "feature/on-origin@{upstream}")).toBe("refs/remotes/origin/feature/on-origin");
    expect(git("config", "--get-all", "remote.origin.fetch").split("\n")).toEqual([
      "+refs/heads/main:refs/remotes/origin/main", "+refs/heads/feature/on-origin:refs/remotes/origin/feature/on-origin",
    ]);
    expect(git("worktree", "list", "--porcelain")).toContain("branch refs/heads/feature/on-origin");
    expect((await command(browser, "config.removeWorktree", { repoPath, worktreePath: opened.result.targetPath })).ok).toBe(true);
    expect((await command(browser, "config.removeProject", { path: repoPath })).ok).toBe(true);
  });

  it("compresses static text when accepted and preserves clients that decline gzip", async () => {
    const url = `${server.origin}/assets/main-12345678.js`;
    const content = "console.log('SharkBay');\n".repeat(100);
    const compressed = await fetch(url, { headers: { "Accept-Encoding": "br, gzip;q=0.8" } });
    expect(compressed.headers.get("content-encoding")).toBe("gzip");
    expect(compressed.headers.get("vary")).toBe("Accept-Encoding");
    expect(Number(compressed.headers.get("content-length"))).toBeLessThan(Buffer.byteLength(content) / 2);
    expect(await compressed.text()).toBe(content);
    for (const encoding of ["identity", "gzip;q=0", "gzip;q=0.00, *;q=1"]) {
      const response = await fetch(url, { headers: { "Accept-Encoding": encoding } });
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(Number(response.headers.get("content-length"))).toBe(Buffer.byteLength(content));
      expect(await response.text()).toBe(content);
    }
    const head = await fetch(url, { method: "HEAD", headers: { "Accept-Encoding": "gzip" } });
    expect(head.headers.get("content-encoding")).toBe("gzip");
    expect(head.headers.get("content-length")).toBe(compressed.headers.get("content-length"));
    expect((await head.arrayBuffer()).byteLength).toBe(0);
  });
  it("caches content-hashed assets while keeping entry HTML and APIs fresh across upgrades", async () => {
    const asset = await fetch(`${server.origin}/assets/main-12345678.js`);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    await asset.arrayBuffer();
    for (const route of ["/", "/index.html", "/api/capabilities"]) {
      const response = await fetch(server.origin + route);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await response.arrayBuffer();
    }
  });
  it("submits mixed attachments from both clients through the same controlled Codex PTY", async () => {
    const owner = await connect();
    const observer = await connect();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGM4EWhCU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAHWBNEy+MpZVAAAAAElFTkSuQmCC", "base64");
    const paste = (browser: Browser, sessionId: string, data = png, origin = browser.origin) => fetch(
      `${browser.origin}/api/terminal/clipboard-image?sessionId=${sessionId}`,
      { method: "POST", headers: { Origin: origin, "Content-Type": "image/png", "X-SharkBay-Request": "1", "X-SharkBay-Client": browser.clientId }, body: new Uint8Array(data) },
    );
    const imageFile = { name: "fixture.png", type: "image/png", data: Uint8Array.from(png).buffer };
    const csv = new Uint8Array(maxPromptImageBytes + 1).fill(0x0a);
    csv.set(new TextEncoder().encode("a,b\n1,2\n"));
    const csvFile = { name: "report with spaces.csv", type: "text/csv", data: csv.buffer };
    const atBudget = { name: csvFile.name, type: csvFile.type, size: maxPromptAttachmentTotalBytes };
    expect(promptAttachmentSizeError([atBudget])).toBeUndefined();
    expect(promptAttachmentSizeError([atBudget, { ...atBudget, size: 1 }])).toContain("64 MiB");
    const postAttachments = (origin: string, authorization: Record<string, string>, sessionId: string, requestId: string, body: FormData) => fetch(
      `${origin}/api/terminal/attachment-prompt?sessionId=${sessionId}`,
      { method: "POST", headers: { Origin: origin, "X-SharkBay-Request": "1", ...authorization, "X-SharkBay-Request-Id": requestId }, body },
    );
    const submit = (origin: string, authorization: Record<string, string>, sessionId: string, requestId: string, text: string, files = [imageFile, csvFile]) => postAttachments(
      origin, authorization, sessionId, requestId, attachmentPromptForm({ sessionId, requestId, text, files }),
    );
    await writeFile(path.join(project, "clipboard-fixture.cjs"), `
      process.stdin.setRawMode(true);
      process.stdout.write("\\x1b[?2004hCLIPBOARD_FIXTURE_READY\\n");
      process.stdin.on("data", chunk => process.stdout.write("CLIPBOARD_FIXTURE_INPUT " + JSON.stringify(chunk.toString()) + "\\n"));
    `);
    // Exercise the PTY protocol without depending on a locally installed agent.
    const { result: session } = await command(owner, "terminal.create", {
      cwdUri: uri, agentId: "codex", initialCommand: `"${process.execPath}" clipboard-fixture.cjs # resume`,
    });
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(desktop);
    try {
      expect(session.agentId).toBe("codex");
      await waitFor(() => owner.messages.find((message) => message.name === "terminal:data" && message.payload.sessionId === session.id && message.payload.data.includes("CLIPBOARD_FIXTURE_READY")));
      expect((await paste(observer, session.id)).status).toBe(409);
      expect((await paste(owner, session.id, png, "http://cross-site.test")).status).toBe(403);
      expect((await paste(owner, session.id, Buffer.from("not an image"))).status).toBe(415);
      expect((await paste(owner, session.id, Buffer.alloc(maxPromptImageBytes + 1))).status).toBe(413);
      expect((await paste(owner, session.id)).status).toBe(200);
      const marker = "CLIPBOARD_FIXTURE_INPUT ";
      const terminalInput = () => owner.messages
        .filter((message) => message.name === "terminal:data" && message.payload.sessionId === session.id)
        .map((message) => message.payload.data).join("").split("\n").slice(0, -1)
        .filter((line) => line.startsWith(marker)).map((line) => JSON.parse(line.slice(marker.length)) as string).join("");
      const pasted = await waitFor(() => terminalInput() || undefined);
      const imageUrl = /^\x1b\[200~(file:\/\/.+\.png)\x1b\[201~$/.exec(pasted)?.[1];
      expect(imageUrl).toBeDefined();
      expect(await readFile(new URL(imageUrl!))).toEqual(png);

      const requestId = randomUUID();
      const prompt = "Describe the attachments\n第二行";
      const webAuth = { "X-SharkBay-Client": owner.clientId };
      const observerAuth = { "X-SharkBay-Client": observer.clientId };
      const { origin: desktopOrigin, token } = await desktop.call<{ origin: string; token: string }>("terminal.attachmentUpload");
      const desktopAuth = { "X-SharkBay-Attachment-Token": token };
      expect((await submit(owner.origin, observerAuth, session.id, requestId, prompt)).status).toBe(409);
      expect((await submit(desktopOrigin, desktopAuth, session.id, requestId, prompt)).status).toBe(409);
      expect((await submit(owner.origin, webAuth, session.id, requestId, prompt, [imageFile, { ...imageFile, data: new ArrayBuffer(1) }])).status).toBe(415);
      const oversizedImage = new FormData();
      oversizedImage.set("prompt", prompt);
      oversizedImage.append("file", new Blob([csv], { type: "application/octet-stream" }), "oversized.PNG");
      expect((await postAttachments(owner.origin, webAuth, session.id, requestId, oversizedImage)).status).toBe(413);
      expect(terminalInput()).toBe(pasted);
      const attempts = await Promise.all([
        submit(owner.origin, webAuth, session.id, requestId, prompt),
        submit(owner.origin, webAuth, session.id, requestId, prompt),
      ]);
      expect(attempts.map((response) => response.status)).toEqual([200, 200]);
      expect((await submit(owner.origin, webAuth, session.id, requestId, "different text")).status).toBe(409);
      expect((await submit(owner.origin, webAuth, session.id, randomUUID(), "", [imageFile])).status).toBe(200);
      await desktop.call("terminal.claim", { sessionId: session.id });
      expect((await submit(desktopOrigin, { "X-SharkBay-Attachment-Token": randomUUID() }, session.id, randomUUID(), prompt)).status).toBe(409);
      if (lanAddress) {
        const lanOrigin = desktopOrigin.replace("127.0.0.1", lanAddress);
        expect((await submit(lanOrigin, desktopAuth, session.id, randomUUID(), prompt)).status).toBe(409);
      }
      expect((await submit(desktopOrigin, desktopAuth, session.id, randomUUID(), prompt)).status).toBe(200);
      desktop.dispose();
      await waitFor(() => runtime.terminals.owner(session.id) === null || undefined);
      expect((await submit(desktopOrigin, desktopAuth, session.id, randomUUID(), prompt)).status).toBe(409);
      const inputs = await waitFor(() => {
        const data = terminalInput().slice(pasted.length).split("\r");
        return data.length >= 4 ? data : undefined;
      });
      expect(inputs).toHaveLength(4);
      expect(inputs[3]).toBe("");
      expect(inputs[1]).toMatch(/^\x1b\[200~file:\/\/[^\x1b]+\.png\x1b\[201~$/);
      for (const index of [0, 2]) {
        const format = /^\x1b\[200~(file:\/\/[^\x1b]+\.png)\x1b\[201~\x1b\[200~([^\x1b]+?)\n\nAttached files \(local paths\):\n- ("[^\n]+")\x1b\[201~$/;
        const mixed = inputs[index]!.match(format);
        expect(mixed?.[2]).toBe(prompt);
        expect(await readFile(new URL(mixed![1]!))).toEqual(png);
        const filePath = JSON.parse(mixed![3]!) as string;
        expect(path.basename(filePath)).toBe("2-report with spaces.csv");
        expect((await readFile(filePath)).equals(csv)).toBe(true);
      }
    } finally {
      await command(owner, "terminal.claim", { sessionId: session.id });
      await command(owner, "terminal.close", { sessionId: session.id });
    }
  });
  it("shares one actual PTY between the desktop transport and browser without tying it to client lifetime", async () => {
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(desktop);
    const hello = await desktop.call("hello", { protocol: 1 }); expect(hello.pid).toBe(process.pid);
    await expect(desktop.call("hello", { protocol: 99 })).rejects.toThrow("Incompatible");
    const session = await desktop.call("terminal.create", { cwdUri: uri, cols: 90, rows: 25 });
    const browser = await connect();
    expect((await command(browser, "terminal.list")).result.find((entry: any) => entry.session.id === session.id).session.pid).toBe(session.pid);
    const frames: any[] = []; desktop.on("event", (name, frame) => { if (name === "terminal:data") frames.push(frame); });
    await desktop.call("terminal.attach", { sessionId: session.id });
    expect(frames.some((frame) => frame.reset && frame.sessionId === session.id)).toBe(true);
    expect((await command(browser, "terminal.input", { sessionId: session.id, data: "echo SHOULD_NOT_RUN\r" })).status).toBe(409);
    expect((await command(browser, "terminal.claim", { sessionId: session.id })).ok).toBe(true);
    await expect(desktop.call("terminal.input", { sessionId: session.id, data: "echo SHOULD_NOT_RUN\r" })).rejects.toThrow("controlled");
    desktop.dispose();
    const marker = `CLIENT_LIFETIME_${randomUUID().slice(0, 8)}`;
    browser.socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    expect((await command(browser, "terminal.input", { sessionId: session.id, data: `printf '${marker}\\n'\r` })).ok).toBe(true);
    await waitFor(() => browser.messages.find((message) => message.name === "terminal:data" && message.payload?.data.includes(marker)));
    const reconnect = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(reconnect);
    expect((await reconnect.call("terminal.list")).find((entry: any) => entry.session.id === session.id).session.pid).toBe(session.pid);
    await reconnect.call("terminal.claim", { sessionId: session.id });
    await reconnect.call("terminal.close", { sessionId: session.id });
  });
  it("discovers a canonical profile alias and rejects non-private local endpoints", async () => {
    const alias = path.join(directory, "profile-alias"); await symlink(runtime.paths.userDataPath, alias);
    const desktop = await RuntimeClient.connect(alias); desktops.push(desktop);
    expect((await desktop.call("hello", { protocol: 1 })).pid).toBe(process.pid);
    const socketDirectory = path.dirname(runtimeControlPath(await realpath(runtime.paths.userDataPath)));
    try {
      await chmod(socketDirectory, 0o755);
      await expect(RuntimeClient.connect(runtime.paths.userDataPath)).rejects.toThrow("privately");
    } finally { await chmod(socketDirectory, 0o700); }
  });
  it("adds host directories and clones repositories through the browser with desktop parity", async () => {
    const browser = await connect();
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(desktop);
    const local = path.join(directory, "Local % 空间"); await mkdir(local);
    const alias = path.join(directory, "local-alias"); await symlink(local, alias);
    expect((await fetch(`${browser.origin}/api/command`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" }, body: JSON.stringify({ requestId: "cross-site-add", method: "config.addProject", input: { path: local } }) })).status).toBe(403);
    const listing = await command(browser, "projects.listHostDirectories", { path: directory });
    expect(listing.ok).toBe(true);
    expect(listing.result.path).toBe(directory);
    expect(listing.result.parentPath).toBe(path.dirname(directory));
    expect(listing.result.directories).toContainEqual({ name: "local-alias", path: alias });
    expect(listing.result.directories.some((entry: any) => entry.name === "private.txt")).toBe(false);
    expect((await command(browser, "projects.listHostDirectories", { path: "relative" })).status).toBe(400);
    expect((await command(browser, "projects.listHostDirectories", { path: path.join(directory, "private.txt") })).ok).toBe(false);
    expect((await command(browser, "config.addProject", { path: alias })).result.configuredProjects).toContain(local);
    await command(browser, "config.addProject", { path: local });
    await desktop.call("config.addProject", { uri: pathToFileURL(local).href });
    expect((await desktop.call("config.get")).configuredProjects.filter((entry: string) => entry === local)).toHaveLength(1);
    expect((await command(browser, "config.addProject", { path: path.join(directory, "missing") })).ok).toBe(false);
    expect((await command(browser, "config.addProject", { path: "relative" })).status).toBe(400);
    expect((await command(browser, "config.cloneProject", { url: "--upload-pack=bad", parentPath: directory })).status).toBe(400);
    expect((await command(browser, "config.cloneProject", { url: project })).status).toBe(400);
    const destination = path.join(directory, "Clone 空间"); await mkdir(destination);
    const configs: any[] = [];
    const onConfig = (name: string, payload: unknown) => { if (name === "runtime:config") configs.push(payload); };
    desktop.on("event", onConfig);
    const cloned = await command(browser, "config.cloneProject", { url: project, parentPath: destination });
    expect(cloned.result).toEqual({ cancelled: false, path: path.join(destination, "project") });
    await waitFor(() => configs.find((config) => config.configuredProjects?.includes(cloned.result.path)));
    desktop.off("event", onConfig);
    expect((await desktop.call("config.get")).configuredProjects).toContain(cloned.result.path);
    expect((await command(browser, "config.cloneProject", { url: project, parentPath: destination })).ok).toBe(false);
    const desktopDestination = path.join(directory, "desktop-clone"); await mkdir(desktopDestination);
    const desktopClone = await desktop.call("config.cloneProject", { url: project, parentPath: desktopDestination });
    expect(desktopClone).toEqual({ cancelled: false, path: path.join(desktopDestination, "project") });
    expect((await command(browser, "config.get")).result.configuredProjects).toContain(desktopClone.path);
    const scan = await command(browser, "projects.scan");
    expect(scan.result.candidates.some((entry: any) => entry.uri === toLocalProjectUri(local))).toBe(true);
    expect(scan.result.candidates.some((entry: any) => entry.uri === toLocalProjectUri(cloned.result.path))).toBe(true);
    await command(browser, "config.removeProject", { path: local });
    await command(browser, "config.removeProject", { path: cloned.result.path });
    await desktop.call("config.removeProject", { path: desktopClone.path });
  });
  it("keeps desktop-only administration off the network command endpoint", async () => {
    const browser = await connect();
    expect((await command(browser, "config.setCaffeinateMode", { mode: "off" })).status).toBe(404);
    expect((await command(browser, "config.setIslandEnabled", { enabled: false })).status).toBe(404);
    expect((await command(browser, "desktop.sessions")).status).toBe(404);
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(desktop);
    const islandConfigs: any[] = [];
    const onIslandConfig = (name: string, payload: unknown) => { if (name === "runtime:config") islandConfigs.push(payload); };
    desktop.on("event", onIslandConfig);
    await expect(desktop.call("config.setIslandEnabled", { enabled: "false" })).rejects.toThrow("Enabled required");
    for (const enabled of [false, true]) {
      expect((await desktop.call("config.setIslandEnabled", { enabled })).islandEnabled).toBe(enabled);
      await waitFor(() => islandConfigs.find((config) => config.islandEnabled === enabled));
      expect((await desktop.call("config.get")).islandEnabled).toBe(enabled);
    }
    desktop.off("event", onIslandConfig);
    expect((await desktop.call("config.get")).caffeinateMode).toBe("auto");
    expect((await desktop.call("config.setCaffeinateMode", { mode: "off" })).caffeinateMode).toBe("off");
    expect((await command(browser, "config.get")).result.caffeinateMode).toBe("off");
    await Promise.all([
      desktop.call("config.setCaffeinateMode", { mode: "on" }),
      command(browser, "config.renameProject", { uri, name: "Shared fixture" }),
    ]);
    const saved = await desktop.call("config.get");
    expect(saved.caffeinateMode).toBe("on"); expect(saved.projectAliases[uri]).toBe("Shared fixture");
  });
  it("resolves Review project URIs before filesystem access on desktop and WebUI", async () => {
    const desktop = await RuntimeClient.connect(runtime.paths.userDataPath); desktops.push(desktop);
    const browser = await connect();
    const namedDirectory = path.join(project, "Review % 空间"); await mkdir(namedDirectory);
    for (const repoPath of [project, uri, pathToFileURL(project).href, toLocalProjectUri(namedDirectory)]) {
      const input = { repoPath, taskId: "MISSING-TASK", agentId: "codex" };
      await expect(desktop.call("reviews.start", input)).rejects.toThrow("Task not found: MISSING-TASK");
      const result = await command(browser, "reviews.start", input);
      expect(result.ok).toBe(false);
      expect(result.error.message).toBe("Task not found: MISSING-TASK");
    }
    for (const repoPath of [toLocalProjectUri(directory), pathToFileURL(directory).href]) {
      const input = { repoPath, taskId: "MISSING-TASK", agentId: "codex" };
      await expect(desktop.call("reviews.start", input)).rejects.toThrow("outside configured projects");
      const result = await command(browser, "reviews.start", input);
      expect(result.ok).toBe(false);
      expect(result.error.message).toBe("Repository path is outside configured projects");
    }
  });
  it("protects HTTP/WS, Host, Origin and command envelopes", async () => {
    expect((await fetch(server.origin)).status).toBe(200);
    expect((await fetch(`${server.origin}/api/capabilities`)).status).toBe(200);
    const wrongHost = await new Promise<number>((done) => { http.get(server.origin, { headers: { Host: "attacker.invalid" } }, (response) => { response.resume(); done(response.statusCode!); }); });
    expect(wrongHost).toBe(403);
    expect((await fetch(`${server.origin}/api/session`, { method: "POST", headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    const rejected = new WebSocket(server.origin.replace("http:", "ws:") + "/api/events", { origin: "https://attacker.invalid" });
    const status = await new Promise<number>((done) => { rejected.on("unexpected-response", (_request, response) => { response.resume(); rejected.terminate(); done(response.statusCode!); }); rejected.on("error", () => {}); });
    expect(status).toBe(403);
    const browser = await connect();
    expect((await fetch(`${server.origin}/api/command`, { method: "POST", headers: { Cookie: browser.cookie, Origin: server.origin, "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    expect((await command(browser, "cancelAllCodeGraphJobs")).status).toBe(404);
    expect((await command(browser, "terminal.create", { cwdUri: uri, configPath: "/tmp/injected" })).status).toBe(400);
  });
  it("reads actual projects/tasks/files, writes inside the project and isolates artifacts", async () => {
    const browser = await connect();
    const scan = await command(browser, "projects.scan"); expect(scan.ok).toBe(true); expect(scan.result.candidates.some((candidate: any) => candidate.uri === uri)).toBe(true);
    expect((await command(browser, "projects.getDetail", { projectUri: uri })).ok).toBe(true);
    expect((await command(browser, "protocol.getTasks", { repoPath: project })).result).toEqual([]);
    expect((await command(browser, "projects.readFile", { projectUri: uri, relativePath: "hello.txt" })).result.content).toBe("before");
    expect((await command(browser, "projects.writeFile", { projectUri: uri, relativePath: "hello.txt", content: "after" })).result.ok).toBe(true);
    expect(await readFile(path.join(project, "hello.txt"), "utf8")).toBe("after");
    expect((await command(browser, "projects.readFile", { projectUri: uri, relativePath: "../private.txt" })).result?.ok).not.toBe(true);
    expect((await command(browser, "projects.readFile", { projectUri: uri, relativePath: "outside-link" })).result?.ok).not.toBe(true);
    expect((await command(browser, "protocol.getTasks", { repoPath: directory })).ok).toBe(false);
    const preview = await fetch(`${server.origin}/api/preview?url=${encodeURIComponent(pathToFileURL(path.join(project, "artifact.html")).href)}`, { headers: { Cookie: browser.cookie } });
    expect(preview.status).toBe(200); expect(preview.headers.get("content-security-policy")).toContain("sandbox allow-scripts;"); expect(preview.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    expect(preview.headers.get("content-security-policy")).toContain("connect-src 'none'");
  });
  it.skipIf(!lanAddress)("accepts LAN HTTP and WS while rejecting mismatched Host and Origin", async () => {
    const origin = server.origin.replace("127.0.0.1", lanAddress!);
    const page = await fetch(origin);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain(origin.replace("http:", "ws:"));
    expect((await fetch(`${origin}/api/capabilities`)).status).toBe(200);
    const wrongHost = await new Promise<number>((done, reject) => { http.get(origin, { headers: { Host: new URL(server.origin).host } }, (response) => { response.resume(); done(response.statusCode!); }).on("error", reject); });
    expect(wrongHost).toBe(403);
    expect((await fetch(`${origin}/api/session`, { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    const browser = await connect(origin);
    expect((await command(browser, "config.get")).ok).toBe(true);
    for (const headers of [{ Origin: server.origin }, { Origin: origin, Host: "attacker.invalid" }]) {
      const rejected = new WebSocket(origin.replace("http:", "ws:") + "/api/events", { headers });
      const status = await new Promise<number>((done) => { rejected.on("unexpected-response", (_request, response) => { response.resume(); rejected.terminate(); done(response.statusCode!); }); rejected.on("error", () => {}); });
      expect(status).toBe(403);
    }
  });
  it.each([{ mode: "loopback", address: "127.0.0.1" }, { mode: "LAN HTTP", address: lanAddress }].filter((entry) => entry.address))("runs the cookie-free Web bridge through snapshots, revoke and reconnects over $mode", async ({ address }) => {
    const nativeFetch = globalThis.fetch;
    const origin = server.origin.replace("127.0.0.1", address!);
    const location = new URL(origin);
    let cookie = "";
    const sockets: WebSocket[] = [];
    class BrowserSocket extends WebSocket {
      constructor(url: string) { super(url, { headers: { Origin: origin, Cookie: cookie } }); sockets.push(this); }
    }
    const window = new EventTarget();
    vi.stubGlobal("window", window); vi.stubGlobal("location", location);
    vi.stubGlobal("history", { replaceState: (_state: unknown, _title: string, url: string) => { location.href = new URL(url, origin).href; } });
    vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    vi.stubGlobal("WebSocket", BrowserSocket);
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers); headers.set("Origin", origin); if (cookie) headers.set("Cookie", cookie);
      const response = await nativeFetch(new URL(input, origin), { ...init, headers });
      const setCookie = response.headers.get("set-cookie"); if (setCookie) cookie = setCookie.split(";")[0]!;
      return response;
    });
    let bridge: Awaited<ReturnType<typeof createWebBridge>> | undefined;
    try {
      bridge = await createWebBridge(); expect(location.hash).toBe(""); expect(bridge.runtime.connection()).toBe("connected");
      const frames: Array<{ data: string; reset?: boolean }> = [];
      const off = bridge.terminal!.onData!((event) => frames.push(event));
      const session = await bridge.terminal!.create!({ cwdUri: uri }); bridge.runtime.attachTerminal(session.id);
      await waitFor(() => frames.find((frame) => frame.reset)); expect(bridge.runtime.canControl(session.id)).toBe(true);
      bridge.terminal!.inputFire!({ sessionId: session.id, data: "printf '%s%s\\n' 'web-bridge-' 'ok'\r" });
      await waitFor(() => frames.find((frame) => frame.data.includes("web-bridge-ok")));
      sockets[sockets.length - 1]!.close();
      await waitFor(() => bridge!.runtime.connection() === "disconnected" ? true : undefined);
      const notices: string[] = []; const offNotice = bridge.runtime.onNotice((notice) => notices.push(notice));
      bridge.terminal!.inputFire!({ sessionId: session.id, data: "do not replay" }); expect(notices).toHaveLength(1);
      await waitFor(() => bridge!.runtime.connection() === "connected" ? true : undefined);
      const terminals = await bridge.runtime.listTerminals(); expect(terminals).toHaveLength(1); expect(terminals[0]!.session.pid).toBe(session.pid);
      server.revoke();
      expect(bridge.runtime.connection()).toBe("connected");
      expect(cookie).toBe(""); expect(location.hash).toBe("");
      expect((await bridge.runtime.listTerminals())[0]!.session.pid).toBe(session.pid);
      await bridge.terminal!.close!({ sessionId: session.id }); off(); offNotice();
    } finally { bridge?.runtime.dispose(); for (const socket of sockets) socket.terminate(); vi.unstubAllGlobals(); }
  }, 10000);
  it("derives Artifact task metadata on the host without accepting client paths", async () => {
    const browser = await connect();
    const taskId = "B9R4N2-u3960864-m464da1";
    await mkdir(path.join(project, ".sharkbay/tasks"), { recursive: true });
    await writeFile(path.join(project, ".sharkbay/tasks", `${taskId}-fixture.md`), `---\nkind: sharkbay_task\ntaskId: ${taskId}\ntaskTag: B9R4N2\nmode: task\ntitle: Artifact fixture\nstatus: active\nactor: SharkUI\ngithubUserId: 3960864\nmachine: 464da1\nagent: Fixture Agent\ncreatedAt: 2026-11-13T00:00:00Z\nupdatedAt: 2026-11-13T00:00:00Z\n---\n\n## Summary\nFixture\n`);
    const original = runtime.core.createTerminal.bind(runtime.core);
    let captured: import("../src/shared/types.js").TerminalCreateInput;
    const listSpy = vi.spyOn(runtime.core, "listAgentClis").mockResolvedValue([{ id: "fixture", command: "/bin/sh", label: "Fixture", executablePath: "/bin/sh" }] as never);
    const createSpy = vi.spyOn(runtime.core, "createTerminal").mockImplementation(async (_paths, input) => {
      captured = input;
      // Use a real shell without submitting a fixture prompt to a model.
      return original(runtime.paths, { cwdUri: uri });
    });
    try {
      expect((await command(browser, "artifacts.start", { repoPath: project, taskId, agentId: "fixture", artifactPath: "/tmp/injected" })).status).toBe(400);
      const result = await command(browser, "artifacts.start", { repoPath: project, taskId, agentId: "fixture" });
      expect(result.ok).toBe(true); expect(captured!.artifact!.taskId).toBe(taskId); expect(captured!.artifact!.sourcePath).toBe(`.sharkbay/tasks/${taskId}-fixture.md`);
      expect(captured!.artifact!.artifactPath!.startsWith(".sharkbay/artifacts/")).toBe(true);
      expect(captured!.artifact!.completionToken).toBeUndefined();
      expect((await command(browser, "terminal.close", { sessionId: result.result.id })).ok).toBe(true);
      await waitFor(() => browser.messages.find((message) => message.name === "terminal:update" && message.payload.reason === "closed"));
    } finally { listSpy.mockRestore(); createSpy.mockRestore(); }
  });
  it("deduplicates terminal creation, restores the same PTY, transfers control and cleans up", async () => {
    const owner = await connect(); const requestId = randomUUID();
    const input = { cwdUri: uri, title: "Web runtime probe", cols: 100, rows: 30 };
    const [first, repeated] = await Promise.all([command(owner, "terminal.create", input, requestId), command(owner, "terminal.create", input, requestId)]);
    expect(first.ok).toBe(true); expect(repeated.result.id).toBe(first.result.id);
    expect((await command(owner, "terminal.create", { ...input, title: "different" }, requestId)).status).toBe(409);
    const session = first.result; expect(session.pid).toBeGreaterThan(0);
    owner.socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    await waitFor(() => owner.messages.find((m) => m.name === "terminal:data" && m.payload.reset));
    owner.socket.send(JSON.stringify({ type: "input", sessionId: session.id, data: "printf '%s%s\\n' 'web-runtime-' 'ok'\r" }));
    await waitFor(() => owner.messages.find((m) => m.name === "terminal:data" && m.payload.data.includes("web-runtime-ok")));
    const observer = await connect(); observer.socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    const snapshot = await waitFor(() => observer.messages.find((m) => m.name === "terminal:data" && m.payload.reset));
    expect(snapshot.payload.data).toContain("web-runtime-ok"); expect(snapshot.payload.cols).toBe(100);
    expect((await command(observer, "terminal.resize", { sessionId: session.id, cols: 80, rows: 24 })).status).toBe(409);
    expect((await command(observer, "terminal.claim", { sessionId: session.id })).ok).toBe(true);
    expect((await command(owner, "terminal.input", { sessionId: session.id, data: "bad" })).status).toBe(409);
    expect((await command(observer, "terminal.resize", { sessionId: session.id, cols: 80, rows: 24 })).ok).toBe(true);
    observer.socket.close(); await waitFor(() => observer.socket.readyState === WebSocket.CLOSED ? true : undefined);
    const reconnect = await connect(); reconnect.socket.send(JSON.stringify({ type: "attach", sessionId: session.id }));
    const restored = await waitFor(() => reconnect.messages.find((m) => m.name === "terminal:data" && m.payload.reset));
    expect(restored.payload.cols).toBe(80);
    const sessions = (await command(reconnect, "terminal.list")).result;
    expect(sessions).toHaveLength(1); expect(sessions[0].session.pid).toBe(session.pid);
    expect(() => process.kill(session.pid, 0)).not.toThrow();
    server.revoke();
    expect((await fetch(`${server.origin}/api/capabilities`)).status).toBe(200);
    const create = runtime.core.createTerminal.bind(runtime.core);
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const spy = vi.spyOn(runtime.core, "createTerminal").mockImplementation(async (paths, input) => { await gate; return create(paths, input); });
    const pending = runtime.execute("terminal.create", { cwdUri: uri }, "shutdown-probe") as Promise<import("../src/shared/types.js").TerminalSession>;
    let stopped = false;
    const stopping = runtime.dispose().then(() => { stopped = true; });
    await expect(runtime.execute("terminal.list", undefined, "shutdown-probe")).rejects.toThrow(/not ready/);
    await new Promise((done) => setTimeout(done, 20)); expect(stopped).toBe(false);
    release(); const late = await pending; await stopping; spy.mockRestore();
    expect(() => process.kill(late.pid!, 0)).toThrow();
    expect(() => process.kill(session.pid, 0)).toThrow();
    await expect(readFile(path.join(directory, "data", "runtime.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 15000);
});
