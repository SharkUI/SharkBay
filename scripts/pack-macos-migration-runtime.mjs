import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

if (process.platform !== "darwin" || process.arch !== "arm64" || !process.version.startsWith("v22.")) {
  throw new Error("Build the self-contained migration Runtime with macOS arm64 Node.js 22");
}
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run npm run pack:runtime:migration");
const workspace = await mkdtemp(path.join(tmpdir(), "sharkbay-runtime-package-"));
const root = path.join(workspace, "runtime");
const output = path.resolve("release", "sharkbay-runtime-1.0.0-macos-arm64.tar.gz");
try {
  execFileSync(process.execPath, [npm, "run", "prepare:runtime", "--", root], { stdio: "inherit" });
  const manifest = path.join(root, "package.json");
  const metadata = JSON.parse(await readFile(manifest, "utf8"));
  await writeFile(manifest, JSON.stringify({ ...metadata, version: "1.0.0" }, null, 2) + "\n");
  await mkdir(path.dirname(output), { recursive: true });
  const archive = path.join(workspace, "runtime.tar.gz");
  execFileSync("python3", ["-c", String.raw`
from pathlib import Path
import sys
import tarfile

root = Path(sys.argv[1])
with tarfile.open(sys.argv[2], "w:gz", format=tarfile.USTAR_FORMAT) as archive:
    for file in sorted(root.rglob("*")):
        relative = file.relative_to(root)
        if ".bin" in relative.parts:
            continue
        if file.is_symlink() or not (file.is_file() or file.is_dir()):
            raise ValueError(f"Unexpected runtime entry: {relative}")
        entry = archive.gettarinfo(str(file), relative.as_posix())
        entry.mode = 0o700 if file.is_dir() or entry.mode & 0o111 else 0o600
        if file.is_dir():
            archive.addfile(entry)
        else:
            with file.open("rb") as source:
                archive.addfile(entry, source)
`, root, archive], { stdio: "inherit" });
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  execFileSync("/bin/mv", [archive, output]);
  console.log(`${hash.digest("hex")}  ${output}`);
} finally { await rm(workspace, { recursive: true, force: true }); }
