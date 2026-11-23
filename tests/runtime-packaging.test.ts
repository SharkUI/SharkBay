import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

test("runtime tarball contains the CLI and WebUI with Node runtime dependencies", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sharkbay-package-"));
  try {
    const packScript = fileURLToPath(new URL("../scripts/pack-runtime-npm.mjs", import.meta.url));
    const cli = "dist-runtime/src/server/cli.js";
    const web = "dist/renderer/index.html";
    for (const file of [cli, web, "dist-electron/electron/main.js"]) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await writeFile(path.join(directory, file), "fixture");
    }
    await copyFile(new URL("../package-lock.json", import.meta.url), path.join(directory, "package-lock.json"));
    await copyFile(new URL("../LICENSE", import.meta.url), path.join(directory, "LICENSE"));
    await writeFile(path.join(directory, "package.json"), JSON.stringify({
      version: "1.2.3",
      license: "GPL-3.0-only",
      scripts: { "pack:fixture": `node "${packScript}"` },
    }));
    execFileSync("npm", ["run", "pack:fixture"], { cwd: directory, stdio: "pipe" });
    const tarball = path.join(directory, "release/sharkbay-runtime-1.2.3.tgz");
    const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n");
    expect(files).toEqual(expect.arrayContaining([`package/${cli}`, `package/${web}`, "package/LICENSE"]));
    expect(files.some((file) => file.startsWith("package/dist-electron/"))).toBe(false);
    const manifest = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
    expect(manifest).toMatchObject({
      version: "1.2.3",
      bin: { sharkbay: cli },
      dependencies: { "@lydell/node-pty": expect.any(String), "better-sqlite3": expect.any(String) },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
