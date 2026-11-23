import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const manifest = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const dependencies = Object.fromEntries(
  ["@lydell/node-pty", "@xterm/addon-serialize", "@xterm/headless", "better-sqlite3", "telegramify-markdown", "ws"]
    .map((name) => [name, lock.packages[`node_modules/${name}`].version]),
);
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this command through npm run pack:runtime");
const directory = await mkdtemp(path.join(tmpdir(), "sharkbay-npm-"));
try {
  await cp("dist-runtime", path.join(directory, "dist-runtime"), { recursive: true });
  await cp("dist/renderer", path.join(directory, "dist/renderer"), { recursive: true });
  await cp("LICENSE", path.join(directory, "LICENSE"));
  await writeFile(path.join(directory, "package.json"), JSON.stringify({
    name: "@sharkbay/runtime",
    version: manifest.version,
    description: "SharkBay local runtime and WebUI",
    license: manifest.license,
    repository: "github:SharkUI/SharkBay",
    type: "module",
    bin: { sharkbay: "dist-runtime/src/server/cli.js" },
    engines: { node: "^22.12.0" },
    os: ["darwin", "linux"],
    cpu: ["arm64", "x64"],
    dependencies,
  }, null, 2) + "\n");
  const release = path.resolve("release");
  await mkdir(release, { recursive: true });
  execFileSync(process.execPath, [npm, "pack", "--pack-destination", release], { cwd: directory, stdio: "inherit" });
} finally {
  await rm(directory, { recursive: true, force: true });
}
