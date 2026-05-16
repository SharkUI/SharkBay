import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRuntimeConfigPath } from "../src/main/config.js";
import {
  applyTerminalInputData,
  buildInteractiveSshArgs,
  remoteInteractiveShellCommand,
  resolveTerminalCwd,
  terminalCommand,
  terminalDisplayTitle,
  terminalShellEnvironment,
  TerminalManager,
} from "../src/main/terminal.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { createGitRepoFixture, makeTempRoot, makeTestRuntime, writeJson } from "./helpers.js";

describe("terminal cwd validation", () => {
  it("starts shells without interactive TTY-only flags or Apple session restore", () => {
    expect(terminalCommand("/bin/zsh")).toEqual({ file: "/bin/zsh", args: ["-l"] });
    expect(terminalCommand("/bin/zsh").args).not.toContain("-i");
    expect(terminalShellEnvironment).toMatchObject({
      SHELL_SESSIONS_DISABLE: "1",
      TERM_PROGRAM: "SharkBay",
    });
  });

  it("builds remote interactive ssh commands without sending -- to the remote shell", () => {
    const command = remoteInteractiveShellCommand("/Users/jerry/Code/Veridia");
    expect(command).toBe("cd '/Users/jerry/Code/Veridia' && exec ${SHELL:-/bin/sh} -l");
    expect(buildInteractiveSshArgs(["jerry@60.165.239.32"], command)).toEqual([
      "-tt",
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      "jerry@60.165.239.32",
      "cd '/Users/jerry/Code/Veridia' && exec ${SHELL:-/bin/sh} -l",
    ]);
  });

  it("allows project directories inside configured roots", async () => {
    const runtime = await makeTestRuntime("terminal-config");
    const root = await makeTempRoot("terminal-root");
    const repo = await createGitRepoFixture(root, "TerminalRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
      updatedAt: "2026-05-06",
    });

    const realRepo = await fs.realpath(repo);
    await expect(resolveTerminalCwd(runtime, toLocalProjectUri(repo))).resolves.toEqual({
      cwd: realRepo,
      cwdUri: toLocalProjectUri(realRepo),
    });
  });

  it("derives titles from project-relative cwd and foreground commands", () => {
    const root = path.join(path.sep, "Users", "shark", "Projects", "SharkBay");

    expect(terminalDisplayTitle({
      projectRoot: root,
      currentCwd: root,
      shell: "/bin/zsh",
      foregroundProcess: "zsh",
    })).toBe(".");
    expect(terminalDisplayTitle({
      projectRoot: root,
      currentCwd: path.join(root, "src", "main"),
      shell: "/bin/zsh",
      foregroundProcess: "zsh",
    })).toBe(path.join("src", "main"));
    expect(terminalDisplayTitle({
      projectRoot: root,
      currentCwd: path.join(root, "src"),
      shell: "/bin/zsh",
      foregroundProcess: "node",
      activeCommandLine: "pnpm dev:server",
    })).toBe("pnpm dev:server");
    expect(terminalDisplayTitle({
      projectRoot: root,
      currentCwd: root,
      shell: "/bin/zsh",
      foregroundProcess: "top",
      activeCommandLine: "q",
    })).toBe("top");
    expect(terminalDisplayTitle({
      projectRoot: root,
      currentCwd: root,
      shell: "/bin/zsh",
      foregroundProcess: "codex",
      activeCommandLine: "10;rgb:d9d9/e5e5/dfdf",
    })).toBe("codex");
    expect(terminalDisplayTitle({
      projectRoot: root,
      currentCwd: root,
      shell: "/bin/zsh",
      foregroundProcess: "claude",
      activeCommandLine: "fix this file",
    })).toBe("claude");
    expect(terminalDisplayTitle({
      projectRoot: root,
      currentCwd: root,
      shell: "/bin/zsh",
      foregroundProcess: "node",
      activeCommandLine: "pnpm dev",
      serviceLabel: "dev",
    })).toBe("dev");
  });

  it("tracks submitted command lines from terminal input", () => {
    expect(applyTerminalInputData("", "pnpm dev:server\r")).toEqual({
      pendingInputLine: "",
      submittedCommand: "pnpm dev:server",
    });
    expect(applyTerminalInputData("pnpm dev:serve", "r\n")).toEqual({
      pendingInputLine: "",
      submittedCommand: "pnpm dev:server",
    });
    expect(applyTerminalInputData("codexx", "\u007f\r")).toEqual({
      pendingInputLine: "",
      submittedCommand: "codex",
    });
    expect(applyTerminalInputData("claude", "\u0015top\r")).toEqual({
      pendingInputLine: "",
      submittedCommand: "top",
    });
    expect(applyTerminalInputData("", "\u001b]10;rgb:d9d9/e5e5/dfdf\u0007")).toEqual({
      pendingInputLine: "",
      submittedCommand: null,
    });
    expect(applyTerminalInputData("", "\u001b]10;rgb:d9d9/e5e5/dfdf\u001b\\")).toEqual({
      pendingInputLine: "",
      submittedCommand: null,
    });
  });

  it("rejects directories outside configured roots", async () => {
    const runtime = await makeTestRuntime("terminal-config");
    const root = await makeTempRoot("terminal-root");
    const outsideRoot = await makeTempRoot("terminal-outside");
    const outsideRepo = path.join(outsideRoot, "OutsideRepo");
    await fs.mkdir(outsideRepo);
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
      updatedAt: "2026-05-06",
    });

    await expect(resolveTerminalCwd(runtime, toLocalProjectUri(outsideRepo))).rejects.toThrow(/outside configured roots/);
  });

  it("creates and closes a terminal session in a safe cwd", async () => {
    const runtime = await makeTestRuntime("terminal-config");
    const root = await makeTempRoot("terminal-root");
    const repo = await createGitRepoFixture(root, "TerminalRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
      updatedAt: "2026-05-06",
    });

    const manager = new TerminalManager();
    const session = await manager.create(runtime, { cwdUri: toLocalProjectUri(repo), title: "TerminalRepo" });

    try {
      expect(session.cwdUri).toBe(toLocalProjectUri(await fs.realpath(repo)));
      expect(session.title).toBe(".");
      expect(session.status).toBe("running");
      expect(manager.list()).toHaveLength(1);
    } finally {
      manager.close({ sessionId: session.id });
    }

    expect(manager.list()).toHaveLength(0);
  });

  it("ignores invalid resize dimensions without surfacing node-pty errors", async () => {
    const runtime = await makeTestRuntime("terminal-config");
    const root = await makeTempRoot("terminal-root");
    const repo = await createGitRepoFixture(root, "TerminalRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
      updatedAt: "2026-05-07",
    });

    const manager = new TerminalManager();
    const session = await manager.create(runtime, { cwdUri: toLocalProjectUri(repo), title: "TerminalRepo" });

    try {
      expect(() => manager.resize({ sessionId: session.id, cols: Number.NaN, rows: 24 })).not.toThrow();
      expect(() => manager.resize({ sessionId: session.id, cols: 80, rows: 0 })).not.toThrow();
      expect(manager.resize({ sessionId: session.id, cols: 80, rows: 24 })).toMatchObject({
        id: session.id,
        status: "running",
      });
    } finally {
      manager.close({ sessionId: session.id });
    }
  });

  it("accepts input and streams command output", async () => {
    const runtime = await makeTestRuntime("terminal-config");
    const root = await makeTempRoot("terminal-root");
    const repo = await createGitRepoFixture(root, "TerminalRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
      updatedAt: "2026-05-06",
    });

    const manager = new TerminalManager();
    const session = await manager.create(runtime, { cwdUri: toLocalProjectUri(repo), title: "TerminalRepo" });
    const output = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("terminal output timed out")), 3000);
      manager.on("data", (event) => {
        if (event.sessionId === session.id && event.data.includes("sharkbay-terminal-ok")) {
          clearTimeout(timeout);
          resolve(event.data);
        }
      });
    });

    try {
      manager.input({ sessionId: session.id, data: "printf 'sharkbay-terminal-ok\\n'\n" });
      await expect(output).resolves.toContain("sharkbay-terminal-ok");
    } finally {
      manager.close({ sessionId: session.id });
    }
  });

  it("can start a service session with an initial command and service metadata", async () => {
    const runtime = await makeTestRuntime("terminal-service-config");
    const root = await makeTempRoot("terminal-service-root");
    const repo = await createGitRepoFixture(root, "TerminalServiceRepo");
    await writeJson(getRuntimeConfigPath(runtime), {
      schemaVersion: 1,
      configuredRoots: [root],
      updatedAt: "2026-05-08",
    });

    const manager = new TerminalManager();
    let sessionId: string | null = null;
    const output = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("service terminal output timed out")), 3000);
      manager.on("data", (event) => {
        if ((!sessionId || event.sessionId === sessionId) && event.data.includes("sharkbay-service-ok")) {
          clearTimeout(timeout);
          resolve(event.data);
        }
      });
    });
    const exited = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("service terminal exit timed out")), 3000);
      manager.on("exit", (event) => {
        if ((!sessionId || event.sessionId === sessionId)) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    const session = await manager.create(runtime, {
      cwdUri: toLocalProjectUri(repo),
      initialCommand: "printf 'sharkbay-service-ok\\n'",
      service: { id: "dev", label: "dev", command: "npm run dev" },
    });
    sessionId = session.id;

    try {
      expect(session.title).toBe("dev");
      expect(session.service).toEqual({ id: "dev", label: "dev", command: "npm run dev" });
      await expect(output).resolves.toContain("sharkbay-service-ok");
      await expect(exited).resolves.toBeUndefined();
    } finally {
      manager.close({ sessionId: session.id });
    }
  });
});
