import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectDevService } from "../shared/types.js";
import { toLocalProjectUri } from "../core/project-uri.js";

type PackageJson = {
  packageManager?: unknown;
  scripts?: unknown;
};

type PyProject = {
  scripts: Record<string, string>;
};

const ignoredServiceDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
]);

export async function discoverProjectDevServices(projectPath: string): Promise<ProjectDevService[]> {
  const services = await servicesFromPackage(projectPath, "root");
  services.push(...await servicesFromPythonCliWeb(projectPath));
  const children = await directChildDirectories(projectPath);

  for (const childPath of children) {
    services.push(...await servicesFromPackage(childPath, path.basename(childPath)));
  }

  return services;
}

export async function devCommandForProject(projectPath: string, packageJson: PackageJson): Promise<string> {
  return scriptCommandForProject(projectPath, packageJson, "dev");
}

export async function scriptCommandForProject(projectPath: string, packageJson: PackageJson, scriptName: string): Promise<string> {
  const packageManager = typeof packageJson.packageManager === "string" ? packageJson.packageManager : "";
  if (packageManager.startsWith("pnpm") || await fileExists(path.join(projectPath, "pnpm-lock.yaml"))) {
    return `pnpm ${scriptName}`;
  }
  if (packageManager.startsWith("yarn") || await fileExists(path.join(projectPath, "yarn.lock"))) {
    return `yarn ${scriptName}`;
  }
  if (packageManager.startsWith("bun") || await fileExists(path.join(projectPath, "bun.lockb"))) {
    return `bun run ${scriptName}`;
  }
  return `npm run ${scriptName}`;
}

async function servicesFromPackage(projectPath: string, idPrefix: string): Promise<ProjectDevService[]> {
  const packageJson = await readPackageJson(projectPath);
  const scripts = typeof packageJson?.scripts === "object" && packageJson.scripts !== null
    ? packageJson.scripts as Record<string, unknown>
    : {};
  const services: ProjectDevService[] = [];

  for (const [scriptName, script] of Object.entries(scripts)) {
    if (scriptName !== "dev" && !scriptName.startsWith("dev:")) {
      continue;
    }
    if (typeof script !== "string" || !script.trim()) {
      continue;
    }
    services.push({
      id: `${idPrefix}:${scriptName}`,
      label: scriptName === "dev" ? `dev: ${script.trim()}` : scriptName,
      command: await scriptCommandForProject(projectPath, packageJson ?? {}, scriptName),
      script,
      cwdUri: toLocalProjectUri(projectPath),
    });
  }

  return services;
}

async function servicesFromPythonCliWeb(projectPath: string): Promise<ProjectDevService[]> {
  const pyProject = await readPyProject(projectPath);
  if (!pyProject) return [];

  const services: ProjectDevService[] = [];
  for (const [scriptName, entrypoint] of Object.entries(pyProject.scripts)) {
    if (!await fileExists(path.join(projectPath, ".venv", "bin", scriptName))) {
      continue;
    }
    if (!await hasRegisteredPythonWebCommand(projectPath, entrypoint)) {
      continue;
    }

    const webModulePath = await webCommandModulePath(projectPath, entrypoint);
    const defaults = webModulePath ? await readPythonWebDefaults(webModulePath) : null;
    if (!defaults) {
      continue;
    }
    const host = defaults.host;
    const port = defaults.port;
    const noToken = defaults.supportsNoToken ? " --no-token" : "";
    const command = `source .venv/bin/activate && ${shellToken(scriptName)} web --host ${shellToken(host)} --port ${port}${noToken}`;

    services.push({
      id: `python:${scriptName}:web`,
      label: `web: ${scriptName}`,
      command,
      script: `${scriptName} web`,
      cwdUri: toLocalProjectUri(projectPath),
    });
  }

  return services;
}

async function readPackageJson(projectPath: string): Promise<PackageJson | null> {
  try {
    const raw = await fs.readFile(path.join(projectPath, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as PackageJson : null;
  } catch {
    return null;
  }
}

async function readPyProject(projectPath: string): Promise<PyProject | null> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(projectPath, "pyproject.toml"), "utf8");
  } catch {
    return null;
  }

  let section = "";
  const scripts: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = stripTomlComment(line).trim();
    if (!trimmed) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]?.trim() ?? "";
      continue;
    }

    const assignment = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"]+)"\s*$/);
    if (!assignment) continue;

    const [, key, value] = assignment;
    if (section === "project.scripts" && key && value) {
      scripts[key] = value;
    }
  }

  return Object.keys(scripts).length ? { scripts } : null;
}

async function hasRegisteredPythonWebCommand(projectPath: string, entrypoint: string): Promise<boolean> {
  const entrypointPath = moduleFilePath(projectPath, entrypoint.split(":")[0] ?? "");
  if (!entrypointPath) return false;

  let raw: string;
  try {
    raw = await fs.readFile(entrypointPath, "utf8");
  } catch {
    return false;
  }

  return /from\s+\.\s*web\s+import\s+web/.test(raw) && /\.add_command\(\s*web\s*\)/.test(raw);
}

async function webCommandModulePath(projectPath: string, entrypoint: string): Promise<string | null> {
  const entryModule = entrypoint.split(":")[0] ?? "";
  const packageModule = entryModule.split(".")[0] ?? "";
  if (!packageModule) return null;

  const candidate = path.join(projectPath, packageModule, "web.py");
  return await fileExists(candidate) ? candidate : null;
}

async function readPythonWebDefaults(filePath: string): Promise<{ host: string; port: number; supportsNoToken: boolean } | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }

  if (!/@click\.command\(\s*["']web["']\s*\)/.test(raw)) return null;

  const host = raw.match(/@click\.option\(\s*["']--host["'][\s\S]*?default\s*=\s*["']([^"']+)["']/)?.[1] ?? "127.0.0.1";
  const portRaw = raw.match(/@click\.option\(\s*["']--port["'][\s\S]*?default\s*=\s*(\d+)/)?.[1];
  const port = portRaw ? Number.parseInt(portRaw, 10) : 8765;
  const supportsNoToken = /@click\.option\(\s*["']--no-token["']/.test(raw);
  return { host, port: Number.isInteger(port) && port > 0 ? port : 8765, supportsNoToken };
}

function moduleFilePath(projectPath: string, moduleName: string): string | null {
  if (!moduleName || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(moduleName)) return null;
  return path.join(projectPath, ...moduleName.split(".")) + ".py";
}

function stripTomlComment(line: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\" && quoted) {
      escaped = !escaped;
      continue;
    }
    if (char === "\"" && !escaped) {
      quoted = !quoted;
    }
    if (char === "#" && !quoted) {
      return line.slice(0, index);
    }
    escaped = false;
  }
  return line;
}

function shellToken(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function directChildDirectories(projectPath: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(projectPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || shouldIgnoreServiceDirectory(entry.name)) {
      continue;
    }
    directories.push(path.join(projectPath, entry.name));
  }
  return directories.sort((a, b) => a.localeCompare(b));
}

function shouldIgnoreServiceDirectory(name: string): boolean {
  return ignoredServiceDirectories.has(name) || name.startsWith(".");
}
