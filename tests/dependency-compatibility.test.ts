import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { FileMatcher } from "app-builder-lib/out/fileMatcher.js";
import { parseUpdateInfo } from "electron-updater/out/providers/Provider.js";
import { makeTempRoot, writeText } from "./helpers.js";

it("keeps release include/exclude patterns working with the patched matcher", async () => {
  const root = await makeTempRoot("builder-patterns");
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const filter = new FileMatcher(root, path.join(root, "out"), value => value, pkg.build.files).createFilter();
  for (const [name, included] of [
    ["dist-electron/electron/main.js", true],
    ["dist-electron/src/core/core-service.js", true],
    ["dist/renderer/assets/main-12345678.js", true],
    ["dist-electron/tests/fixture.test.js", false],
    ["dist-electron/vitest.host.config.js", false],
    ["dist-electron/src/core/core-service.js.map", false],
    ["dist-electron/src/core/core-service.d.ts", false],
    ["src/main/source.ts", false],
  ] as const) {
    const file = path.join(root, name);
    await writeText(file, "fixture");
    expect(filter(file, await stat(file)), name).toBe(included);
  }
  // Universal's consumer uses the named minimatch function; old 3/5 consumers
  // retain their own versions and are deliberately outside the override.
  const require = createRequire(import.meta.url);
  const universalRequire = createRequire(require.resolve("@electron/universal"));
  const { minimatch } = universalRequire("minimatch");
  expect(minimatch("nested/binary.node", "*.node", { matchBase: true })).toBe(true);
  expect(minimatch("nested/binary.js", "*.node", { matchBase: true })).toBe(false);
});

it("parses valid and rejects malformed release metadata without fetching or installing", () => {
  const url = new URL("https://example.invalid/latest-mac.yml");
  expect(parseUpdateInfo("version: 0.3.11\nfiles:\n  - url: SharkBay.zip\n    sha512: fixture\n    size: 123\n", "latest-mac.yml", url)).toMatchObject({
    version: "0.3.11", files: [{ url: "SharkBay.zip", sha512: "fixture", size: 123 }],
  });
  expect(() => parseUpdateInfo("files: [unterminated", "latest-mac.yml", url)).toThrow(/parse/i);
});
