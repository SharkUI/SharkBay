import { describe, expect, it } from "vitest";
import { executionTargetKindForUri, parseProjectUri } from "../src/core/project-uri.js";
import { ExecutionProviderRegistry } from "../src/core/provider-registry.js";
import type { ExecutionProvider } from "../src/core/execution-provider.js";

function provider(kind: "local"): ExecutionProvider {
  return {
    id: kind,
    kind,
    label: kind,
  } as ExecutionProvider;
}

describe("core provider registry", () => {
  it("parses final project URI target identities", () => {
    expect(parseProjectUri("local:/Users/me/Code/App")).toEqual({
      kind: "local",
      path: "/Users/me/Code/App",
      targetId: "local",
    });
    expect(executionTargetKindForUri("wsl://Ubuntu/home/me/app")).toBe("wsl");
  });

  it("routes project URIs to registered providers", () => {
    const local = provider("local");
    const registry = new ExecutionProviderRegistry([local]);

    expect(registry.providerForUri("local:/Users/me/Code/App")).toBe(local);
  });
});
