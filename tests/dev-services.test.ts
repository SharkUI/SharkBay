import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { devCommandForProject, discoverProjectDevServices } from "../src/main/dev-services.js";
import { toLocalProjectUri } from "../src/core/project-uri.js";
import { makeTempRoot, writeJson } from "./helpers.js";

describe("project dev service discovery", () => {
  it("discovers a root package.json dev script", async () => {
    const repo = await makeTempRoot("dev-service");
    await writeJson(path.join(repo, "package.json"), {
      scripts: {
        dev: "vite --host 127.0.0.1",
      },
    });

    await expect(discoverProjectDevServices(repo)).resolves.toEqual([
      {
        id: "root:dev",
        label: "dev: vite --host 127.0.0.1",
        command: "npm run dev",
        script: "vite --host 127.0.0.1",
        cwdUri: toLocalProjectUri(repo),
      },
    ]);
  });

  it("discovers root dev:* scripts with script-key labels", async () => {
    const repo = await makeTempRoot("dev-service-root-scripts");
    await writeJson(path.join(repo, "package.json"), {
      scripts: {
        "dev:server": "pnpm --filter @itsmy-life/server dev",
        "dev:web": "pnpm --filter @itsmy-life/web dev",
      },
    });
    await fs.writeFile(path.join(repo, "pnpm-lock.yaml"), "");

    await expect(discoverProjectDevServices(repo)).resolves.toEqual([
      {
        id: "root:dev:server",
        label: "dev:server",
        command: "pnpm dev:server",
        script: "pnpm --filter @itsmy-life/server dev",
        cwdUri: toLocalProjectUri(repo),
      },
      {
        id: "root:dev:web",
        label: "dev:web",
        command: "pnpm dev:web",
        script: "pnpm --filter @itsmy-life/web dev",
        cwdUri: toLocalProjectUri(repo),
      },
    ]);
  });

  it("discovers direct child dev scripts with command labels", async () => {
    const repo = await makeTempRoot("dev-service-children");
    const site = path.join(repo, "ai-girlfriend-site");
    const api = path.join(repo, "interaction-api");
    await fs.mkdir(site, { recursive: true });
    await fs.mkdir(api, { recursive: true });
    await writeJson(path.join(site, "package.json"), {
      scripts: { dev: "next dev" },
    });
    await writeJson(path.join(api, "package.json"), {
      scripts: { dev: "node src/server.js" },
    });

    await expect(discoverProjectDevServices(repo)).resolves.toEqual([
      {
        id: "ai-girlfriend-site:dev",
        label: "dev: next dev",
        command: "npm run dev",
        script: "next dev",
        cwdUri: toLocalProjectUri(site),
      },
      {
        id: "interaction-api:dev",
        label: "dev: node src/server.js",
        command: "npm run dev",
        script: "node src/server.js",
        cwdUri: toLocalProjectUri(api),
      },
    ]);
  });

  it("discovers Python virtualenv CLI web commands", async () => {
    const repo = await makeTempRoot("dev-service-python-cli-web");
    await fs.mkdir(path.join(repo, ".venv", "bin"), { recursive: true });
    await fs.mkdir(path.join(repo, "wechat_cli"), { recursive: true });
    await fs.writeFile(path.join(repo, ".venv", "bin", "wechat-cli"), "#!/usr/bin/env python\n");
    await fs.writeFile(path.join(repo, "pyproject.toml"), [
      "[project]",
      "name = \"wechat-cli\"",
      "",
      "[project.scripts]",
      "wechat-cli = \"wechat_cli.main:cli\"",
      "",
    ].join("\n"));
    await fs.writeFile(path.join(repo, "wechat_cli", "main.py"), [
      "from .web import web",
      "",
      "cli.add_command(web)",
      "",
    ].join("\n"));
    await fs.writeFile(path.join(repo, "wechat_cli", "web.py"), [
      "import click",
      "",
      "@click.command(\"web\")",
      "@click.option(\"--host\", default=\"127.0.0.1\", show_default=True)",
      "@click.option(\"--port\", default=8765, show_default=True)",
      "@click.option(\"--no-token\", is_flag=True)",
      "def web(host, port, no_token):",
      "    pass",
      "",
    ].join("\n"));

    await expect(discoverProjectDevServices(repo)).resolves.toEqual([
      {
        id: "python:wechat-cli:web",
        label: "web: wechat-cli",
        command: "source .venv/bin/activate && wechat-cli web --host 127.0.0.1 --port 8765 --no-token",
        script: "wechat-cli web",
        cwdUri: toLocalProjectUri(repo),
      },
    ]);
  });

  it("does not expose Python CLI web commands without an installed virtualenv script", async () => {
    const repo = await makeTempRoot("dev-service-python-cli-web-no-venv");
    await fs.mkdir(path.join(repo, "wechat_cli"), { recursive: true });
    await fs.writeFile(path.join(repo, "pyproject.toml"), [
      "[project.scripts]",
      "wechat-cli = \"wechat_cli.main:cli\"",
      "",
    ].join("\n"));
    await fs.writeFile(path.join(repo, "wechat_cli", "main.py"), "from .web import web\ncli.add_command(web)\n");
    await fs.writeFile(path.join(repo, "wechat_cli", "web.py"), "@click.command(\"web\")\ndef web():\n    pass\n");

    await expect(discoverProjectDevServices(repo)).resolves.toEqual([]);
  });

  it("uses package manager metadata and lockfiles for the dev command", async () => {
    const pnpmRepo = await makeTempRoot("dev-service-pnpm");
    await writeJson(path.join(pnpmRepo, "package.json"), { packageManager: "pnpm@9.0.0" });
    await expect(devCommandForProject(pnpmRepo, { packageManager: "pnpm@9.0.0" })).resolves.toBe("pnpm dev");

    const yarnRepo = await makeTempRoot("dev-service-yarn");
    await fs.writeFile(path.join(yarnRepo, "yarn.lock"), "");
    await expect(devCommandForProject(yarnRepo, {})).resolves.toBe("yarn dev");

    const bunRepo = await makeTempRoot("dev-service-bun");
    await fs.writeFile(path.join(bunRepo, "bun.lockb"), "");
    await expect(devCommandForProject(bunRepo, {})).resolves.toBe("bun run dev");
  });
});
