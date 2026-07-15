import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { ReviewControlServer, type ReviewControlRequest } from "../src/main/review-control-server.js";
import { makeTempRoot } from "./helpers.js";

const execFileAsync = promisify(execFile);

describe("ReviewControlServer", () => {
  it("serves the deployed CLI over an independent request-response socket", async () => {
    const userDataPath = await makeTempRoot("review-control");
    const requests: ReviewControlRequest[] = [];
    const server = new ReviewControlServer(userDataPath, async (request) => {
      requests.push(request);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id: "review-test", status: "running" };
    });
    await server.start();

    try {
      const stat = await fs.stat(server.clientPath);
      expect(stat.mode & 0o111).not.toBe(0);
      const { stdout } = await execFileAsync(server.clientPath, [
        "start",
        "--repo", "/tmp/project",
        "--agent", "opencode",
        "--task-id", "TASK01-u1-m1",
      ], { env: { ...process.env, SHARKBAY_TERMINAL_SESSION_ID: "term-parent" } });

      expect(JSON.parse(stdout)).toEqual({ id: "review-test", status: "running" });
      expect(requests).toEqual([expect.objectContaining({
        method: "start",
        params: {
          repoPath: "/tmp/project",
          taskId: "TASK01-u1-m1",
          agentId: "opencode",
          parentTerminalSessionId: "term-parent",
        },
      })]);

      const runnerPath = `${userDataPath}/ancestor-runner.cjs`;
      await fs.writeFile(runnerPath, [
        'const { spawn } = require("node:child_process");',
        "const env = { ...process.env };",
        "delete env.SHARKBAY_TERMINAL_SESSION_ID;",
        "const child = spawn(process.argv[2], process.argv.slice(3), { env, stdio: \"inherit\" });",
        "child.on(\"exit\", (code) => process.exit(code ?? 1));",
        "",
      ].join("\n"), "utf8");
      await execFileAsync(process.execPath, [
        runnerPath,
        server.clientPath,
        "start",
        "--repo", "/tmp/project",
        "--task-id", "TASK01-u1-m1",
      ], { env: { ...process.env, SHARKBAY_TERMINAL_SESSION_ID: "term-ancestor-parent" } });
      expect(requests[1]).toEqual(expect.objectContaining({
        method: "start",
        params: {
          repoPath: "/tmp/project",
          taskId: "TASK01-u1-m1",
          parentTerminalSessionId: "term-ancestor-parent",
        },
      }));

      const status = await execFileAsync(server.clientPath, ["status", "review-test"], {
        env: { ...process.env, SHARKBAY_TERMINAL_SESSION_ID: "term-parent" },
      });
      expect(JSON.parse(status.stdout)).toEqual({ id: "review-test", status: "running" });
      expect(requests[2]).toEqual(expect.objectContaining({
        method: "status",
        params: { runId: "review-test", callerTerminalSessionId: "term-parent" },
      }));

      await execFileAsync(server.clientPath, [
        "complete",
        "--run", "review-test",
        "--report", ".sharkbay/reviews/TASK01-TEST01.md",
        "--completion-token", "reviewer-capability",
      ], { env: { ...process.env, SHARKBAY_TERMINAL_SESSION_ID: "" } });
      expect(requests[3]).toEqual(expect.objectContaining({
        method: "complete",
        params: expect.objectContaining({
          runId: "review-test",
          reportPath: ".sharkbay/reviews/TASK01-TEST01.md",
          completionToken: "reviewer-capability",
        }),
      }));

      await server.stop();
      await expect(execFileAsync(server.clientPath, ["status", "review-test"], {
        env: { ...process.env, SHARKBAY_TERMINAL_SESSION_ID: "term-parent" },
      })).rejects.toMatchObject({ stderr: expect.stringContaining("SharkBay is not running") });
    } finally {
      await server.stop();
    }
  });
});
