import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import viteConfig from "../vite.config.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf-8")) as {
  build: {
    files: string[];
    extraResources: Array<{ from: string; to: string }>;
    asarUnpack: string[];
    mac: {
      entitlements: string;
      entitlementsInherit: string;
      extendInfo: Record<string, string>;
    };
  };
};

describe("build config", () => {
  it("uses relative renderer asset paths for packaged file URLs", () => {
    expect(viteConfig).toEqual(expect.objectContaining({ base: "./" }));
  });

  it("does not emit renderer source maps by default", () => {
    expect(viteConfig).toEqual(expect.objectContaining({
      build: expect.objectContaining({ sourcemap: false }),
    }));
  });

  it("excludes non-runtime files from packaged app contents", () => {
    expect(packageJson.build.files).toEqual(expect.arrayContaining([
      "!dist-electron/tests/**/*",
      "!dist-electron/**/*.map",
      "!dist-electron/**/*.d.ts",
      "!dist-electron/**/*.d.ts.map",
      "!dist-electron/**/*.tsbuildinfo",
      "!dist-electron/vite.config.*",
      "!dist-electron/vitest.config.*",
      "!node_modules/**/*.map",
      "!node_modules/**/*.d.ts",
      "!node_modules/**/*.d.ts.map",
      "!node_modules/**/*.md",
      "!node_modules/bun-pty/**/*",
      "!node_modules/better-sqlite3/deps/**/*",
      "!node_modules/better-sqlite3/src/**/*",
      "!node_modules/better-sqlite3/build/Release/sqlite3.a",
      "!node_modules/better-sqlite3/build/Release/test_extension.node",
      "!node_modules/better-sqlite3/build/Release/.deps/**/*",
    ]));
    expect(packageJson.build.asarUnpack).toEqual(expect.arrayContaining([
      "node_modules/@lydell/node-pty/**/*",
      "node_modules/@lydell/node-pty-*/**/*",
      "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    ]));
    expect(packageJson.build.asarUnpack).not.toContain("node_modules/better-sqlite3/**/*");
  });

  it("copies only runtime dock icon resources", () => {
    expect(packageJson.build.extraResources).toEqual([
      { from: "resources/shark-morning.png", to: "resources/shark-morning.png" },
      { from: "resources/shark-day.png", to: "resources/shark-day.png" },
      { from: "resources/shark-night.png", to: "resources/shark-night.png" },
    ]);
  });

  it("signs the macOS app with Apple Events automation support", () => {
    expect(packageJson.build.mac.entitlements).toBe("build/entitlements.mac.plist");
    expect(packageJson.build.mac.entitlementsInherit).toBe("build/entitlements.mac.inherit.plist");
    expect(packageJson.build.mac.extendInfo?.NSAppleEventsUsageDescription).toContain("Automation access");

    const entitlements = readFileSync(join(repoRoot, packageJson.build.mac.entitlements), "utf-8");

    expect(entitlements).toContain("<key>com.apple.security.automation.apple-events</key>");
    expect(entitlements).toContain("<key>com.apple.security.cs.allow-jit</key>");
    expect(entitlements).toContain("<key>com.apple.security.cs.allow-unsigned-executable-memory</key>");
    expect(entitlements).toContain("<key>com.apple.security.cs.disable-library-validation</key>");
  });
});
