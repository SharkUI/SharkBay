import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { makeTempRoot, writeJson, writeText } from "./helpers.js";

const exec = promisify(execFile);
const buildScript = fileURLToPath(new URL("../scripts/build-desktop.mjs", import.meta.url));

it("removes a deleted module's desktop outputs on the next build", async () => {
  const root = await makeTempRoot("desktop-build");
  await writeJson(path.join(root, "tsconfig.node.json"), {
    compilerOptions: { outDir: "dist-electron", rootDir: "src", types: [], target: "ES2022" },
    include: ["src/*.ts"],
  });
  await writeText(path.join(root, "src/keep.ts"), "export const keep = 1;");
  await writeText(path.join(root, "src/deleted.ts"), "export const deleted = 1;");
  await exec(process.execPath, [buildScript], { cwd: root });
  expect(await readFile(path.join(root, "dist-electron/deleted.js"), "utf8")).toContain("deleted");
  await rm(path.join(root, "src/deleted.ts"));
  await exec(process.execPath, [buildScript], { cwd: root });
  await expect(readFile(path.join(root, "dist-electron/deleted.js"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(path.join(root, "dist-electron/keep.js"), "utf8")).toContain("keep");
}, 15000);
