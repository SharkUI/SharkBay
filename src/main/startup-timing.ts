/** Startup milestones contain timings only, never config, paths or credentials. */
export function createStartupTimer(scope: string, write: (line: string) => void = console.info) {
  const start = performance.now();
  return (stage: string) => write(`[startup] ${JSON.stringify({
    at: new Date().toISOString(), pid: process.pid, scope, stage,
    elapsedMs: Math.round(performance.now() - start),
    processUptimeMs: Math.round(process.uptime() * 1000),
  })}`);
}
