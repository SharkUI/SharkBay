import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectIconSource } from "../shared/types.js";

type UrlFields = { localUrl: string | null; testUrl: string | null; deploymentUrl: string | null };
import { isRecord } from "../shared/schema.js";
import { readJsonFile } from "./json-file.js";
import { isPathInside, resolveReadableRepoFile, resolveRepoPath } from "./path-safety.js";

const maxIconBytes = 1024 * 1024;

const commonIconPaths = [
  "resources/project-icon.png",
  "resources/icon.png",
  "resources/app-icon.png",
  "app/icon.png",
  "src/app/icon.png",
  "public/favicon.ico",
  "public/favicon.png",
  "public/icon.png",
  "public/apple-touch-icon.png",
  "packages/web/public/project-icon.png",
  "packages/web/public/favicon.ico",
  "packages/web/public/favicon.png",
  "packages/web/public/apple-touch-icon.png",
  "packages/web/public/icon-512.png",
  "packages/web/public/logo.png",
  "apps/web/public/project-icon.png",
  "apps/web/public/favicon.ico",
  "apps/web/public/favicon.png",
  "apps/web/public/apple-touch-icon.png",
  "apps/web/public/icon-512.png",
  "apps/web/public/logo.png",
  "static/favicon.ico",
  "assets/icon.png",
  "src-tauri/icons/128x128.png",
];

const displayableExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"]);

export async function resolveProjectIconSources(repoPath: string, configuredProjects: string[], urls: UrlFields = { localUrl: null, testUrl: null, deploymentUrl: null }): Promise<ProjectIconSource[]> {
  const localSources = await resolveLocalIconSources(repoPath, configuredProjects);
  const faviconSources = faviconSourcesFromUrls(urls);
  return dedupeSources([...localSources, ...faviconSources]);
}

async function resolveLocalIconSources(repoPath: string, configuredProjects: string[]): Promise<ProjectIconSource[]> {
  const paths = [
    ...await packageIconPaths(repoPath, configuredProjects),
    ...commonIconPaths,
    ...await workspaceIconPaths(repoPath, configuredProjects),
  ];
  const sources: ProjectIconSource[] = [];

  for (const relativePath of dedupeStrings(paths)) {
    const source = await localIconSource(repoPath, configuredProjects, relativePath);
    if (source) {
      sources.push(source);
      break;
    }
  }

  return sources;
}

async function packageIconPaths(repoPath: string, configuredProjects: string[]): Promise<string[]> {
  let packageJsonPath: string;
  try {
    packageJsonPath = await resolveReadableRepoFile(repoPath, [], "package.json", configuredProjects);
  } catch {
    return [];
  }

  const result = await readJsonFile(packageJsonPath);
  if (!result.ok || !isRecord(result.data)) return [];

  const candidates = [
    nestedString(result.data, ["build", "mac", "icon"]),
    nestedString(result.data, ["build", "icon"]),
  ];

  return candidates.flatMap((candidate) => normalizeIconRelativePath(candidate));
}

// Icon candidates probed inside each discovered workspace package directory.
// Ordered to prefer dedicated logo/app icons over favicons for a cleaner logo.
const workspacePublicIconSuffixes = [
  "public/project-icon.png",
  "public/logo.png",
  "public/icon.png",
  "public/icon-512.png",
  "public/apple-touch-icon.png",
  "public/favicon.png",
  "public/favicon.ico",
];

async function workspaceIconPaths(repoPath: string, configuredProjects: string[]): Promise<string[]> {
  const packageDirs = await workspacePackageDirs(repoPath, configuredProjects);
  return packageDirs.flatMap((dir) => workspacePublicIconSuffixes.map((suffix) => path.posix.join(dir, suffix)));
}

async function workspacePackageDirs(repoPath: string, configuredProjects: string[]): Promise<string[]> {
  const patterns = [
    ...await pnpmWorkspacePatterns(repoPath, configuredProjects),
    ...await packageJsonWorkspacePatterns(repoPath, configuredProjects),
  ];

  const dirs = new Set<string>();
  for (const pattern of dedupeStrings(patterns)) {
    for (const dir of await expandWorkspacePattern(repoPath, configuredProjects, pattern)) {
      dirs.add(dir);
    }
  }
  return [...dirs];
}

async function pnpmWorkspacePatterns(repoPath: string, configuredProjects: string[]): Promise<string[]> {
  let filePath: string;
  try {
    filePath = await resolveReadableRepoFile(repoPath, [], "pnpm-workspace.yaml", configuredProjects);
  } catch {
    return [];
  }

  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch {
    return [];
  }

  return parsePnpmPackages(text);
}

// Minimal parser for the `packages:` list block of pnpm-workspace.yaml.
// Avoids adding a YAML dependency for this single, well-defined need.
function parsePnpmPackages(text: string): string[] {
  const patterns: string[] = [];
  let inPackages = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "  ");
    if (/^packages:\s*(#.*)?$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;

    const item = /^\s+-\s*(.+?)\s*$/.exec(line);
    if (item) {
      const value = stripInlineYaml(item[1] ?? "");
      if (value) patterns.push(value);
      continue;
    }
    // A non-indented, non-comment line ends the packages block.
    if (/^\S/.test(line)) inPackages = false;
  }

  return patterns;
}

function stripInlineYaml(value: string): string {
  let result = value.trim();
  const quote = result[0];
  if ((quote === "\"" || quote === "'") && result.endsWith(quote) && result.length >= 2) {
    return result.slice(1, -1);
  }
  const commentIndex = result.indexOf(" #");
  if (commentIndex >= 0) result = result.slice(0, commentIndex).trim();
  return result;
}

async function packageJsonWorkspacePatterns(repoPath: string, configuredProjects: string[]): Promise<string[]> {
  let packageJsonPath: string;
  try {
    packageJsonPath = await resolveReadableRepoFile(repoPath, [], "package.json", configuredProjects);
  } catch {
    return [];
  }

  const result = await readJsonFile(packageJsonPath);
  if (!result.ok || !isRecord(result.data)) return [];

  const workspaces = result.data.workspaces;
  const list = Array.isArray(workspaces)
    ? workspaces
    : isRecord(workspaces) && Array.isArray(workspaces.packages)
      ? workspaces.packages
      : [];

  return list.filter((value): value is string => typeof value === "string");
}

async function expandWorkspacePattern(repoPath: string, configuredProjects: string[], pattern: string): Promise<string[]> {
  if (!pattern || pattern.startsWith("!")) return [];

  const normalized = path.posix.normalize(pattern.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, ""));
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return [];

  if (!normalized.includes("*")) return [normalized];

  // Only expand a single trailing wildcard segment (e.g. `packages/*`, `apps/**`),
  // which covers the common workspace layouts without a full glob engine.
  const segments = normalized.split("/");
  const wildcardIndex = segments.findIndex((segment) => segment.includes("*"));
  if (wildcardIndex !== segments.length - 1) return [];
  const last = segments[wildcardIndex];
  if (last !== "*" && last !== "**") return [];

  const parentRel = segments.slice(0, wildcardIndex).join("/");
  return listSubdirectories(repoPath, configuredProjects, parentRel);
}

async function listSubdirectories(repoPath: string, configuredProjects: string[], relativeDir: string): Promise<string[]> {
  let repoRoot: string;
  try {
    repoRoot = (await resolveRepoPath(repoPath, [], configuredProjects)).repoPath;
  } catch {
    return [];
  }

  const dirPath = relativeDir ? path.join(repoRoot, relativeDir) : repoRoot;
  if (!isPathInside(repoRoot, dirPath)) return [];

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => (relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name));
}

async function localIconSource(repoPath: string, configuredProjects: string[], relativePath: string): Promise<ProjectIconSource | null> {
  const safePath = normalizeIconRelativePath(relativePath)[0];
  if (!safePath) return null;

  let filePath: string;
  try {
    filePath = await resolveReadableRepoFile(repoPath, [], safePath, configuredProjects);
  } catch {
    return null;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxIconBytes) return null;
    const buffer = await fs.readFile(filePath);
    return {
      kind: "local",
      url: `data:${mimeTypeForPath(filePath)};base64,${buffer.toString("base64")}`,
      label: path.basename(filePath),
    };
  } catch {
    return null;
  }
}

function faviconSourcesFromUrls(urls: UrlFields): ProjectIconSource[] {
  const candidates = [urls.localUrl, urls.testUrl, urls.deploymentUrl];
  const sources: ProjectIconSource[] = [];

  for (const rawUrl of candidates) {
    const url = parsedHttpUrl(rawUrl);
    if (!url) continue;
    const origin = url.origin;
    sources.push({ kind: "favicon", url: `${origin}/favicon.ico`, label: `${url.hostname} favicon` });
    sources.push({ kind: "favicon", url: `${origin}/apple-touch-icon.png`, label: `${url.hostname} touch icon` });
    if (!isLocalHost(url.hostname)) {
      sources.push({
        kind: "favicon",
        url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`,
        label: `${url.hostname} favicon service`,
      });
    }
  }

  return sources;
}

function normalizeIconRelativePath(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const withoutFragment = value.split(/[?#]/, 1)[0]?.trim();
  if (!withoutFragment) return [];
  const normalized = path.posix.normalize(withoutFragment.replace(/\\/g, "/").replace(/^\.\//, ""));
  if (normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) return [];
  return displayableExtensions.has(path.posix.extname(normalized).toLowerCase()) ? [normalized] : [];
}

function nestedString(record: Record<string, unknown>, keys: string[]): string | null {
  let cursor: unknown = record;
  for (const key of keys) {
    if (!isRecord(cursor)) return null;
    cursor = cursor[key];
  }
  return typeof cursor === "string" ? cursor : null;
}

function parsedHttpUrl(value: string | null): URL | null {
  if (!value || value === "unknown") return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function mimeTypeForPath(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".svg":
      return "image/svg+xml";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".ico":
      return "image/x-icon";
    default:
      return "image/png";
  }
}

function dedupeSources(sources: ProjectIconSource[]): ProjectIconSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}
