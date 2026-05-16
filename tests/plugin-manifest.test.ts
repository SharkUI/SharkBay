import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../src/plugins/plugin-manifest.js";

describe("plugin manifest", () => {
  it("parses marketplace-ready plugin metadata and permissions", () => {
    expect(parsePluginManifest({
      id: "com.sharkbay.language.node",
      name: "Node.js Support",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      main: "dist/index.js",
      capabilities: [
        { kind: "profile:machine" },
        { kind: "profile:project" },
        { kind: "file:read", patterns: ["package.json"] },
        { kind: "command:run", scope: "target" },
        { kind: "install:software" },
      ],
      contributes: {
        projectDetectors: [{ id: "node.project", label: "Node.js Project Detector" }],
      },
    })).toEqual({
      id: "com.sharkbay.language.node",
      name: "Node.js Support",
      version: "1.0.0",
      publisher: "SharkBay",
      engines: { sharkbay: "^0.2.0" },
      main: "dist/index.js",
      capabilities: [
        { kind: "profile:machine" },
        { kind: "profile:project" },
        { kind: "file:read", patterns: ["package.json"] },
        { kind: "command:run", scope: "target" },
        { kind: "install:software", requiresConfirmation: true },
      ],
      contributes: {
        projectDetectors: [{ id: "node.project", label: "Node.js Project Detector" }],
      },
    });
  });

  it("rejects invalid plugin manifests", () => {
    expect(() => parsePluginManifest({ id: "missing-fields" })).toThrow(/name/);
  });
});
