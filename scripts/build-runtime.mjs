import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import "./check-source-graph.mjs";

rmSync("dist-runtime", { recursive: true, force: true });
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.runtime.json"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
