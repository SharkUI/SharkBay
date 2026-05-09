import { constants, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export type JsonReadResult =
  | {
      ok: true;
      data: unknown;
      revision: string;
    }
  | {
      ok: false;
      reason: "missing" | "invalid-json" | "io-error";
      message: string;
      revision: string | null;
    };

export async function readJsonFile(filePath: string): Promise<JsonReadResult> {
  let content: Buffer;
  try {
    content = await fs.readFile(filePath);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
    return {
      ok: false,
      reason: code === "ENOENT" ? "missing" : "io-error",
      message: error instanceof Error ? error.message : String(error),
      revision: null,
    };
  }

  const revision = createHash("sha256").update(content).digest("hex").slice(0, 12);
  try {
    return {
      ok: true,
      data: JSON.parse(content.toString("utf8")),
      revision,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "invalid-json",
      message: error instanceof Error ? error.message : String(error),
      revision,
    };
  }
}

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<string> {
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath);
  const tempPath = path.join(directory, `.${basename}.${process.pid}.${Date.now()}.tmp`);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  let handle: FileHandle | null = null;

  try {
    handle = await fs.open(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, filePath);
    await fsyncDirectory(directory);
    return createHash("sha256").update(serialized).digest("hex").slice(0, 12);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function fsyncDirectory(directory: string): Promise<void> {
  let handle: FileHandle | null = null;
  try {
    handle = await fs.open(directory, constants.O_RDONLY);
    await handle.sync();
  } catch {
    // Directory fsync is not available on every filesystem.
  } finally {
    if (handle) {
      await handle.close().catch(() => undefined);
    }
  }
}
