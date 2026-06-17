import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProjectIconSources } from "../src/main/project-icons.js";
import { makeTempRoot, writeText } from "./helpers.js";

describe("project icons", () => {
  it("returns empty array for non-existent project", async () => {
    const sources = await resolveProjectIconSources("/tmp/non-existent-project-xyz", []);
    expect(sources).toEqual([]);
  });

  it("discovers icons in a bare pnpm workspace package dir", async () => {
    const root = await makeTempRoot("icon-pnpm");
    const repo = path.join(root, "Zygnal");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    await writeText(path.join(repo, "pnpm-workspace.yaml"), "packages:\n  - web\n  - server\n");
    await writeText(path.join(repo, "web", "public", "icon.png"), "PNGDATA");

    const sources = await resolveProjectIconSources(repo, [repo]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: "local", label: "icon.png" });
    expect(sources[0]?.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("expands package.json workspace globs", async () => {
    const root = await makeTempRoot("icon-npm");
    const repo = path.join(root, "App");
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    await writeText(path.join(repo, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    await writeText(path.join(repo, "packages", "site", "public", "logo.png"), "PNGDATA");

    const sources = await resolveProjectIconSources(repo, [repo]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: "local", label: "logo.png" });
  });
});
