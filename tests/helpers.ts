import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcRuntimeLike } from "../src/shared/types.js";

export async function makeTempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `sharkbay-${prefix}-`));
}

export async function makeTestRuntime(prefix: string): Promise<IpcRuntimeLike> {
  const root = await makeTempRoot(prefix);
  return {
    userDataPath: path.join(root, "electron-user-data"),
    configPath: path.join(root, ".sharkbay", "config.json"),
  };
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

export async function createGitRepoFixture(root: string, name = "FixtureApp"): Promise<string> {
  const repo = path.join(root, name);
  await fs.mkdir(path.join(repo, ".git"), { recursive: true });
  await writeJson(path.join(repo, "package.json"), { name: name.toLowerCase(), version: "1.0.0" });
  return repo;
}
