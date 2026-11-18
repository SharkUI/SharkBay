import { afterEach, describe, expect, it } from "vitest";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanupTempRoots, makeTempRoot } from "./helpers.js";

describe("fixture ownership and lifecycle", { concurrent: false }, () => {
  let previous: string | undefined;
  let disposable: string | undefined;
  afterEach(async () => {
    // Stack hooks must dispose a file's resources before helpers remove their root.
    if (disposable) { await expect(access(disposable)).resolves.toBeUndefined(); disposable = undefined; }
  });
  it("removes only registered roots, preserving an unowned neighbouring fixture", async () => {
    const owned = await makeTempRoot("cleanup-owned");
    const neighbour = await mkdtemp(path.join(tmpdir(), "sharkbay-cleanup-unowned-"));
    try {
      await writeFile(path.join(owned, "file"), "fixture");
      await cleanupTempRoots(); await expect(access(owned)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(access(neighbour)).resolves.toBeUndefined();
    } finally { await rm(neighbour, { recursive: true, force: true }); }
  });
  it("registers a root that remains available until the local disposal hook", async () => {
    previous = disposable = await makeTempRoot("cleanup-after-each");
    await writeFile(path.join(previous, "fixture"), "data");
  });
  it("has removed the preceding test's root through the shared afterEach hook", async () => {
    expect(previous).toBeDefined(); await expect(access(previous!)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
