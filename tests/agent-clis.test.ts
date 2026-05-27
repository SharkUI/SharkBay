import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prependPathDirectories, resolveCommandPath, resolveCommandSearchPaths } from "../src/main/agent-clis.js";

describe("agent cli discovery", () => {
  it("finds executables in fallback directories when they are absent from PATH", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-agent-clis-"));
    const home = path.join(root, "home");
    const bin = path.join(home, ".local", "bin");
    const command = `sharkbay-fallback-${process.pid}-${Date.now()}`;
    const executable = path.join(bin, command);
    await fs.mkdir(bin, { recursive: true });
    await fs.writeFile(executable, "#!/bin/sh\n");
    await fs.chmod(executable, 0o755);

    await expect(resolveCommandPath(command, [".local/bin"], home)).resolves.toBe(executable);
  });

  it("finds executables installed into nvm versioned node bins", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-agent-clis-"));
    const home = path.join(root, "home");
    const bin = path.join(home, ".nvm", "versions", "node", "v22.22.1", "bin");
    const command = `sharkbay-nvm-${process.pid}-${Date.now()}`;
    const executable = path.join(bin, command);
    await fs.mkdir(bin, { recursive: true });
    await fs.writeFile(executable, "#!/bin/sh\n");
    await fs.chmod(executable, 0o755);

    await expect(resolveCommandPath(command, [], home)).resolves.toBe(executable);
  });

  it("includes nvm versioned node bins in command search paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-agent-clis-"));
    const home = path.join(root, "home");
    const bin = path.join(home, ".nvm", "versions", "node", "v22.22.1", "bin");
    await fs.mkdir(bin, { recursive: true });

    await expect(resolveCommandSearchPaths(home, [])).resolves.toContain(bin);
  });

  it("prepends command search paths without duplicating existing PATH entries", () => {
    expect(prependPathDirectories(`/usr/bin${path.delimiter}/opt/bin`, ["/opt/bin", "/nvm/bin"])).toBe(
      `/opt/bin${path.delimiter}/nvm/bin${path.delimiter}/usr/bin`
    );
  });

  it("ignores invalid command names", async () => {
    await expect(resolveCommandPath("bad command", ["/usr/local/bin"])).resolves.toBeNull();
  });
});
