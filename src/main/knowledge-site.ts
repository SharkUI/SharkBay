import { readFile, readdir, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, relative, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { marked } from "marked";
import { scanTasks } from "./tasks.js";
import { extractArtifactPath, extractReviewPath, stripTaskBullet, taskDetailLines } from "../shared/task-detail-helpers.js";
import type { TaskViewModel } from "../shared/types.js";

const SITE_DIR = ".sharkbay/site";
const HASH_FILE = ".sharkbay/site/.content-hash";
const SITE_TEMPLATE_VERSION = "knowledge-site-ui-v5-task-artifacts-reviews";

export type KnowledgeSiteResult = {
  generated: boolean;
  sitePath: string;
  reason?: string;
};

/**
 * Generate the knowledge site if sources have changed.
 * Returns the site index path regardless of whether regeneration occurred.
 */
export async function generateKnowledgeSite(repoPath: string): Promise<KnowledgeSiteResult> {
  const sitePath = join(repoPath, SITE_DIR);
  const indexPath = join(sitePath, "index.html");

  const sources = await discoverSources(repoPath);
  const currentHash = computeSourcesHash(sources);
  const previousHash = await readPreviousHash(sitePath);

  if (currentHash === previousHash) {
    return { generated: false, sitePath: indexPath, reason: "no-changes" };
  }

  await mkdir(sitePath, { recursive: true });
  await mkdir(join(sitePath, "docs"), { recursive: true });
  await mkdir(join(sitePath, "tasks"), { recursive: true });
  await mkdir(join(sitePath, "tasks", "reviews"), { recursive: true });
  for (const sub of sources.docSubdirs) {
    await mkdir(join(sitePath, "docs", sub), { recursive: true });
  }

  const nav = buildNav(sources);
  const readmeHtml = sources.readme ? renderMarkdown(sources.readme.content) : "<p>No README.md found.</p>";
  await writeSiteFile(indexPath, wrapPage("Home", readmeHtml, nav, ""));

  for (const doc of sources.docs) {
    const relFromDocs = doc.relativePath.replace(/^docs\//, "");
    const parts = relFromDocs.split("/");
    const basePrefix = "../".repeat(parts.length);
    const outputPath = join(sitePath, "docs", outputRelativePathForDoc(doc));

    if (doc.kind === "html") {
      await writeSiteFile(outputPath, doc.content);
    } else {
      const html = renderMarkdown(doc.content);
      await writeSiteFile(outputPath, wrapPage(doc.title, html, nav, basePrefix));
    }
  }

  if (sources.docs.length > 0) {
    const topDocs = sources.docs.filter(d => !d.relativePath.replace(/^docs\//, "").includes("/"));
    let docsIndexHtml = `<h1>Docs</h1>`;
    if (sources.docSubdirs.length > 0) {
      docsIndexHtml += `<h2>Sections</h2><div class="docs-section-list">`;
      for (const sub of sources.docSubdirs) {
        docsIndexHtml += `<a class="docs-section-row" href="${sub}/index.html"><span>${esc(sub)}</span><small>Open section</small></a>`;
      }
      docsIndexHtml += `</div>`;
    }
    if (topDocs.length > 0) {
      docsIndexHtml += `<h2>Documents</h2><ul>`;
      for (const doc of topDocs) {
        const slug = doc.kind === "html" ? basename(doc.relativePath) : basename(doc.relativePath, extname(doc.relativePath)) + ".html";
        docsIndexHtml += `<li><a href="${slug}">${esc(doc.title)}</a></li>`;
      }
      docsIndexHtml += `</ul>`;
    }
    await writeSiteFile(join(sitePath, "docs", "index.html"), wrapPage("Docs", docsIndexHtml, nav, "../"));

    // Generate subdirectory index pages
    for (const sub of sources.docSubdirs) {
      const subDocs = sources.docs.filter(d => d.relativePath.replace(/^docs\//, "").startsWith(sub + "/"));
      let subHtml = `<h1>${esc(sub)}</h1><ul>`;
      for (const doc of subDocs) {
        const href = outputRelativePathForDoc(doc).slice(sub.length + 1);
        subHtml += `<li><a href="${esc(href)}">${esc(doc.title)}</a></li>`;
      }
      subHtml += `</ul>`;
      await writeSiteFile(join(sitePath, "docs", sub, "index.html"), wrapPage(sub, subHtml, nav, "../../"));
    }
  }

  const tasksHtml = renderTasksPage(sources.tasks);
  await writeSiteFile(join(sitePath, "tasks", "index.html"), wrapPage("Team Tasks", tasksHtml, nav, "../"));
  await writeSiteFile(join(sitePath, "tasks", "artifacts.html"), wrapPage("Task Artifacts", renderArtifactsPage(sources.artifacts), nav, "../"));
  await writeSiteFile(join(sitePath, "tasks", "reviews.html"), wrapPage("Task Reviews", renderReviewsPage(sources.reviews), nav, "../"));
  for (const review of sources.reviews) {
    const html = renderMarkdown(review.content);
    await writeSiteFile(join(sitePath, "tasks", "reviews", review.outputName), wrapPage(review.title, html, nav, "../../"));
  }

  await writeSiteFile(join(sitePath, HASH_FILE.split("/").pop()!), currentHash);

  return { generated: true, sitePath: indexPath };
}

/**
 * Get the site index.html path for a project (without generating).
 */
export function getKnowledgeSitePath(repoPath: string): string {
  return join(repoPath, SITE_DIR, "index.html");
}

// --- Source discovery ---

type SourceFile = { relativePath: string; title: string; content: string; kind: "md" | "txt" | "html" };
type TaskSource = {
  taskId: string;
  taskTag: string;
  title: string;
  status: string;
  owner: string;
  createdAt: string;
  summary: string;
  raw: string;
  artifacts?: string;
  reviews?: string;
};
type TaskArtifactSource = { task?: TaskSource; text: string; path: string; href: string };
type TaskReviewSource = { task?: TaskSource; text: string; path: string; outputName: string; title: string; content: string };
type Sources = {
  readme: SourceFile | null;
  docs: SourceFile[];
  docSubdirs: string[];
  tasks: TaskSource[];
  artifacts: TaskArtifactSource[];
  reviews: TaskReviewSource[];
};

function outputRelativePathForDoc(doc: SourceFile): string {
  const relFromDocs = doc.relativePath.replace(/^docs\//, "");
  if (doc.kind === "html") return relFromDocs;
  const ext = extname(relFromDocs);
  return `${relFromDocs.slice(0, -ext.length)}.html`;
}

async function discoverSources(repoPath: string): Promise<Sources> {
  const readme = await readSourceFile(repoPath, "README.md");
  const docs = await discoverDocs(repoPath);
  const tasks = await discoverTasks(repoPath);
  const artifacts = await discoverTaskArtifacts(repoPath, tasks);
  const reviews = await discoverTaskReviews(repoPath, tasks);
  const docSubdirs = [...new Set(docs.map(d => {
    const parts = d.relativePath.replace(/^docs\//, "").split("/");
    return parts.length > 1 ? parts[0]! : null;
  }).filter((s): s is string => s !== null))].sort();
  return { readme, docs, docSubdirs, tasks, artifacts, reviews };
}

async function readSourceFile(repoPath: string, relativePath: string): Promise<SourceFile | null> {
  try {
    const content = await readFile(join(repoPath, relativePath), "utf-8");
    const title = extractTitle(content) ?? basename(relativePath, extname(relativePath));
    return { relativePath, title, content, kind: "md" };
  } catch {
    return null;
  }
}

async function discoverDocs(repoPath: string): Promise<SourceFile[]> {
  const docsDir = join(repoPath, "docs");
  const results: SourceFile[] = [];
  await walkDocs(docsDir, repoPath, results);
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

const SUPPORTED_EXTS = new Set([".md", ".txt", ".htm", ".html"]);

async function walkDocs(dir: string, repoPath: string, results: SourceFile[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) {
      await walkDocs(full, repoPath, results);
    } else {
      const ext = extname(name).toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) continue;
      const content = await readFile(full, "utf-8");
      const rel = relative(repoPath, full);
      const kind: SourceFile["kind"] = ext === ".htm" || ext === ".html" ? "html" : ext === ".txt" ? "txt" : "md";
      const title = kind === "html" ? extractHtmlTitle(content) ?? basename(name, ext) : extractTitle(content) ?? basename(name, ext);
      results.push({ relativePath: rel, title, content, kind });
    }
  }
}

async function discoverTasks(repoPath: string): Promise<TaskSource[]> {
  const tasks = await scanTasks(repoPath);
  return tasks.map(taskSourceFromView).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function taskSourceFromView(task: TaskViewModel): TaskSource {
  return {
    taskId: task.taskId,
    taskTag: task.taskTag || task.taskId.split("-")[0] || task.taskId,
    title: task.title,
    status: task.status,
    owner: task.owner.githubLogin,
    createdAt: task.createdAt ?? "",
    summary: task.summary ?? "",
    raw: task.bodyMarkdown,
    artifacts: task.artifacts,
    reviews: task.reviews,
  };
}

async function discoverTaskArtifacts(repoPath: string, tasks: TaskSource[]): Promise<TaskArtifactSource[]> {
  const artifacts: TaskArtifactSource[] = [];
  const taskByTag = taskByTagMap(tasks);
  const recordsByPath = taskRecordPathMap(tasks, "artifacts");
  const dir = join(repoPath, ".sharkbay", "artifacts");
  const names = await readdir(dir).catch(() => []);
  for (const name of names.sort()) {
    const full = join(dir, name);
    const s = await stat(full).catch(() => null);
    if (!s?.isFile() || extname(name).toLowerCase() !== ".html") continue;
    const path = `.sharkbay/artifacts/${name}`;
    const record = recordsByPath.get(path);
    const task = record?.task ?? taskByTag.get(taskTagFromArtifactName(name));
    const content = await readFile(full, "utf-8").catch(() => "");
    const title = extractHtmlTitle(content) ?? task?.title ?? basename(name, extname(name));
    artifacts.push({
      task,
      text: record ? stripTaskBullet(record.line) : `\`${path}\` — ${title}`,
      path,
      href: hrefFromTasksPageToProjectPath(path),
    });
  }
  return artifacts.sort(compareTaskRecords);
}

async function discoverTaskReviews(repoPath: string, tasks: TaskSource[]): Promise<TaskReviewSource[]> {
  const reviews: TaskReviewSource[] = [];
  const taskByTag = taskByTagMap(tasks);
  const recordsByPath = taskRecordPathMap(tasks, "reviews");
  const dir = join(repoPath, ".sharkbay", "reviews");
  const names = await readdir(dir).catch(() => []);
  for (const name of names.sort()) {
    const full = join(dir, name);
    const s = await stat(full).catch(() => null);
    if (!s?.isFile() || extname(name).toLowerCase() !== ".md") continue;
    const path = `.sharkbay/reviews/${name}`;
    const record = recordsByPath.get(path);
    const task = record?.task ?? taskByTag.get(taskTagFromArtifactName(name));
    const content = await readFile(full, "utf-8").catch(() => "");
    const title = extractTitle(content) ?? `${task?.taskTag ?? taskTagFromArtifactName(name)} review`;
    const outputName = `${basename(path, extname(path))}.html`;
    reviews.push({
      task,
      text: record ? stripTaskBullet(record.line) : `${title} — \`${path}\``,
      path,
      outputName,
      title,
      content: content || `# ${task?.taskTag ?? taskTagFromArtifactName(name)} Review\n\nReview source not found: \`${path}\`\n`,
    });
  }
  return reviews.sort(compareTaskRecords);
}

function taskByTagMap(tasks: TaskSource[]): Map<string, TaskSource> {
  return new Map(tasks.map((task) => [task.taskTag, task]));
}

function taskRecordPathMap(tasks: TaskSource[], kind: "artifacts" | "reviews"): Map<string, { task: TaskSource; line: string }> {
  const records = new Map<string, { task: TaskSource; line: string }>();
  for (const task of tasks) {
    const value = kind === "artifacts" ? task.artifacts : task.reviews;
    for (const line of taskDetailLines(value)) {
      const path = kind === "artifacts" ? extractArtifactPath(line) : extractReviewPath(line);
      if (path) records.set(path, { task, line });
    }
  }
  return records;
}

function taskTagFromArtifactName(name: string): string {
  const base = basename(name, extname(name));
  return base.split("-")[0] || base;
}

function compareTaskRecords(a: { task?: TaskSource; path: string }, b: { task?: TaskSource; path: string }): number {
  const byDate = (b.task?.createdAt || "").localeCompare(a.task?.createdAt || "");
  return byDate || a.path.localeCompare(b.path);
}

function resolveProjectPath(repoPath: string, path: string): string {
  return path.startsWith("/") ? path : join(repoPath, path);
}

function hrefFromTasksPageToProjectPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith(".sharkbay/")) return `../../${normalized.slice(".sharkbay/".length)}`;
  if (normalized.startsWith("/")) return `file://${normalized}`;
  return `../../${normalized}`;
}

// --- Rendering ---

function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

function renderTasksPage(tasks: TaskSource[]): string {
  if (tasks.length === 0) return "<p>No tasks recorded yet.</p>";

  const groups: Record<string, TaskSource[]> = {};
  for (const t of tasks) {
    const key = t.status;
    (groups[key] ??= []).push(t);
  }

  const order = ["active", "paused", "blocked", "completed", "abandoned"];
  let html = "";
  for (const status of order) {
    const group = groups[status];
    if (!group?.length) continue;
    html += `<h2>${statusLabel(status)}</h2><div class="task-list">`;
    for (const t of group) {
      const detail = renderMarkdown(t.raw);
      html += `<details class="task-row task-${status}"><summary class="task-summary">`;
      html += `<span class="task-title">${esc(t.title)}</span>`;
      html += `<span class="task-meta">${esc(t.owner)} · ${esc(t.taskId.split("-")[0]!)}${t.createdAt ? " · " + esc(formatDate(t.createdAt)) : ""}</span>`;
      html += `</summary><div class="task-detail">${detail}</div></details>`;
    }
    html += `</div>`;
  }
  for (const [status, group] of Object.entries(groups)) {
    if (order.includes(status)) continue;
    html += `<h2>${esc(status)}</h2><div class="task-list">`;
    for (const t of group) {
      const detail = renderMarkdown(t.raw);
      html += `<details class="task-row"><summary class="task-summary">`;
      html += `<span class="task-title">${esc(t.title)}</span>`;
      html += `<span class="task-meta">${esc(t.owner)}${t.createdAt ? " · " + esc(formatDate(t.createdAt)) : ""}</span>`;
      html += `</summary><div class="task-detail">${detail}</div></details>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderArtifactsPage(artifacts: TaskArtifactSource[]): string {
  if (artifacts.length === 0) return "<h1>Artifacts</h1><p>No task artifacts recorded yet.</p>";
  let html = `<h1>Artifacts</h1><div class="record-list">`;
  for (const artifact of artifacts) {
    const meta = artifact.task
      ? `${artifact.task.title} · ${artifact.task.taskTag} · ${artifact.path}`
      : artifact.path;
    html += `<a class="record-row" href="${escAttr(artifact.href)}">`;
    html += `<span class="record-title">${esc(artifact.text)}</span>`;
    html += `<span class="record-meta">${esc(meta)}</span>`;
    html += `</a>`;
  }
  return `${html}</div>`;
}

function renderReviewsPage(reviews: TaskReviewSource[]): string {
  if (reviews.length === 0) return "<h1>Reviews</h1><p>No task reviews recorded yet.</p>";
  let html = `<h1>Reviews</h1><div class="record-list">`;
  for (const review of reviews) {
    const meta = review.task
      ? `${review.task.title} · ${review.task.taskTag} · ${review.path}`
      : review.path;
    html += `<a class="record-row" href="reviews/${escAttr(review.outputName)}">`;
    html += `<span class="record-title">${esc(review.text)}</span>`;
    html += `<span class="record-meta">${esc(meta)}</span>`;
    html += `</a>`;
  }
  return `${html}</div>`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { active: "Active", paused: "Paused", blocked: "Blocked", completed: "Completed", abandoned: "Abandoned" };
  return map[s] ?? s;
}

// --- HTML template ---

function buildNav(sources: Sources): string {
  let nav = `<a class="nav-link" href="{base}index.html">Home</a>`;
  if (sources.docs.length > 0) {
    nav += `<a class="nav-link" href="{base}docs/index.html">Docs</a>`;
  }
  nav += `<a class="nav-link" href="{base}tasks/index.html">Tasks</a>`;
  nav += `<a class="nav-link nav-sub-link" href="{base}tasks/artifacts.html">Artifacts</a>`;
  nav += `<a class="nav-link nav-sub-link" href="{base}tasks/reviews.html">Reviews</a>`;
  return nav;
}

function wrapPage(title: string, body: string, nav: string, base: string): string {
  const resolvedNav = nav.replace(/\{base\}/g, base);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="site-shell">
  <aside class="site-sidebar">
    <a class="brand" href="${base}index.html" aria-label="Knowledge Site home">
      <span class="brand-mark">KB</span>
      <span class="brand-copy">
        <span class="brand-title">Knowledge Site</span>
        <span class="brand-subtitle">SharkBay</span>
      </span>
    </a>
    <nav class="site-nav" aria-label="Knowledge Site navigation">${resolvedNav}</nav>
    <div class="sidebar-footer">
      <span>Local docs</span>
      <strong>Team context ready</strong>
    </div>
  </aside>
  <main class="content-shell">
    <article class="content">${body}</article>
  </main>
</div>
</body>
</html>`;
}

const CSS = `
:root {
  --canvas: #f7f7f4;
  --canvas-soft: #fafaf7;
  --surface: #ffffff;
  --surface-strong: #e6e5e0;
  --ink: #26251e;
  --body: #5a5852;
  --muted: #807d72;
  --muted-soft: #a09c92;
  --hairline: #e6e5e0;
  --hairline-strong: #cfcdc4;
  --primary: #f54e00;
  --primary-active: #d04200;
  --success: #1f8a65;
  --error: #cf2d56;
  --thinking: #dfa88f;
  --grep: #9fc9a2;
  --read: #9fbbe0;
  --edit: #c0a8dd;
  --done: #c08532;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { background: var(--canvas); }
body {
  min-width: 320px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
  color: var(--body);
  background:
    linear-gradient(90deg, rgba(230, 229, 224, 0.46) 1px, transparent 1px) 0 0 / 48px 48px,
    var(--canvas);
  padding: 0;
}

.site-shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 100vh;
}

.site-sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px 18px;
  border-right: 1px solid var(--hairline);
  background: rgba(247, 247, 244, 0.96);
}

.brand {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  border-bottom: 0;
  color: var(--ink);
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 8px;
  background: var(--ink);
  color: var(--canvas);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  font-weight: 600;
}

.brand-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.brand-title {
  color: var(--ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.25;
}

.brand-subtitle {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.site-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
  padding-right: 3px;
}

.nav-link {
  display: block;
  overflow: hidden;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-bottom: 1px solid transparent;
  border-radius: 8px;
  color: var(--body);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-link:hover {
  border-color: var(--hairline);
  background: var(--surface);
  color: var(--ink);
}

.nav-sub-link {
  margin-left: 12px;
  padding-left: 14px;
  color: var(--muted);
  font-size: 13px;
}

.nav-link:focus-visible,
a:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.sidebar-footer {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
}

.sidebar-footer strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
}

.content-shell {
  min-width: 0;
  padding: 48px clamp(24px, 5vw, 72px);
}

.content {
  width: min(100%, 920px);
  padding: clamp(30px, 5vw, 64px);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--surface);
}

.content > :first-child { margin-top: 0; }
.content > :last-child { margin-bottom: 0; }

h1, h2, h3, h4 {
  color: var(--ink);
  line-height: 1.18;
}

h1 {
  max-width: 12ch;
  margin: 0 0 28px;
  font-size: clamp(36px, 6vw, 64px);
  font-weight: 400;
}

h2 {
  margin: 56px 0 18px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--hairline);
  font-size: clamp(25px, 3vw, 34px);
  font-weight: 400;
}

h3 {
  margin: 34px 0 12px;
  font-size: 21px;
  font-weight: 600;
}

h4 {
  margin: 26px 0 10px;
  font-size: 16px;
  font-weight: 600;
}

p, ul, ol, pre, table, blockquote {
  margin-bottom: 18px;
}

p {
  max-width: 74ch;
  color: var(--body);
}

a {
  color: var(--primary-active);
  text-decoration: none;
  border-bottom: 1px solid rgba(245, 78, 0, 0.28);
}

a:hover {
  color: var(--primary);
  border-bottom-color: currentColor;
}

ul, ol {
  padding-left: 1.25rem;
}

li + li {
  margin-top: 6px;
}

.docs-section-list {
  display: grid;
  gap: 0;
  margin-bottom: 24px;
  border-top: 1px solid var(--hairline);
}

.docs-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 4px;
  border-bottom: 1px solid var(--hairline);
  color: var(--ink);
  text-decoration: none;
}

.docs-section-row:hover {
  color: var(--primary-active);
}

.docs-section-row span {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-section-row small {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 12px;
}

.record-list {
  display: grid;
  gap: 0;
  border-top: 1px solid var(--hairline);
}

.record-row {
  display: grid;
  gap: 4px;
  padding: 16px 0;
  border-bottom: 1px solid var(--hairline);
  text-decoration: none;
}

.record-row:hover {
  background: var(--canvas-soft);
  border-bottom-color: var(--hairline);
}

.record-title {
  color: var(--ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

.record-meta {
  color: var(--muted);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

blockquote {
  padding: 14px 16px;
  border-left: 3px solid var(--primary);
  border-radius: 0 8px 8px 0;
  background: var(--canvas-soft);
}

hr {
  height: 1px;
  margin: 36px 0;
  border: 0;
  background: var(--hairline);
}

pre {
  overflow-x: auto;
  padding: 16px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--canvas-soft);
  color: var(--ink);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  line-height: 1.55;
}

code {
  padding: 2px 5px;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  background: var(--canvas-soft);
  color: var(--ink);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.9em;
}

pre code {
  padding: 0;
  border: 0;
  background: transparent;
}

table {
  display: block;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  border-spacing: 0;
}

th, td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--hairline);
  text-align: left;
  vertical-align: top;
}

th {
  background: var(--canvas-soft);
  color: var(--ink);
  font-weight: 600;
}

tr:last-child td {
  border-bottom: 0;
}

img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.task-list {
  display: grid;
  gap: 0;
  padding: 0;
  list-style: none;
}

.task-row {
  border-bottom: 1px solid var(--hairline);
}

.task-row:first-child {
  border-top: 1px solid var(--hairline);
}

.task-summary {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 12px 4px;
  cursor: pointer;
  list-style: none;
}

.task-summary::-webkit-details-marker { display: none; }

.task-summary::before {
  content: "▸";
  flex: 0 0 auto;
  color: var(--muted-soft);
  font-size: 12px;
  transition: transform 0.15s;
}

details[open] > .task-summary::before {
  transform: rotate(90deg);
}

.task-title {
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.task-meta {
  margin-left: auto;
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.task-detail {
  padding: 16px 20px 24px;
  margin: 0 0 8px 16px;
  border-left: 2px solid var(--hairline-strong);
  font-size: 14px;
  line-height: 1.6;
}

.task-detail h1, .task-detail h2, .task-detail h3 {
  margin-top: 20px;
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 700;
  border: 0;
  padding: 0;
}

.task-detail h2 { font-size: 14px; }

.task-detail ul, .task-detail ol {
  margin-bottom: 12px;
}

.task-detail p {
  margin-bottom: 10px;
}

.task-detail pre {
  margin-bottom: 12px;
  font-size: 12px;
}

.task-active > .task-summary .task-title { color: var(--success); }
.task-blocked > .task-summary .task-title { color: var(--error); }
.task-paused > .task-summary .task-title { color: var(--done); }

@media (max-width: 900px) {
  .site-shell {
    display: block;
  }

  .site-sidebar {
    position: static;
    height: auto;
    gap: 16px;
    padding: 18px;
    border-right: 0;
    border-bottom: 1px solid var(--hairline);
  }

  .site-nav {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(160px, 1fr);
    gap: 14px;
    overflow-x: auto;
    padding: 0 0 2px;
  }

  .sidebar-footer {
    display: none;
  }

  .content-shell {
    padding: 24px 16px 40px;
  }

  .content {
    padding: 28px 20px;
  }

  h1 {
    max-width: none;
    font-size: 36px;
  }

  h2 {
    margin-top: 42px;
    font-size: 25px;
  }
}

@media (max-width: 520px) {
  .brand {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .brand-mark {
    width: 34px;
    height: 34px;
  }

  .content-shell {
    padding: 18px 10px 32px;
  }

  .content {
    padding: 24px 16px;
  }

  .task-card-header {
    display: grid;
  }
}
`;

// --- Utilities ---

function computeSourcesHash(sources: Sources): string {
  const h = createHash("sha256");
  h.update(SITE_TEMPLATE_VERSION);
  if (sources.readme) h.update(sources.readme.content);
  for (const doc of sources.docs) h.update(doc.content);
  for (const task of sources.tasks) {
    h.update(task.raw);
    h.update(task.artifacts ?? "");
    h.update(task.reviews ?? "");
  }
  for (const artifact of sources.artifacts) {
    h.update(artifact.path);
    h.update(artifact.text);
  }
  for (const review of sources.reviews) {
    h.update(review.path);
    h.update(review.text);
    h.update(review.content);
  }
  return h.digest("hex").slice(0, 16);
}

async function readPreviousHash(sitePath: string): Promise<string | null> {
  try {
    return (await readFile(join(sitePath, ".content-hash"), "utf-8")).trim();
  } catch {
    return null;
  }
}

async function writeSiteFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function extractTitle(md: string): string | null {
  const match = md.match(/^#\s+(.+)/m);
  return match?.[1]?.trim() ?? null;
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return esc(s);
}
