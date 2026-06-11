import { describe, expect, it } from "vitest";
import {
  parseGitHubIssues,
  parseGitHubPullRequests,
  parseLatestGitHubRelease,
} from "../src/main/github.js";

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
