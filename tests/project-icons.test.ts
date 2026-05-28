import { describe, expect, it } from "vitest";
import { resolveProjectIconSources } from "../src/main/project-icons.js";

describe("project icons", () => {
  it("returns empty array for non-existent project", async () => {
    const sources = await resolveProjectIconSources("/tmp/non-existent-project-xyz", []);
    expect(sources).toEqual([]);
  });
});
