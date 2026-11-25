import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

const maxDownload = 180 * 1024 * 1024;
const maxArchive = 450 * 1024 * 1024;
const decompress = promisify(gunzip);

export type MigrationPackage = { version: string; url: string; sha256: string };

export function migrationPackagePaths(root: string, pkg: MigrationPackage) {
  if (pkg.version !== "1.0.0" || !/^[a-f0-9]{64}$/.test(pkg.sha256)) throw new Error("Invalid Runtime package identity");
  const directory = path.join(root, `runtime-${pkg.version}-${pkg.sha256}`);
  return {
    directory, node: path.join(directory, "bin", "node"),
    cli: path.join(directory, "dist-runtime", "src", "server", "cli.js"),
  };
}

export async function readInstalledMigrationPackage(root: string, pkg: MigrationPackage) {
  const paths = migrationPackagePaths(root, pkg);
  const receipt = await readFile(path.join(paths.directory, ".archive-sha256"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (receipt !== pkg.sha256) return undefined;
  await access(paths.node, 1);
  await access(paths.cli, 4);
  return paths;
}

async function extractRuntime(tar: Buffer, target: string) {
  const text = (buffer: Buffer) => buffer.subarray(0, Math.max(0, buffer.includes(0) ? buffer.indexOf(0) : buffer.length)).toString("utf8");
  const octal = (buffer: Buffer) => {
    const value = text(buffer).trim();
    if (!/^[0-7]+$/.test(value)) throw new Error("Invalid Runtime archive entry size or mode");
    return parseInt(value, 8);
  };
  const entries = new Set<string>();
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      if (tar.length - offset < 1024 || !tar.subarray(offset).every((byte) => byte === 0)) break;
      return;
    }
    if (text(header.subarray(257, 263)) !== "ustar") throw new Error("Unexpected Runtime archive format");
    const prefix = text(header.subarray(345, 500));
    const name = text(header.subarray(0, 100)).replace(/\/$/, "");
    const relative = prefix ? `${prefix}/${name}` : name;
    const segments = relative.split("/");
    const kind = header[156];
    const size = octal(header.subarray(124, 136));
    const mode = octal(header.subarray(100, 108));
    if (segments.some((part) => !part || part === "." || part === ".." || /[\\\x00-\x1f\x7f]/.test(part))
      || entries.has(relative) || relative === ".archive-sha256" || mode > 0o777 || (mode & 0o022) !== 0
      || (kind !== 48 && (kind !== 53 || size !== 0)) || offset + 512 + size > tar.length) {
      throw new Error("Unsafe Runtime archive entry");
    }
    entries.add(relative);
    const destination = path.join(target, relative);
    offset += 512;
    if (kind === 53) await mkdir(destination, { recursive: true, mode: 0o700 });
    else {
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, tar.subarray(offset, offset + size), { flag: "wx", mode: mode & 0o111 ? 0o700 : 0o600 });
    }
    offset += Math.ceil(size / 512) * 512;
  }
  throw new Error("Truncated Runtime archive");
}

export async function stageMigrationPackage(root: string, pkg: MigrationPackage, qaHost?: string) {
  const installed = await readInstalledMigrationPackage(root, pkg);
  if (installed) return installed;
  const url = new URL(pkg.url);
  const allowed = (url: URL) => !url.username && !url.password
    && (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.host === qaHost));
  if (!allowed(url)) throw new Error("Runtime package requires HTTPS");
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body || !allowed(new URL(response.url))) throw new Error("Unable to download SharkBay Runtime");
  const hash = createHash("sha256");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxDownload) throw new Error("Runtime download exceeds its size limit");
      hash.update(value);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  if (hash.digest("hex") !== pkg.sha256) throw new Error("Runtime download checksum does not match the signed bridge");
  const tar = await decompress(Buffer.concat(chunks), { maxOutputLength: maxArchive });
  await mkdir(root, { recursive: true, mode: 0o700 });
  const destination = migrationPackagePaths(root, pkg);
  const temporary = await mkdtemp(path.join(root, "runtime-"));
  try {
    await extractRuntime(tar, temporary);
    const node = path.join(temporary, "bin", "node");
    await access(node, 1);
    const file = await open(node, "r");
    try {
      const header = Buffer.alloc(8);
      await file.read(header);
      if (header.readUInt32LE(0) !== 0xfeedfacf || header.readUInt32LE(4) !== 0x0100000c) throw new Error("Runtime Node must be macOS arm64");
    } finally { await file.close(); }
    await access(path.join(temporary, "dist-runtime", "src", "server", "cli.js"), 4);
    const manifest = JSON.parse(await readFile(path.join(temporary, "package.json"), "utf8")) as { version?: string };
    if (manifest.version !== pkg.version) throw new Error("Runtime version does not match the signed bridge");
    await writeFile(path.join(temporary, ".archive-sha256"), pkg.sha256, { flag: "wx", mode: 0o600 });
    await rename(temporary, destination.directory);
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return destination;
}
