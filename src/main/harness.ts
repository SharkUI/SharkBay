import { access, chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import { resolveCommandPath } from "./command-path.js";

const execFileAsync = promisify(execFile);

const EXCLUDE_ENTRIES = ["/.sharkbay/"];
const LEGACY_EXCLUDE_ENTRIES = [] as string[];
const EXCLUDE_REMOVAL_ENTRIES = new Set([...EXCLUDE_ENTRIES, ...LEGACY_EXCLUDE_ENTRIES]);
const EXCLUDE_BACKUP_FILE = "git-info-exclude.backup";
const EXCLUDE_MISSING_MARKER = "git-info-exclude.missing";
const AGENT_SESSION_ID_SCRIPT = [
  "#!/bin/sh",
  "set -eu",
  "",
  "agent=\"$(printf '%s' \"${1:-}\" | tr '[:upper:]' '[:lower:]')\"",
  "",
  "if [ -n \"${SHARKBAY_RESTORED_SESSION_ID:-}\" ]; then",
  "  printf '%s\\n' \"$SHARKBAY_RESTORED_SESSION_ID\"",
  "  exit 0",
  "fi",
  "",
  "case \"$agent\" in",
  "  *kiro*)",
  "    pid=\"$PPID\"",
  "    kiro_pid=\"\"",
  "    while [ -n \"$pid\" ] && [ \"$pid\" != \"1\" ]; do",
  "      cmd=\"$(ps -o command= -p \"$pid\" 2>/dev/null || true)\"",
  "      case \"$cmd\" in",
  "        *kiro-cli*|*kiro_cli*|*Kiro\\ CLI*) kiro_pid=\"$pid\"; break ;;",
  "      esac",
  "      pid=\"$(ps -o ppid= -p \"$pid\" 2>/dev/null | tr -d ' ' || true)\"",
  "    done",
  "    if [ -z \"$kiro_pid\" ]; then",
  "      echo \"kiro process not found\" >&2",
  "      exit 1",
  "    fi",
  "    for lock in \"$HOME\"/.kiro/sessions/cli/*.lock; do",
  "      [ -f \"$lock\" ] || continue",
  "      lock_pid=\"$(sed -n 's/.*\"pid\":\\([0-9][0-9]*\\).*/\\1/p' \"$lock\")\"",
  "      [ \"$lock_pid\" = \"$kiro_pid\" ] || continue",
  "      session_id=\"$(basename \"$lock\" .lock)\"",
  "      meta=\"$HOME/.kiro/sessions/cli/$session_id.json\"",
  "      cwd=\"$(sed -n 's/.*\"cwd\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' \"$meta\" 2>/dev/null)\"",
  "      if [ \"$cwd\" = \"$PWD\" ]; then",
  "        printf '%s\\n' \"$session_id\"",
  "        exit 0",
  "      fi",
  "    done",
  "    echo \"kiro session id not found\" >&2",
  "    exit 1",
  "    ;;",
  "  *codewhale*|*deepseek*)",
  "    audit=\"$HOME/.codewhale/audit.log\"",
  "    if [ ! -f \"$audit\" ]; then",
  "      echo \"codewhale audit log not found\" >&2",
  "      exit 1",
  "    fi",
  "    latest_event=\"$(",
  "      tail -n 100 \"$audit\" |",
  "        awk '/\"session_id\"[[:space:]]*:/ { line=$0 } END { if (line) print line }'",
  "    )\"",
  "    session_id=\"$(printf '%s\\n' \"$latest_event\" | sed -n 's/.*\"session_id\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p')\"",
  "    if [ -z \"$session_id\" ]; then",
  "      echo \"codewhale session id not found\" >&2",
  "      exit 1",
  "    fi",
  "    meta=\"$HOME/.codewhale/sessions/$session_id.json\"",
  "    if [ ! -f \"$meta\" ]; then",
  "      echo \"codewhale session metadata not found\" >&2",
  "      exit 1",
  "    fi",
  "    workspace=\"$(sed -n 's/.*\"workspace\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' \"$meta\" 2>/dev/null | head -n 1)\"",
  "    if [ \"$workspace\" != \"$PWD\" ]; then",
  "      echo \"codewhale session workspace mismatch\" >&2",
  "      exit 1",
  "    fi",
  "    printf '%s\\n' \"$session_id\"",
  "    exit 0",
  "    ;;",
  "  *opencode*)",
  "    pid=\"$PPID\"",
  "    opencode_pid=\"\"",
  "    while [ -n \"$pid\" ] && [ \"$pid\" != \"1\" ]; do",
  "      cmd=\"$(ps -o command= -p \"$pid\" 2>/dev/null || true)\"",
  "      case \"$cmd\" in",
  "        *opencode*) opencode_pid=\"$pid\"; break ;;",
  "      esac",
  "      pid=\"$(ps -o ppid= -p \"$pid\" 2>/dev/null | tr -d ' ' || true)\"",
  "    done",
  "    if [ -z \"$opencode_pid\" ]; then",
  "      echo \"opencode process not found\" >&2",
  "      exit 1",
  "    fi",
  "    log_files=\"$(",
  "      lsof -p \"$opencode_pid\" 2>/dev/null |",
  "        awk '/\\/\\.local\\/share\\/opencode\\/log\\/.*\\.log$/ {print $NF}' |",
  "        sort -u",
  "    )\"",
  "    if [ -z \"$log_files\" ]; then",
  "      echo \"opencode log not found\" >&2",
  "      exit 1",
  "    fi",
  "    for log in $log_files; do",
  "      [ -f \"$log\" ] || continue",
  "      session_id=\"$(",
  "        tail -n 1000 \"$log\" |",
  "          sed -n -e 's/.*session\\.id=\\(ses_[^[:space:]]*\\).*/\\1/p' -e 's/.*service=session id=\\(ses_[^[:space:]]*\\).*/\\1/p' |",
  "          tail -n 1",
  "      )\"",
  "      [ -n \"$session_id\" ] || continue",
  "      db_row=\"$(opencode db \"select id, directory, path from session where id = '$session_id' limit 1\" --format json 2>/dev/null || true)\"",
  "      directory=\"$(printf '%s\\n' \"$db_row\" | sed -n 's/.*\"directory\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' | head -n 1)\"",
  "      path_value=\"$(printf '%s\\n' \"$db_row\" | sed -n 's/.*\"path\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' | head -n 1)\"",
  "      if [ \"$directory\" = \"$PWD\" ] || [ \"$path_value\" = \"$PWD\" ]; then",
  "        printf '%s\\n' \"$session_id\"",
  "        exit 0",
  "      fi",
  "    done",
  "    echo \"opencode session id not found\" >&2",
  "    exit 1",
  "    ;;",
  "  *claude*|*gemini*|*qwen*)",
  "    if [ -z \"${SHARKBAY_SESSION_ID:-}\" ]; then",
  "      echo \"SHARKBAY_SESSION_ID not set\" >&2",
  "      exit 1",
  "    fi",
  "    printf '%s\\n' \"$SHARKBAY_SESSION_ID\"",
  "    exit 0",
  "    ;;",
  "  *codex*) ;;",
  "  *)",
  "    echo \"usage: $0 codex|claude|codewhale|gemini|kiro|opencode|qwen\" >&2",
  "    exit 64",
  "    ;;",
  "esac",
  "",
  "transcript=\"$(",
  "  lsof -p \"$PPID\" 2>/dev/null |",
  "    awk '/\\/\\.codex\\/sessions\\/.*\\.jsonl$/ {print $NF; exit}'",
  ")\"",
  "",
  "if [ -z \"$transcript\" ]; then",
  "  echo \"codex session transcript not found\" >&2",
  "  exit 1",
  "fi",
  "",
  "session_id=\"$(",
  "  head -n 1 \"$transcript\" |",
  "    sed -n -e 's/.*\"session_id\":\"\\([^\"]*\\)\".*/\\1/p' -e 's/.*\"payload\":{\"id\":\"\\([^\"]*\\)\".*/\\1/p' |",
  "    head -n 1",
  ")\"",
  "",
  "if [ -z \"$session_id\" ]; then",
  "  echo \"codex session id not found\" >&2",
  "  exit 1",
  "fi",
  "",
  "printf '%s\\n' \"$session_id\"",
].join("\n") + "\n";

// Deployed to .sharkbay/harness/open-artifact.sh. Invoked by an agent when it
// finishes generating a task artifact, to ask SharkBay to open the resulting
// HTML in its built-in browser. Sends the request over the existing hook socket
// via the deployed `sharkbay-hook` CLI; fail-open (exit 0) if anything is
// missing so it never blocks the agent.
const OPEN_ARTIFACT_SCRIPT = [
  "#!/bin/sh",
  "set -eu",
  "",
  "# Usage: .sharkbay/harness/open-artifact.sh <artifact-html-path>",
  "input=\"${1:-}\"",
  "[ -n \"$input\" ] || exit 0",
  "",
  "script_dir=\"$(cd \"$(dirname \"$0\")\" && pwd)\"",
  "repo_root=\"$(cd \"$script_dir/../..\" && pwd)\"",
  "",
  "case \"$input\" in",
  "  /*) artifact=\"$input\" ;;",
  "  *)  artifact=\"$repo_root/$input\" ;;",
  "esac",
  "",
  "[ -f \"$artifact\" ] || exit 0",
  "",
  "support_dir=\"$HOME/Library/Application Support/SharkBay\"",
  "hook_cli=\"$support_dir/bin/sharkbay-hook\"",
  "[ -f \"$support_dir/hook-socket-path\" ] || exit 0",
  "[ -x \"$hook_cli\" ] || exit 0",
  "",
  "# Minimal JSON string escaping (backslash and double-quote).",
  "json_str() {",
  "  printf '\"%s\"' \"$(printf '%s' \"$1\" | sed 's/\\\\/\\\\\\\\/g; s/\"/\\\\\"/g')\"",
  "}",
  "",
  "payload=\"{\\\"type\\\":\\\"open_artifact\\\",\\\"path\\\":$(json_str \"$artifact\"),\\\"repo\\\":$(json_str \"$repo_root\")}\"",
  "printf '%s' \"$payload\" | \"$hook_cli\" --source artifact",
  "exit 0",
].join("\n") + "\n";

const REVIEW_SCRIPT = [
  "#!/bin/sh",
  "set -eu",
  "",
  "command=\"${1:-}\"",
  "[ -n \"$command\" ] || { echo 'Usage: review.sh <start|status|wait|cancel|complete> [options]' >&2; exit 2; }",
  "shift",
  "case \"$command\" in start|status|wait|cancel|complete) ;; *) echo \"Unknown review command: $command\" >&2; exit 2 ;; esac",
  "",
  "script_dir=\"$(cd \"$(dirname \"$0\")\" && pwd)\"",
  "repo_root=\"$(cd \"$script_dir/../..\" && pwd)\"",
  "client=\"$HOME/Library/Application Support/SharkBay/bin/sharkbay-review-control\"",
  "[ -x \"$client\" ] || { echo 'SharkBay Review control client is unavailable' >&2; exit 1; }",
  "",
  "exec \"$client\" \"$command\" \"$@\" --repo \"$repo_root\"",
].join("\n") + "\n";
const BOOTSTRAP_INTRO = [
  "I'm working in SharkBay Task Protocol mode for this project.",
  "Please read `.sharkbay/harness/protocol.md` first and follow it for the rest of this session.",
];

const BOOTSTRAP_CODEGRAPH_PROMPT = "CodeGraph is installed and configured for this project; when searching or understanding project code, use CodeGraph before rg/grep/ broad file reads.";

const BOOTSTRAP_TASK_PROMPT = [
  "If a later request involves editing project files, generating persisted project artifacts, running a multi-step implementation or verification workflow, or preparing a commit, create or update the required task under `.sharkbay/tasks/` before making project changes.",
  "Keep Files and Work updated while working; finish by filling Summary and Verification; record the commit hash if a commit is produced.",
  "Treat `.sharkbay/team-context/` as read-only.",
  "If `AGENTS.md` exists at the project root, also read it and follow its instructions.",
  "SharkBay supports asynchronous agent-initiated reviews; see `Agent-Initiated Review` in `.sharkbay/harness/protocol.md` before starting one.",
];

export type BootstrapPromptOptions = {
  codeGraphEnabled?: boolean;
  locale?: string;
};

export function bootstrapPrompt(options: BootstrapPromptOptions = {}): string {
  const languageSuffix = localeLanguageSuffix(options.locale);
  return [
    ...BOOTSTRAP_INTRO,
    ...(options.codeGraphEnabled ? [BOOTSTRAP_CODEGRAPH_PROMPT] : []),
    ...BOOTSTRAP_TASK_PROMPT,
    ...(languageSuffix ? [languageSuffix] : []),
  ].join(" ");
}

function localeLanguageSuffix(locale: string | undefined): string | null {
  const tag = locale || process.env.SHARKBAY_LOCALE;
  if (!tag) return null;
  const primary = tag.split("-")[0]!.toLowerCase();
  if (primary === "en") return null;
  try {
    const name = new Intl.DisplayNames([tag], { type: "language" }).of(primary);
    if (name) return `Respond in ${name}.`;
  } catch { /* unsupported locale */ }
  return null;
}

export const BOOTSTRAP_PROMPT = bootstrapPrompt();

export type ReviewPromptInput = {
  taskId: string;
  status: string;
  sourcePath?: string;
  reviewPath?: string;
  agentLabel?: string;
  runId?: string;
  completionToken?: string;
};

export type ArtifactPromptInput = {
  taskId: string;
  status: string;
  sourcePath?: string;
  artifactPath?: string;
  agentLabel?: string;
};

export function reviewPrompt(review: ReviewPromptInput, options: BootstrapPromptOptions = {}): string {
  const languageSuffix = localeLanguageSuffix(options.locale);
  const recordRef = review.sourcePath
    ? `\`${review.sourcePath}\``
    : "its task record under `.sharkbay/tasks/` (the file whose name begins with the task id)";
  const writeConstraint = review.reviewPath
    ? `This is a review, not an implementation. Do NOT change the project: do not edit, create, or delete project files; do not stage, commit, or push. The only files you may write are your review report at \`${review.reviewPath}\` (create the \`.sharkbay/reviews/\` directory if it does not exist) and a single appended record in this task's local record file under \`.sharkbay/tasks/\` (see below). Do not modify any other SharkBay task file and never touch files under \`.sharkbay/team-context/\`.`
    : "This is a review, not an implementation. Do NOT change anything: do not edit, create, or delete any file; do not stage, commit, or push. Report your findings in this chat only.";
  const reportInstruction = review.reviewPath
    ? `Write your review to \`${review.reviewPath}\` as Markdown — a one-line verdict, then strengths, then issues grouped by severity (blocker / major / minor), then concrete recommendations. Do not apply any change to the project itself.`
    : "Report a concise, structured review: a one-line verdict, then strengths, then issues grouped by severity (blocker / major / minor), then concrete recommendations. Do not apply any change yourself — only describe what you would change and why.";
  const recordInstruction = review.reviewPath
    ? `Then record it: append a one-line entry to this task's local record file under \`.sharkbay/tasks/\` (the file whose name begins with \`${review.taskId.split("-")[0]}\`) inside a \`## Reviews\` section — create that section at the end of the file if it does not exist. Use the format \`- <one-line verdict> — \\\`${review.reviewPath}\\\` (<timestamp>)\`, where <timestamp> is the output of \`date -u +%Y-%m-%dT%H:%M:%SZ\`. Append only; do not edit other sections. When you are done, tell me the report path.`
    : null;
  const completionInstruction = review.reviewPath && review.runId
    ? `Finally run \`.sharkbay/harness/review.sh complete --run ${review.runId} --report ${review.reviewPath}${review.completionToken ? ` --completion-token ${review.completionToken}` : ""}\`. SharkBay will validate the reserved report and notify the parent agent; do not skip this command.`
    : null;
  return [
    "I'm starting a read-only review session.",
    "This project tracks work as SharkBay task records under `.sharkbay/tasks/` (team records, read-only, under `.sharkbay/team-context/tasks/`).",
    `You are reviewing task \`${review.taskId}\` (status: ${review.status}). Read ${recordRef} first to understand the goal, the work done, the files it touched, and its claimed verification.`,
    ...(options.codeGraphEnabled ? [BOOTSTRAP_CODEGRAPH_PROMPT] : []),
    writeConstraint,
    reviewFocusLine(review.status),
    reportInstruction,
    ...(recordInstruction ? [recordInstruction] : []),
    ...(completionInstruction ? [completionInstruction] : []),
    ...(languageSuffix ? [languageSuffix] : []),
  ].join(" ");
}

function reviewFocusLine(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "completed":
      return "This task is marked completed. Review completion quality: verify the implementation actually matches the task's Summary, Files, and Work; confirm the listed changes do what they claim; assess whether the Verification is adequate and trustworthy; and surface any bugs, regressions, gaps, or unfinished edges.";
    case "blocked":
      return "This task is blocked. Diagnose the blocker: is it real, what are the root causes, and what are concrete paths to unblock it?";
    case "abandoned":
      return "This task was abandoned. Assess whether abandonment was justified and what, if anything, is worth salvaging or revisiting.";
    default:
      return "This task is in progress. Inspect the task record to judge its stage: if it is still at the planning/spec/design stage (no or few changed files yet), review the plan — soundness, completeness, alignment with the stated goal, missing requirements or edge cases, and simpler alternatives; if implementation is already underway, review the code changes for correctness, quality, and regressions.";
  }
}

/**
 * Allocate a review report path for a task using the task tag (first taskId
 * segment) plus a short random code, e.g. `.sharkbay/reviews/RVW7K2-N3T2AC.md`.
 * Reviews are local-only, so the tag is unique enough; the random suffix plus an
 * atomic `wx` create (retried on the rare collision) gives each launch its own
 * file with no read-then-write race. Also ensures the reviews directory exists.
 */
export async function reserveReviewPath(repoPath: string, taskId: string): Promise<string> {
  const dir = join(repoPath, ".sharkbay", "reviews");
  await mkdir(dir, { recursive: true });
  const tag = taskId.split("-")[0] || taskId;
  for (let attempt = 0; attempt < 10; attempt++) {
    const relativePath = `.sharkbay/reviews/${tag}-${shortReviewHash()}.md`;
    try {
      await writeFile(join(repoPath, relativePath), "", { flag: "wx" });
      return relativePath;
    } catch {
      // Name already taken — try another random code.
    }
  }
  throw new Error("Could not allocate a unique review report path.");
}

function shortReviewHash(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export function artifactPrompt(artifact: ArtifactPromptInput, options: BootstrapPromptOptions = {}): string {
  const languageSuffix = localeLanguageSuffix(options.locale);
  const recordRef = artifact.sourcePath
    ? `\`${artifact.sourcePath}\``
    : "its task record under `.sharkbay/tasks/` (the file whose name begins with the task id)";
  const outputInstruction = artifact.artifactPath
    ? `SharkBay has already reserved an empty placeholder file for you at \`${artifact.artifactPath}\`. Write the finished page into that exact path (overwrite the placeholder); do not pick a different name or directory.`
    : "Write the finished page to `.sharkbay/artifacts/<task-tag>-<name>.html` (create the directory if needed), where `<task-tag>` is the first segment of the task id.";
  const writeConstraint = artifact.artifactPath
    ? `The files you may create or modify are the artifact HTML at \`${artifact.artifactPath}\` and a single appended record in this task's local record file under \`.sharkbay/tasks/\` (see below). Do not edit other project files, never touch files under \`.sharkbay/team-context/\`, and do not stage, commit, or push.`
    : "Do not modify existing project source, do not modify any SharkBay task file, and do not stage, commit, or push. Only create the artifact HTML page.";
  const recordInstruction = artifact.artifactPath
    ? `Once the page is written, record it: append a one-line entry to this task's local record file under \`.sharkbay/tasks/\` (the file whose name begins with \`${artifact.taskId.split("-")[0]}\`) inside a \`## Artifacts\` section — create that section at the end of the file if it does not exist. Use the format \`- \\\`${artifact.artifactPath}\\\` — <one-line description of what the page shows> (<timestamp>)\`, where <timestamp> is the output of \`date -u +%Y-%m-%dT%H:%M:%SZ\`. Append only; do not edit other sections.`
    : null;
  const openInstruction = artifact.artifactPath
    ? `As the very last step, after the page is written and recorded, run \`.sharkbay/harness/open-artifact.sh ${artifact.artifactPath}\` from the project root to open it in SharkBay's built-in browser, then tell me the artifact path.`
    : "As the very last step, after the page is fully written, run `.sharkbay/harness/open-artifact.sh <path>` from the project root (passing the path you wrote) to open it in SharkBay's built-in browser, then tell me the artifact path.";
  return [
    "I'm starting a task-artifact session: your job is to produce a web page that showcases this task's deliverable.",
    "This project tracks work as SharkBay task records under `.sharkbay/tasks/` (team records, read-only, under `.sharkbay/team-context/tasks/`).",
    `You are creating an artifact for task \`${artifact.taskId}\` (status: ${artifact.status}). Read ${recordRef} first, then analyze every relevant piece of information about this task — its goal, the work done, the files it touched, the actual code or content it produced, and its verification — so the page reflects the real deliverable, not just the task metadata.`,
    ...(options.codeGraphEnabled ? [BOOTSTRAP_CODEGRAPH_PROMPT] : []),
    "Generate a single self-contained static HTML page (interactive only if it genuinely helps) whose core purpose is to present this task's deliverable in the clearest, most readable way. Use whatever best fits the work and your capabilities: prose, headings, tables, code blocks, charts, inline SVG diagrams, embedded images or screenshots, and light animation. Inline all CSS and JS and avoid any external network dependencies so the page renders offline.",
    outputInstruction,
    writeConstraint,
    ...(recordInstruction ? [recordInstruction] : []),
    openInstruction,
    ...(languageSuffix ? [languageSuffix] : []),
  ].join(" ");
}

/**
 * Allocate an HTML artifact path for a task using the task tag (first taskId
 * segment) plus a short random code, e.g.
 * `.sharkbay/artifacts/SHR4K2-N3T2AC.html`. Mirrors `reserveReviewPath`:
 * an atomic `wx` create (retried on the rare collision) reserves the file so
 * each launch gets its own placeholder with no read-then-write race. Also
 * ensures the artifacts directory exists.
 */
export async function reserveArtifactPath(repoPath: string, taskId: string): Promise<string> {
  const tag = taskId.split("-")[0] || taskId;
  const dir = join(repoPath, ".sharkbay", "artifacts");
  await mkdir(dir, { recursive: true });
  for (let attempt = 0; attempt < 10; attempt++) {
    const relativePath = `.sharkbay/artifacts/${tag}-${shortReviewHash()}.html`;
    try {
      await writeFile(join(repoPath, relativePath), "", { flag: "wx" });
      return relativePath;
    } catch {
      // Name already taken — try another random code.
    }
  }
  throw new Error("Could not allocate a unique artifact path.");
}

export type GitHubIdentity = {
  login: string;
  id: number;
  avatarUrl: string;
};

type ProtocolOptions = {
  githubLogin: string;
  githubUserId: number;
  machineId: string;
  agent: string;
  repo?: string;
};

type ManagedHarnessFile = {
  path: string;
  content: string;
  executable?: boolean;
};

export type HarnessFileIssue = {
  path: string;
  reason: "missing" | "changed";
};

export type HarnessUpdateStatus = {
  required: boolean;
  files: HarnessFileIssue[];
};

export type HarnessLocalIdentity = {
  githubLogin?: string;
  githubUserId?: number;
  machineId?: string;
};

export async function resolveGitHubIdentity(): Promise<GitHubIdentity> {
  const ghPath = await resolveGitHubCliPath();
  const { stdout } = await execFileAsync(ghPath, ["api", "user", "--jq", ".login + \"\\n\" + (.id|tostring) + \"\\n\" + .avatar_url"], { timeout: 10_000 });
  const [login, id, avatarUrl] = stdout.trim().split("\n");
  if (!login || !id) throw new Error("Failed to resolve GitHub identity from gh CLI");
  return { login: login!, id: Number(id), avatarUrl: avatarUrl ?? "" };
}

export async function checkRepoPermission(repo: string, login: string): Promise<string> {
  const ghPath = await resolveGitHubCliPath();
  const { stdout } = await execFileAsync(ghPath, ["api", `repos/${repo}/collaborators/${login}/permission`, "--jq", ".permission"], { timeout: 10_000 });
  return stdout.trim();
}

async function resolveGitHubCliPath(): Promise<string> {
  const executablePath = await resolveCommandPath("gh");
  if (executablePath) return executablePath;
  throw new Error("Protocol requires the GitHub CLI (`gh`). Install it with `brew install gh`, then run `gh auth login`.");
}

export function generateMachineId(): string {
  return randomBytes(3).toString("hex");
}

function managedHarnessFiles(options: ProtocolOptions): ManagedHarnessFile[] {
  return [
    {
      path: ".sharkbay/harness/protocol.md",
      content: generateProtocol(options),
    },
    {
      path: ".sharkbay/harness/agent-session-id.sh",
      content: AGENT_SESSION_ID_SCRIPT,
      executable: true,
    },
    {
      path: ".sharkbay/harness/open-artifact.sh",
      content: OPEN_ARTIFACT_SCRIPT,
      executable: true,
    },
    {
      path: ".sharkbay/harness/review.sh",
      content: REVIEW_SCRIPT,
      executable: true,
    },
  ];
}

async function writeManagedHarnessFiles(repoPath: string, options: ProtocolOptions): Promise<void> {
  const sbDir = join(repoPath, ".sharkbay");
  const harnessDir = join(sbDir, "harness");

  await mkdir(harnessDir, { recursive: true });
  await mkdir(join(sbDir, "tasks"), { recursive: true });
  await mkdir(join(sbDir, "team-context"), { recursive: true });

  await writeFile(join(sbDir, "machine-id"), options.machineId, "utf-8");
  for (const file of managedHarnessFiles(options)) {
    await writeFile(join(repoPath, file.path), file.content, "utf-8");
    if (file.executable) await chmod(join(repoPath, file.path), 0o755);
  }
}

export async function getHarnessUpdateStatus(repoPath: string): Promise<HarnessUpdateStatus> {
  if (!await hasSharkbayHarnessDir(repoPath)) return { required: false, files: [] };
  const options = await resolveProtocolOptions(repoPath, "", { resolveIdentity: false, generateMachineId: false });
  return compareManagedHarnessFiles(repoPath, options);
}

export async function updateHarnessFiles(repoPath: string): Promise<HarnessUpdateStatus> {
  const options = await resolveProtocolOptions(repoPath, "", { resolveIdentity: true, generateMachineId: true });
  await writeManagedHarnessFiles(repoPath, options);
  if (await isGitWorktree(repoPath)) {
    await ensureLocalExclude(repoPath);
  }
  return compareManagedHarnessFiles(repoPath, options);
}

export async function installHarness(
  repoPath: string,
  options: ProtocolOptions,
): Promise<void> {
  await writeManagedHarnessFiles(repoPath, options);
  if (await isGitWorktree(repoPath)) {
    await backupLocalExclude(repoPath, join(repoPath, ".sharkbay", "harness"));
    await ensureLocalExclude(repoPath);
  }
}

export async function assertHarnessInstallable(repoPath: string): Promise<void> {
  await assertIsGitWorktree(repoPath);
}

export async function isGitWorktree(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "rev-parse", "--is-inside-work-tree"], { timeout: 3_000 });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function assertIsGitWorktree(repoPath: string): Promise<void> {
  if (await isGitWorktree(repoPath)) return;
  throw new Error("Protocol harness requires a Git repository. Run git init in this folder before installing.");
}

export async function isHarnessInstalled(repoPath: string): Promise<boolean> {
  try {
    await access(join(repoPath, ".sharkbay", "harness", "protocol.md"));
    return true;
  } catch {
    return false;
  }
}

export async function getMachineId(repoPath: string): Promise<string | null> {
  try {
    return (await readFile(join(repoPath, ".sharkbay", "machine-id"), "utf-8")).trim();
  } catch {
    return null;
  }
}

export async function getLocalHarnessIdentity(repoPath: string): Promise<HarnessLocalIdentity> {
  const existing = await readExistingProtocolOptions(repoPath);
  return {
    githubLogin: existing.githubLogin,
    githubUserId: existing.githubUserId,
    machineId: await getMachineId(repoPath) ?? existing.machineId,
  };
}

export type ProtocolUninstallResult = {
  removedPaths: string[];
  skippedPaths: string[];
  excludeRemovedLines: string[];
};

export async function uninstallHarness(repoPath: string): Promise<ProtocolUninstallResult> {
  const removedPaths: string[] = [];
  const skippedPaths: string[] = [];

  const excludeRemovedLines = await restoreLocalExclude(repoPath);
  const sharkbayDir = join(repoPath, ".sharkbay");
  try {
    await access(sharkbayDir);
    await rm(sharkbayDir, { recursive: true, force: true });
    removedPaths.push(".sharkbay");
  } catch {
    skippedPaths.push(".sharkbay");
  }

  return { removedPaths: removedPaths.sort(), skippedPaths: skippedPaths.sort(), excludeRemovedLines };
}



async function backupLocalExclude(repoPath: string, harnessDir: string): Promise<void> {
  const backupPath = join(harnessDir, EXCLUDE_BACKUP_FILE);
  try {
    await access(backupPath);
    return;
  } catch {
    // First install in this worktree; capture the current local exclude state.
  }

  const excludePath = join(repoPath, ".git", "info", "exclude");
  try {
    const content = await readFile(excludePath, "utf-8");
    await writeFile(backupPath, content, "utf-8");
    await rm(join(harnessDir, EXCLUDE_MISSING_MARKER), { force: true });
  } catch {
    await writeFile(backupPath, "", "utf-8");
    await writeFile(join(harnessDir, EXCLUDE_MISSING_MARKER), "true\n", "utf-8");
  }
}

async function restoreLocalExclude(repoPath: string): Promise<string[]> {
  const backupPath = join(repoPath, ".sharkbay", "harness", EXCLUDE_BACKUP_FILE);
  const excludePath = join(repoPath, ".git", "info", "exclude");
  let content: string;
  try {
    content = await readFile(excludePath, "utf-8");
  } catch {
    content = "";
  }

  let backup = "";
  try {
    backup = await readFile(backupPath, "utf-8");
  } catch {
    backup = "";
  }

  if (backup.split("\n").includes("/.sharkbay/")) {
    return [];
  }

  const cleaned = cleanLocalExcludeContent(content);
  if (cleaned.removedLines.length === 0) return [];

  try {
    await access(join(repoPath, ".sharkbay", "harness", EXCLUDE_MISSING_MARKER));
    if (cleaned.content.length === 0) {
      await rm(excludePath, { force: true });
    } else {
      await writeFile(excludePath, cleaned.content, "utf-8");
    }
  } catch {
    await writeFile(excludePath, cleaned.content, "utf-8");
  }
  return cleaned.removedLines;
}

export function cleanLocalExcludeContent(content: string): { content: string; removedLines: string[] } {
  const normalized = content.replace(/\r\n/g, "\n");
  const hadFinalNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (hadFinalNewline) lines.pop();

  const removedLines: string[] = [];
  const kept = lines.filter((line) => {
    if (EXCLUDE_REMOVAL_ENTRIES.has(line.trim())) {
      removedLines.push(line);
      return false;
    }
    return true;
  });

  return {
    content: kept.length ? `${kept.join("\n")}${hadFinalNewline ? "\n" : ""}` : "",
    removedLines,
  };
}

async function compareManagedHarnessFiles(repoPath: string, options: ProtocolOptions): Promise<HarnessUpdateStatus> {
  const files: HarnessFileIssue[] = [];
  for (const file of managedHarnessFiles(options)) {
    const filePath = join(repoPath, file.path);
    let current: string;
    try {
      current = await readFile(filePath, "utf-8");
    } catch {
      files.push({ path: file.path, reason: "missing" });
      continue;
    }

    let changed = current !== file.content;
    if (!changed && file.executable) {
      try {
        const fileStat = await stat(filePath);
        changed = (fileStat.mode & 0o111) === 0;
      } catch {
        changed = true;
      }
    }
    if (changed) files.push({ path: file.path, reason: "changed" });
  }

  return { required: files.length > 0, files };
}

export async function ensureLocalExclude(repoPath: string): Promise<void> {
  const excludePath = join(repoPath, ".git", "info", "exclude");
  await mkdir(join(repoPath, ".git", "info"), { recursive: true });

  let content = "";
  try {
    content = await readFile(excludePath, "utf-8");
  } catch { /* file may not exist */ }

  content = content
    .split("\n")
    .filter((line) => !LEGACY_EXCLUDE_ENTRIES.includes(line.trim()))
    .join("\n");

  const missing = EXCLUDE_ENTRIES.filter((e) => !content.split("\n").includes(e));
  if (missing.length > 0) {
    const suffix = (content.endsWith("\n") || content === "" ? "" : "\n") + missing.join("\n") + "\n";
    await writeFile(excludePath, content + suffix, "utf-8");
  } else {
    await writeFile(excludePath, content.endsWith("\n") || content === "" ? content : `${content}\n`, "utf-8");
  }
}

export type AgentLaunchResult = {
  initialCommand: string;
  injected: boolean;
  bootstrapPrompt?: string;
  skippedReason?: "not-installed" | "unsupported-agent";
};

export async function prepareAgentLaunch(
  repoPath: string,
  agentId: string,
  initialCommand: string,
  options: BootstrapPromptOptions & { reviewPrompt?: string; artifactPrompt?: string } = {},
): Promise<AgentLaunchResult> {
  const prompt = options.reviewPrompt ?? options.artifactPrompt ?? bootstrapPrompt(options);
  const bootstrapArgs = agentBootstrapArgs(agentId, prompt);
  if (!bootstrapArgs) {
    return { initialCommand, injected: false, skippedReason: "unsupported-agent" };
  }
  if (!await isHarnessInstalled(repoPath)) {
    return { initialCommand, injected: false, skippedReason: "not-installed" };
  }

  return { initialCommand: appendShellArgs(withLaunchSessionId(agentId, initialCommand), bootstrapArgs), injected: true, bootstrapPrompt: prompt };
}

async function hasSharkbayHarnessDir(repoPath: string): Promise<boolean> {
  try {
    await access(join(repoPath, ".sharkbay"));
    return true;
  } catch {
    return false;
  }
}

function agentBootstrapArgs(agentId: string, prompt: string): string[] | null {
  const normalized = agentId.trim().toLowerCase();
  if (normalized === "codex" || normalized === "claude") return [prompt];
  if (normalized === "codewhale") return [];
  if (normalized === "gemini" || normalized === "qwen") return ["-i", prompt];
  if (normalized === "kiro") return [prompt];
  if (normalized === "opencode") return [];
  if (normalized === "cursor") return [prompt];
  return null;
}

function withLaunchSessionId(agentId: string, command: string): string {
  const normalized = agentId.trim().toLowerCase();
  if (normalized !== "claude" && normalized !== "gemini" && normalized !== "qwen") return command;
  if (/--resume\b|--continue\b/u.test(command)) return command;
  const sessionId = randomUUID();
  return `SHARKBAY_SESSION_ID=${shellQuote(sessionId)} ${appendShellArgs(command, ["--session-id", sessionId])}`;
}

function appendShellArgs(command: string, args: string[]): string {
  const suffix = args.map(shellQuote).join(" ");
  return suffix ? `${command} ${suffix}` : command;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function resolveProtocolOptions(
  repoPath: string,
  agentId: string,
  options: { resolveIdentity?: boolean; generateMachineId?: boolean } = {},
): Promise<ProtocolOptions> {
  const existing = await readExistingProtocolOptions(repoPath);
  const shouldResolveIdentity = options.resolveIdentity ?? true;
  const machineId = await getMachineId(repoPath)
    ?? existing.machineId
    ?? (options.generateMachineId === false ? "unknown" : generateMachineId());
  let identity: GitHubIdentity | null = null;
  if (shouldResolveIdentity && (!existing.githubLogin || !existing.githubUserId)) {
    try {
      identity = await resolveGitHubIdentity();
    } catch {
      identity = null;
    }
  }
  return {
    githubLogin: identity?.login ?? existing.githubLogin ?? "unknown",
    githubUserId: identity?.id ?? existing.githubUserId ?? 0,
    machineId,
    agent: agentId,
    repo: await resolveRepoName(repoPath) || existing.repo,
  };
}

async function readExistingProtocolOptions(repoPath: string): Promise<Partial<{ githubLogin: string; githubUserId: number; machineId: string; repo: string }>> {
  let content = "";
  try {
    content = await readFile(join(repoPath, ".sharkbay", "harness", "protocol.md"), "utf-8");
  } catch {
    return {};
  }
  const githubUserId = Number(readProtocolField(content, "GitHub user id"));
  return {
    repo: readProtocolField(content, "Repo") ?? undefined,
    githubLogin: readProtocolField(content, "GitHub login") ?? undefined,
    githubUserId: Number.isFinite(githubUserId) && githubUserId > 0 ? githubUserId : undefined,
    machineId: readProtocolField(content, "Machine id") ?? undefined,
  };
}

function readProtocolField(content: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim() || null;
}

async function resolveRepoName(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoPath, "config", "--get", "remote.origin.url"], { timeout: 3_000 });
    return githubRepoFromRemote(stdout.trim()) ?? "";
  } catch {
    return "";
  }
}

function githubRepoFromRemote(remoteOrigin: string | null): string | null {
  const match = remoteOrigin?.match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}



function generateProtocol(opts: { githubLogin: string; githubUserId: number; machineId: string; agent: string; repo?: string }): string {
  return `# SharkBay Harness Protocol

Project:
- Repo: ${opts.repo ?? ""}
- GitHub login: ${opts.githubLogin}
- GitHub user id: ${opts.githubUserId}
- Machine id: ${opts.machineId}
- Local tasks: .sharkbay/tasks/
- Team context mirror: .sharkbay/team-context/ (when sync is configured)
- Team context branch: sharkbay-team-context (when sync is configured)

## Agent Responsibility

You maintain SharkBay task files directly.
SharkBay reads and displays them.

## Team Context

Team context is available only when this protocol is installed for a GitHub repo
with sync configured. If .sharkbay/team-context/tasks/ is absent or empty
because no GitHub repo is configured, skip team-context searches and continue
with local task files under .sharkbay/tasks/.

When synced task records from the team are available, they are in:
.sharkbay/team-context/tasks/**/*.md

Treat .sharkbay/team-context/ as read-only. Write only your own task records
under .sharkbay/tasks/.

When the mirror exists and may contain synced tasks, before editing files,
making design decisions, or continuing work that may overlap with prior team
work, search the team context mirror.

Useful searches:
- rg "browser fullscreen" .sharkbay/team-context/tasks
- rg "docs/shared/teamwork-design.html" .sharkbay/team-context/tasks
- rg "issue #123" .sharkbay/team-context/tasks

If a previous task affects the current work, read that task record and mention
its taskId in the current task's Work Summary or Notes For Future Agents.

## Code Intelligence

This project has CodeGraph installed and configured. When searching code,
prefer CodeGraph over \`rg\`, \`grep\`, or broad file reads:
- \`codegraph query <symbol-or-name>\`
- \`codegraph callers <symbol>\`
- \`codegraph callees <symbol>\`
- \`codegraph impact <symbol>\`
- \`codegraph affected <changed-files>\`

Use \`codegraph context "what you need to understand"\` only for initial
exploration when no clear symbol or file is known.

## Agent-Initiated Review

SharkBay can run any installed supported agent as an asynchronous, read-only
reviewer for an existing task. Start a review from a SharkBay-managed agent
terminal when a design or implementation is ready for independent review:

\`.sharkbay/harness/review.sh start --task-id <task-id>\`

Without \`--agent\`, SharkBay uses the same agent as the parent terminal. Pass
\`--agent <agent-id>\` to select another installed supported agent. The command
returns a run id and reserved report path without waiting for the review to
finish. SharkBay opens the reviewer in a background Review tab in the current
application instance.

When the reviewer completes, SharkBay validates the reserved report and injects
a completion prompt into the original master agent terminal. The master agent
must read the report, assess its findings, and continue the parent task.
If the reviewer terminal exits before completion, SharkBay marks the run failed
and notifies the master agent to inspect its status.

Automatic notification waits while SharkBay observes an unsubmitted single-line
draft. SharkBay cannot inspect multi-line editor state held inside an agent TUI;
use the status fallback below if the completion prompt is delayed.

If the completion prompt is delayed, inspect the run without blocking:

\`.sharkbay/harness/review.sh status --run <run-id>\`

Cancel an unneeded run with:

\`.sharkbay/harness/review.sh cancel --run <run-id>\`

\`review.sh wait\` is a blocking fallback for scripted workflows. Do not use it
for the normal interactive flow.

## When To Create Or Update A Task

Create or update a SharkBay task file before performing a persistent
project-changing unit of work.

Project-changing work includes:
- editing files
- generating a persisted project artifact
- running a multi-step implementation or verification workflow
- preparing a commit
- turning an accepted issue or request into local work

Discussion, explanation, code reading, and design exploration can remain outside
task tracking until the user asks to record it or implementation begins.

## Task Identity

Use one task file per logical task.

- taskTag: 6 uppercase characters, for example A7K3P9
- taskId: <taskTag>-u<githubUserId>-m<machineId>
- filename: .sharkbay/tasks/<taskId>-<slug>.md
- slug: short lowercase words joined with hyphens

Example:
.sharkbay/tasks/A7K3P9-u${opts.githubUserId}-m${opts.machineId}-update-teamwork-design.md

## Mode

Use mode: quick for small, direct edits.
Use mode: task for broader work that needs a clearer summary, verification,
or commit context.

## Status

Use one of:
- active
- paused
- completed
- blocked
- abandoned

## Required Frontmatter

---
kind: sharkbay_task
taskId: A7K3P9-u${opts.githubUserId}-m${opts.machineId}
taskTag: A7K3P9
mode: task
title: Update teamwork design
status: active
actor: ${opts.githubLogin}
githubUserId: ${opts.githubUserId}
machine: ${opts.machineId}
agent: # e.g. Codex GPT-5.5
sessionId: # omit this line if unavailable
branch: main
createdAt: 2026-05-15T10:30:00Z
updatedAt: 2026-05-15T10:30:00Z
---

Use the actual task executor identity in \`agent\`, for example:
- Codex GPT-5.5
- Kiro Claude 4.6
- Claude Code Sonnet 4.5
- Gemini CLI 2.5 Pro

When creating a task, run \`.sharkbay/harness/agent-session-id.sh "<agent>"\`.
If it prints a session id, add \`sessionId: <id>\` immediately after
\`agent\`. If it fails or prints no id, omit the \`sessionId\` line.

Set \`branch\` to the current Git branch when the task is created. Keep that
original task-creation branch even if later work switches branches.

Before creating or updating any task file, run:

\`date -u +%Y-%m-%dT%H:%M:%SZ\`

Use that output verbatim for \`createdAt\`, \`updatedAt\`, and \`completedAt\`
when those fields are written or changed.

Never estimate, round, backfill, or fabricate timestamps.

When the task is complete (and ready for team sync when sync is configured), add:

status: completed
completedAt: 2026-05-15T11:40:00Z
commits:
  - abc1234
  - def5678

List every commit produced by the task, in chronological order.
A task may produce multiple commits (iterative fixes, follow-up adjustments).
All related commits must be recorded so the full change context is preserved,
even when commits from other concurrent tasks are interleaved.

## Required Sections

## Summary
One or two sentences describing the task outcome.

## Files
- path/to/changed-file

## Work
- Concise bullet describing meaningful work.
- Concise bullet describing meaningful decision or result.

## Verification
- Command, check, review, or reason verification was not run.

## Notes
- Context useful to future agents.

## Update Rules

Update the task file when:
- the task starts
- changed files become clear
- the work summary changes materially
- verification is run or intentionally skipped
- the task becomes blocked, abandoned, or ready to sync

Keep task files concise. Summarize work; keep raw chat transcripts in the CLI's
own session history.

When adding new content to an existing section, append it at the end of that
section. For example, add new Work or Verification bullets after the existing
bullets in those sections, not before them.

## Sync Readiness

Before setting status: completed, make sure:
- Summary describes the outcome
- Files lists changed project files
- Work captures the important steps or decisions
- Verification is filled
- commits lists all commits produced by the task (if any)

## Safety

Keep unrelated dirty files untouched.
Ask the user when task boundaries are unclear.
Keep secrets, credentials, tokens, customer data, and private transcripts out of
task files.
`;
}
