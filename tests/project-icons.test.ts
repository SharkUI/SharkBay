import { describe, expect, it } from "vitest";
import { resolveRemoteProjectIconSources } from "../src/main/project-icons.js";
import type { RemoteMachine } from "../src/shared/types.js";

describe("project icons", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

  it("resolves package-declared remote project icons over ssh", async () => {
    const machine: RemoteMachine = {
      id: "gpu-01",
      label: "GPU Worker",
      host: "gpu-01",
      port: 22,
      authMode: "system-ssh-config",
      sshConfigHost: "gpu-01",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z",
    };
    const calls: string[][] = [];
    const packageJson = Buffer.from(JSON.stringify({
      build: { mac: { icon: "resources/custom-icon.png" } },
    }), "utf8");

    const sources = await resolveRemoteProjectIconSources(machine, "/home/app/model-worker", {
      runner: async (args) => {
        calls.push(args);
        const command = args.at(-1) ?? "";
        const buffer = command.includes("package.json") ? packageJson : png;
        return { stdout: `SHARKBAY_FILE:${buffer.length}\n${buffer.toString("base64")}\n`, stderr: "" };
      },
    });

    expect(sources[0]).toEqual(expect.objectContaining({ kind: "local", label: "custom-icon.png" }));
    expect(sources[0]?.url).toMatch(/^data:image\/png;base64,/);
    expect(calls[0]).toEqual(expect.arrayContaining(["-o", "BatchMode=yes", "gpu-01", "--"]));
  });
});
