import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);
const { getFileMatchers, copyFiles } = require("app-builder-lib/out/fileMatcher.js");

test("runtime resources include production dependencies through Electron Builder", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sharkbay-package-"));
  try {
    const modulePath = "runtime/node_modules/@xterm/headless/package.json";
    const source = path.join(directory, ".runtime-bundle/node_modules/@xterm/headless");
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, "package.json"), '{"name":"@xterm/headless"}');
    const config = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    const destination = path.join(directory, "resources");
    const matchers = getFileMatchers(config.build, "extraResources", destination, {
      defaultSrc: directory,
      globalOutDir: destination,
      macroExpander: (value: string) => value,
      customBuildOptions: {}
    }).filter((matcher: { from: string }) => matcher.from.startsWith(path.join(directory, ".runtime-bundle")));
    await copyFiles(matchers);
    expect(JSON.parse(await readFile(path.join(destination, modulePath), "utf8")).name).toBe("@xterm/headless");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
