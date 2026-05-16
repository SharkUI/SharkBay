import { describe, expect, it } from "vitest";
import { ProfileCache, cacheFilePath } from "../src/storage/profile-cache.js";
import { makeTestRuntime } from "./helpers.js";
import type { MachineProfile } from "../src/shared/types.js";

describe("ProfileCache", () => {
  it("stores profile cache under runtime user data", async () => {
    const runtime = await makeTestRuntime("profile-cache");
    const cache = new ProfileCache();
    const profile: MachineProfile = {
      targetId: "local",
      targetKind: "local",
      detectedAt: "2026-05-16T00:00:00Z",
      hostname: "devbox",
      os: { platform: "darwin", name: "Darwin", version: "1", arch: "arm64", kernel: "1" },
      shell: { path: "/bin/zsh", name: "zsh" },
      tools: [],
      languages: [],
      packageManagers: [],
      agents: [],
      warnings: [],
    };

    await cache.writeMachineProfile(runtime, "local", profile);

    await expect(cache.readMachineProfile(runtime, "local")).resolves.toEqual(profile);
    expect(cacheFilePath(runtime, "machine-profiles", "local")).toContain(runtime.userDataPath);
  });
});
