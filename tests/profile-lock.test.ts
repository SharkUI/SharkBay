import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireProfileLock } from "../src/runtime/profile-lock.js";

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "sharkbay-lock-recovery-"));
  directories.push(directory);
  const paths = { userDataPath: path.join(directory, "data"), configPath: path.join(directory, "config.json") };
  await mkdir(paths.userDataPath); await writeFile(paths.configPath, "{}");
  return { paths, files: [path.join(paths.userDataPath, "runtime.lock"), `${paths.configPath}.runtime.lock`] };
}
async function crashedPid() {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await once(child, "spawn");
  const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
  return child.pid!;
}
async function writeLockModule(directory: string) {
  const source = await readFile(new URL("../src/runtime/profile-lock.ts", import.meta.url), "utf8");
  await symlink(path.resolve("node_modules"), path.join(directory, "node_modules"), "dir");
  await writeFile(path.join(directory, "lock.mjs"), ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}

describe("runtime lock recovery without starting the application", () => {
  it("recovers both locks after their owner crashes", async () => {
    const { paths, files } = await fixture();
    const stale = JSON.stringify({ token: "crashed", pid: await crashedPid(), startedAt: new Date().toISOString() });
    await Promise.all(files.map((file) => writeFile(file, stale)));
    const release = await acquireProfileLock(paths);
    expect(JSON.parse(await readFile(files[0]!, "utf8")).pid).toBe(process.pid);
    await release();
    for (const file of files) await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("allows only one concurrent replacement owner", async () => {
    const { paths, files } = await fixture();
    await writeFile(files[0]!, JSON.stringify({ token: "crashed", pid: await crashedPid(), startedAt: new Date().toISOString() }));
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => acquireProfileLock(paths)));
    const winners = results.filter((result) => result.status === "fulfilled");
    expect(winners).toHaveLength(1);
    for (const result of winners) if (result.status === "fulfilled") await result.value();
  });

  it("keeps a single owner when independent processes recover the same crash", async () => {
    const { paths, files } = await fixture();
    const directory = path.dirname(paths.configPath);
    await writeFile(files[0]!, JSON.stringify({ token: "crashed", pid: await crashedPid() }));
    await writeLockModule(directory);
    const worker = path.join(directory, "worker.mjs");
    await writeFile(worker, `import { acquireProfileLock } from './lock.mjs';
      try {
        const release = await acquireProfileLock(${JSON.stringify(paths)});
        console.log('owned');
        await new Promise(resolve => { process.stdin.once('data', resolve); process.stdin.once('end', resolve); process.stdin.resume(); });
        await release();
      } catch { console.log('denied'); }
    `);
    const children = Array.from({ length: 6 }, () => spawn(process.execPath, [worker], { stdio: ["pipe", "pipe", "pipe"] }));
    try {
      const results = await Promise.all(children.map(async (child) => String((await once(child.stdout!, "data"))[0]).trim()));
      expect(results.filter((result) => result === "owned")).toHaveLength(1);
      const exits = children.map((child) => child.exitCode === null ? once(child, "close") : Promise.resolve());
      children[results.indexOf("owned")]!.stdin!.end("release\n");
      await Promise.all(exits);
      await expect(readFile(files[0]!)).rejects.toMatchObject({ code: "ENOENT" });
    } finally { for (const child of children) if (child.exitCode === null) child.kill("SIGKILL"); }
  });

  it.each(["creation", "recovery"])("recovers after SIGKILL during lock %s", async (phase) => {
    const { paths } = await fixture();
    const directory = path.dirname(paths.configPath);
    const file = path.join(await realpath(paths.userDataPath), "runtime.lock");
    if (phase === "recovery") await writeFile(file, JSON.stringify({ pid: await crashedPid(), token: "stale" }));
    await writeLockModule(directory);
    const worker = path.join(directory, "interrupt.mjs");
    const method = phase === "creation" ? "link" : "unlink";
    const argument = phase === "creation" ? 1 : 0;
    await writeFile(worker, `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fs.${method};
      fs.${method} = async (...args) => {
        if (args[${argument}] === ${JSON.stringify(file)}) {
          process.stdout.write('paused\\n');
          await new Promise(resolve => setTimeout(resolve, 60_000));
        }
        return original(...args);
      };
      syncBuiltinESMExports();
      const { acquireProfileLock } = await import('./lock.mjs');
      await acquireProfileLock(${JSON.stringify(paths)});
    `);
    const child = spawn(process.execPath, [worker], { stdio: ["ignore", "pipe", "inherit"] });
    try {
      const paused = await Promise.race([once(child.stdout!, "data"), once(child, "exit")]);
      expect(String(paused[0]).trim()).toBe("paused");
      if (phase === "creation") await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
      else await expect(acquireProfileLock(paths)).rejects.toThrow(/already held|unverified/i);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
    }
    const release = await acquireProfileLock(paths);
    try {
      expect(JSON.parse(await readFile(file, "utf8")).pid).toBe(process.pid);
      await expect(acquireProfileLock(paths)).rejects.toThrow(/already held|unverified/i);
    } finally { await release(); }
  });

  it("never removes an ownerless recovery directory left by a legacy Runtime", async () => {
    const { paths, files } = await fixture();
    await writeFile(files[0]!, JSON.stringify({ token: "stale", pid: await crashedPid() }));
    await mkdir(`${files[0]}.recovery`);
    await expect(acquireProfileLock(paths)).rejects.toThrow(/already held|unverified/i);
  });

  it("keeps live, malformed and permission-denied owners locked", async () => {
    const { paths, files } = await fixture();
    for (const record of [JSON.stringify({ token: "live", pid: process.pid }), "{", JSON.stringify({ token: "bad", pid: -1 })]) {
      await writeFile(files[0]!, record);
      await expect(acquireProfileLock(paths)).rejects.toThrow(/already held|unverified/i);
      expect(await readFile(files[0]!, "utf8")).toBe(record);
    }
    vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EPERM" }); });
    const record = JSON.stringify({ token: "unknown", pid: 12345 }); await writeFile(files[0]!, record);
    await expect(acquireProfileLock(paths)).rejects.toThrow(/already held|unverified/i);
    expect(await readFile(files[0]!, "utf8")).toBe(record);
  });

  it("rolls back its data lock if a shared config still has a live owner", async () => {
    const { paths, files } = await fixture();
    await writeFile(files[1]!, JSON.stringify({ token: "live", pid: process.pid }));
    await expect(acquireProfileLock(paths)).rejects.toThrow(/already held|unverified/i);
    await expect(readFile(files[0]!)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
