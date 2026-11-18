import { spawn } from "node:child_process";

/** Signal our detached group, allowing cooperative exit before escalation. */
export async function terminateProcessGroup(pid: number | undefined, graceMs = 2000): Promise<void> {
  if (!pid) return;
  try { process.kill(-pid, "SIGTERM"); }
  catch { try { process.kill(pid, "SIGTERM"); } catch { /* already exited */ } return; }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    try { process.kill(-pid, 0); } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  try { process.kill(-pid, "SIGKILL"); } catch { /* group already exited */ }
}

export function runProcessCommand(command: string, args: string[], options: {
  cwd: string; timeout: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv;
}): Promise<{ stdout: string; stderr: string }> {
  if (options.signal?.aborted) return Promise.reject(options.signal.reason);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    let outBytes = 0, errBytes = 0;
    const maxBytes = 1024 * 1024;
    let failure: unknown;
    let termination: Promise<void> | undefined;
    const cancel = (error: unknown) => {
      if (termination) return;
      failure = error;
      termination = terminateProcessGroup(child.pid);
    };
    const onAbort = () => cancel(options.signal?.reason ?? new Error("Command cancelled"));
    const timer = options.timeout > 0 ? setTimeout(() => cancel(new Error(`Command timed out after ${options.timeout}ms`)), options.timeout) : undefined;
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { const part = chunk.subarray(0, Math.max(0, maxBytes - outBytes)); if (part.length) stdout.push(part); outBytes += part.length; if (part.length < chunk.length) cancel(new Error("Command stdout exceeded 1 MiB")); });
    child.stderr.on("data", (chunk: Buffer) => { const part = chunk.subarray(0, Math.max(0, maxBytes - errBytes)); if (part.length) stderr.push(part); errBytes += part.length; if (part.length < chunk.length) cancel(new Error("Command stderr exceeded 1 MiB")); });
    child.on("error", (error) => { failure ??= error; });
    child.on("close", async (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      await termination;
      const streams = { stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (failure) reject(Object.assign(failure instanceof Error ? failure : new Error(String(failure)), streams));
      else if (code !== 0) reject(Object.assign(new Error(`Command exited with ${signal ? `signal ${signal}` : `code ${code}`}`), streams, { code, signal }));
      else resolve(streams);
    });
    // Cover aborts occurring while spawn and listeners were being established.
    if (options.signal?.aborted) onAbort();
  });
}
