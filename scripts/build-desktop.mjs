import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// TypeScript does not remove outputs belonging to deleted source files.
rmSync("dist-electron", { recursive: true, force: true });
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.node.json"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
