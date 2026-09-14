import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseGitHubIssues,
  parseGitHubPullRequests,
  parseLatestGitHubRelease,
  readGitHubInfo,
} from "../src/main/github.js";

const { execFileAsync, resolveCommandPath } = vi.hoisted(() => ({
  execFileAsync: vi.fn(),
  resolveCommandPath: vi.fn(),
}));

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: execFileAsync }) };
});

vi.mock("../src/main/command-path.js", () => ({
  resolveCommandPath,
  resolveCommandSearchPaths: async () => ["/opt/homebrew/bin"],
  prependPathDirectories: () => "/opt/homebrew/bin:/usr/bin",
}));

describe("GitHub sidebar data", () => {
  beforeEach(() => {
    execFileAsync.mockReset();
    resolveCommandPath.mockReset().mockResolvedValue("/opt/homebrew/bin/gh");
  });

  it("requests the latest three open items while retaining full repository totals", async () => {
    execFileAsync.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === "repo") {
        expect(args).toEqual(["repo", "view", "--json", "issues,pullRequests"]);
        return { stdout: JSON.stringify({ issues: { totalCount: 27 }, pullRequests: { totalCount: 14 } }) };
      }
      if (args[0] === "release") return { stdout: "[]" };
      expect(args.slice(1, 6)).toEqual(["list", "--state", "open", "--limit", "3"]);
      return { stdout: JSON.stringify([30, 29, 28].map((number) => ({
        number,
        title: `${args[0]} ${number}`,
        createdAt: `2026-06-${number}T00:00:00Z`,
        url: `https://github.com/owner/repo/${args[0] === "pr" ? "pull" : "issues"}/${number}`,
      }))) };
    });

    const info = await readGitHubInfo("/project");
    expect(info).toMatchObject({ available: true, issueCount: 27, pullRequestCount: 14 });
    expect(info.issues.map((issue) => issue.number)).toEqual([30, 29, 28]);
    expect(info.pullRequests.map((pr) => pr.number)).toEqual([30, 29, 28]);
    expect(execFileAsync).toHaveBeenCalledTimes(4);
  });

  it("keeps PRs available when issue listing fails", async () => {
    execFileAsync.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === "repo") return { stdout: '{"issues":{"totalCount":5},"pullRequests":{"totalCount":1}}' };
      if (args[0] === "issue") throw new Error("Issue query failed");
      if (args[0] === "pr") return { stdout: '[{"number":19,"url":"https://github.com/owner/repo/pull/19"}]' };
      return { stdout: "[]" };
    });

    const info = await readGitHubInfo("/project");
    expect(info).toMatchObject({ available: true, issues: [], issueCount: 5, pullRequestCount: 1 });
    expect(info.pullRequests.map((pr) => pr.number)).toEqual([19]);
  });

  it("returns zero totals when gh is unavailable", async () => {
    resolveCommandPath.mockResolvedValue(null);
    expect(await readGitHubInfo("/project")).toEqual({
      available: false, issues: [], issueCount: 0, pullRequests: [], pullRequestCount: 0, latestRelease: null,
    });
    expect(execFileAsync).not.toHaveBeenCalled();
  });
});

describe("github JSON parsing", () => {
  it("parses open issues with author login and label names", () => {
    const raw = JSON.stringify([
      {
        number: 17,
        title: "Status overwritten by stale session",
        author: { id: "x", login: "sparkleMing", name: "" },
        createdAt: "2026-06-11T07:25:54Z",
        url: "https://github.com/SharkUI/SharkBay/issues/17",
        labels: [{ name: "bug" }, { name: "ui" }],
      },
    ]);
    expect(parseGitHubIssues(raw)).toEqual([
      {
        number: 17,
        title: "Status overwritten by stale session",
        author: "sparkleMing",
        createdAt: "2026-06-11T07:25:54Z",
        url: "https://github.com/SharkUI/SharkBay/issues/17",
        labels: ["bug", "ui"],
      },
    ]);
  });

  it("drops issue rows missing a number or url", () => {
    const raw = JSON.stringify([
      { title: "no number", url: "https://example.com/1" },
      { number: 2, title: "no url" },
    ]);
    expect(parseGitHubIssues(raw)).toEqual([]);
  });

  it("parses pull requests with draft and review decision", () => {
    const raw = JSON.stringify([
      {
        number: 42,
        title: "Add GitHub panel",
        author: { login: "octocat" },
        createdAt: "2026-06-10T00:00:00Z",
        url: "https://github.com/SharkUI/SharkBay/pull/42",
        headRefName: "feature/github-panel",
        isDraft: true,
        reviewDecision: "CHANGES_REQUESTED",
        labels: [],
      },
      {
        number: 43,
        title: "Approved one",
        author: { login: "octocat" },
        createdAt: "2026-06-10T01:00:00Z",
        url: "https://github.com/SharkUI/SharkBay/pull/43",
        headRefName: "fix/typo",
        isDraft: false,
        reviewDecision: "",
        labels: [],
      },
    ]);
    expect(parseGitHubPullRequests(raw)).toEqual([
      {
        number: 42,
        title: "Add GitHub panel",
        author: "octocat",
        createdAt: "2026-06-10T00:00:00Z",
        url: "https://github.com/SharkUI/SharkBay/pull/42",
        headRefName: "feature/github-panel",
        isDraft: true,
        reviewDecision: "CHANGES_REQUESTED",
        labels: [],
      },
      {
        number: 43,
        title: "Approved one",
        author: "octocat",
        createdAt: "2026-06-10T01:00:00Z",
        url: "https://github.com/SharkUI/SharkBay/pull/43",
        headRefName: "fix/typo",
        isDraft: false,
        reviewDecision: null,
        labels: [],
      },
    ]);
  });

  it("returns the first release as the latest, falling back to tag for name", () => {
    const raw = JSON.stringify([
      { tagName: "v0.2.4", name: "", publishedAt: "2026-06-10T02:22:31Z", isLatest: true, isPrerelease: false },
      { tagName: "v0.2.3", name: "v0.2.3", publishedAt: "2026-06-08T16:07:15Z", isLatest: false, isPrerelease: false },
    ]);
    expect(parseLatestGitHubRelease(raw)).toEqual({
      tagName: "v0.2.4",
      name: "v0.2.4",
      publishedAt: "2026-06-10T02:22:31Z",
      isLatest: true,
      isPrerelease: false,
    });
  });

  it("returns null release for empty or malformed output", () => {
    expect(parseLatestGitHubRelease("[]")).toBeNull();
    expect(parseLatestGitHubRelease("not json")).toBeNull();
    expect(parseGitHubIssues("not json")).toEqual([]);
    expect(parseGitHubPullRequests("")).toEqual([]);
  });
});
