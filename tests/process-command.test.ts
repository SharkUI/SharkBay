import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runProcessCommand } from "../src/main/process-command.js";
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "sharkbay-command-group-")); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
it("waits for a TERM-resistant descendant before completing cancellation", async () => {
  const file = path.join(root, "pid");
  const script = `const {spawn}=require('node:child_process');const fs=require('node:fs'); const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});child.on('message',()=>fs.writeFileSync(process.argv[1],String(child.pid)));setInterval(()=>{},1000);`;
  const controller = new AbortController();
  const pending = runProcessCommand(process.execPath, ["-e", script, file], { cwd: root, signal: controller.signal, timeout: 4000 });
  const rejected = expect(pending).rejects.toThrow("cancelled");
  let pid: number | undefined;
  try {
    await vi.waitFor(async () => { pid = Number(await fs.readFile(file, "utf8")); expect(pid).toBeGreaterThan(0); });
    controller.abort(new Error("cancelled")); await rejected;
    await vi.waitFor(() => expect(() => process.kill(pid!, 0)).toThrow(), { timeout: 1500 });
  } finally { controller.abort(new Error("cancelled")); await pending.catch(() => {}); if (pid) { try { process.kill(pid, "SIGKILL"); } catch { /* exited */ } } }
}, 6000);
it("rejects and bounds oversized command output", async () => {
  await expect(runProcessCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(2*1024*1024))"], { cwd: root, timeout: 2000 })).rejects.toMatchObject({ message: expect.stringContaining("exceeded"), stdout: expect.any(String) });
});
