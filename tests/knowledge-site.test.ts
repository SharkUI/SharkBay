import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateKnowledgeSite } from "../src/main/knowledge-site.js";
import { makeTempRoot, writeText } from "./helpers.js";

describe("knowledge site generation", () => {
  it("generates nested docs without losing relative navigation", async () => {
    const root = await makeTempRoot("knowledge-site");
    const repo = path.join(root, "repo");
    await writeText(path.join(repo, "README.md"), "# Fixture\n");
    await writeText(path.join(repo, "docs", "design", "overview.md"), "# Overview\n");
    await writeText(path.join(repo, "docs", "design", "narrative-engine", "engine.md"), "# Engine\n");
    await writeText(path.join(repo, "docs", "launch_reviews", "code_reviews", "001.md"), "# API Review\n");

    const result = await generateKnowledgeSite(repo);

    expect(result.generated).toBe(true);
    await expect(fs.stat(path.join(repo, ".sharkbay", "site", ".content-hash"))).resolves.toBeTruthy();
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "index.html"), "utf8"))
      .resolves.not.toContain('href="docs/design/index.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "docs", "index.html"), "utf8"))
      .resolves.toContain('class="docs-section-row" href="design/index.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "docs", "design", "narrative-engine", "engine.html"), "utf8"))
      .resolves.toContain('href="../../../index.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "docs", "design", "index.html"), "utf8"))
      .resolves.toContain('href="narrative-engine/engine.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "docs", "launch_reviews", "code_reviews", "001.html"), "utf8"))
      .resolves.toContain("API Review");
  });

  it("indexes task artifacts and reviews under tasks navigation", async () => {
    const root = await makeTempRoot("knowledge-site-task-records");
    const repo = path.join(root, "repo");
    await writeText(path.join(repo, "README.md"), "# Fixture\n");
    await writeText(path.join(repo, ".sharkbay", "artifacts", "TASK01-ABC123.html"), "<!doctype html><title>Artifact</title><h1>Artifact</h1>");
    await writeText(path.join(repo, ".sharkbay", "artifacts", "TASK02-NOSECT.html"), "<!doctype html><title>Artifact without section</title><h1>Artifact without section</h1>");
    await writeText(path.join(repo, ".sharkbay", "reviews", "TASK01-XYZ789.md"), "# Review Report\n\nLooks good.\n");
    await writeText(path.join(repo, ".sharkbay", "reviews", "TASK02-NOSECT.md"), "# Review Without Section\n\nLooks good too.\n");
    await writeText(path.join(repo, ".sharkbay", "tasks", "TASK01-u3960864-m81ae10-demo.md"), [
      "---",
      "kind: sharkbay_task",
      "taskId: TASK01-u3960864-m81ae10",
      "taskTag: TASK01",
      "mode: task",
      "title: Demo task",
      "status: completed",
      "actor: SharkUI",
      "githubUserId: 3960864",
      "machine: 81ae10",
      "agent: Codex GPT-5",
      "branch: main",
      "createdAt: 2026-06-19T00:00:00Z",
      "updatedAt: 2026-06-19T00:00:00Z",
      "---",
      "",
      "## Summary",
      "Demo summary.",
      "",
      "## Files",
      "- src/demo.ts",
      "",
      "## Work",
      "- Did the work.",
      "",
      "## Verification",
      "- Checked.",
      "",
      "## Artifacts",
      "- `.sharkbay/artifacts/TASK01-ABC123.html` — Demo artifact (2026-06-19T00:01:00Z)",
      "",
      "## Reviews",
      "- Approved — `.sharkbay/reviews/TASK01-XYZ789.md` (2026-06-19T00:02:00Z)",
      "",
    ].join("\n"));
    await writeText(path.join(repo, ".sharkbay", "tasks", "TASK02-u3960864-m81ae10-demo.md"), [
      "---",
      "kind: sharkbay_task",
      "taskId: TASK02-u3960864-m81ae10",
      "taskTag: TASK02",
      "mode: task",
      "title: Demo task without artifact section",
      "status: completed",
      "actor: SharkUI",
      "githubUserId: 3960864",
      "machine: 81ae10",
      "agent: Codex GPT-5",
      "branch: main",
      "createdAt: 2026-06-18T00:00:00Z",
      "updatedAt: 2026-06-18T00:00:00Z",
      "---",
      "",
      "## Summary",
      "Demo summary without records.",
      "",
      "## Files",
      "- src/demo2.ts",
      "",
      "## Work",
      "- Did other work.",
      "",
      "## Verification",
      "- Checked.",
      "",
    ].join("\n"));

    await generateKnowledgeSite(repo);

    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "tasks", "index.html"), "utf8"))
      .resolves.toContain('href="../tasks/artifacts.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "tasks", "artifacts.html"), "utf8"))
      .resolves.toContain('href="../../artifacts/TASK01-ABC123.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "tasks", "artifacts.html"), "utf8"))
      .resolves.toContain('href="../../artifacts/TASK02-NOSECT.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "tasks", "artifacts.html"), "utf8"))
      .resolves.toContain("Artifact without section");
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "tasks", "reviews.html"), "utf8"))
      .resolves.toContain('href="reviews/TASK01-XYZ789.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "tasks", "reviews.html"), "utf8"))
      .resolves.toContain('href="reviews/TASK02-NOSECT.html"');
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "tasks", "reviews", "TASK01-XYZ789.html"), "utf8"))
      .resolves.toContain("Review Report");
    await expect(fs.readFile(path.join(repo, ".sharkbay", "site", "tasks", "reviews", "TASK02-NOSECT.html"), "utf8"))
      .resolves.toContain("Review Without Section");
    await expect(fs.stat(path.join(repo, ".sharkbay", "site", "artifacts")).catch(() => null)).resolves.toBeNull();
  });
});
