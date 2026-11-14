import type { ApplicationMethod } from "../shared/application-api.js";
import { ApplicationError } from "../shared/application-api.js";

type Rule = { required?: readonly string[]; strings?: readonly string[]; booleans?: readonly string[]; numbers?: readonly string[]; objects?: readonly string[]; optional?: readonly string[] };
const uri: Rule = { required: ["projectUri"], strings: ["projectUri"] };
const file: Rule = { required: ["projectUri", "relativePath"], strings: ["projectUri", "relativePath"] };
const repo: Rule = { required: ["repoPath"], strings: ["repoPath"] };
const session: Rule = { required: ["sessionId"], strings: ["sessionId"] };
export const applicationInputRules: Record<ApplicationMethod, Rule> = {
  "config.get": {},
  "config.renameProject": { required: ["uri", "name"], strings: ["uri", "name"] },
  "config.removeProject": { strings: ["uri", "path"] },
  "config.createWorktree": { required: ["sourceProjectPath", "branchName"], strings: ["sourceProjectPath", "branchName"] },
  "config.setAppearanceTheme": { required: ["theme"], strings: ["theme"] },
  "config.setTerminalAppearance": { strings: ["colorScheme", "fontFamily"], numbers: ["fontSize", "lineHeight"], optional: ["colorScheme", "fontFamily", "fontSize", "lineHeight"] },
  "config.setStatusChangeNotifications": { booleans: ["enabled", "completionEnabled", "approvalEnabled"] },
  "projects.scan": {}, "projects.getSetupStatus": repo,
  "projects.getDetail": uri, "projects.getGitHub": uri,
  "projects.listFiles": { ...uri, strings: ["projectUri", "directoryPath"] },
  "projects.readFile": file, "projects.writeFile": { ...file, required: [...file.required!, "content"], strings: [...file.strings!, "content"] },
  "projects.deleteFile": file, "projects.renameFile": { ...file, required: [...file.required!, "newName"], strings: [...file.strings!, "newName"] },
  "codeGraph.getStatus": uri, "codeGraph.ensureStatus": uri,
  "terminal.list": {},
  "terminal.create": { required: ["cwdUri"], strings: ["cwdUri", "title", "initialCommand", "initialCommandTitle", "agentId"], numbers: ["cols", "rows"], objects: ["service"] },
  "terminal.input": { required: ["sessionId", "data"], strings: ["sessionId", "data"] },
  "terminal.resize": { ...session, required: ["sessionId", "cols", "rows"], numbers: ["cols", "rows"] },
  "terminal.close": session, "terminal.claim": session,
  "terminal.recordPrompt": { required: ["terminalSessionId", "text"], strings: ["terminalSessionId", "text"] },
  "terminal.recordPromptHistoryEntry": { required: ["key", "text"], strings: ["key", "text"] },
  "terminal.loadPromptHistory": session,
  "artifacts.start": { required: ["repoPath", "taskId", "agentId"], strings: ["repoPath", "taskId", "agentId"] },
  "reviews.start": { required: ["repoPath", "taskId"], strings: ["repoPath", "taskId", "agentId", "parentTerminalSessionId"] },
  "reviews.cancel": { required: ["runId"], strings: ["runId"] },
  "agents.listClis": { strings: ["cwdUri"] },
  "agents.listInstallRecipes": { required: ["targetId"], strings: ["toolId", "targetId"] },
  "agents.installTool": { required: ["recipeId", "targetId"], strings: ["recipeId", "targetId"] },
  "agents.setHooksEnabled": { required: ["agentId", "enabled"], strings: ["agentId"], booleans: ["enabled"] },
  "targets.pathExists": { required: ["targetId", "path"], strings: ["targetId", "path"] },
  "plugins.list": {}, "plugins.setEnabled": { required: ["pluginId", "enabled"], strings: ["pluginId"], booleans: ["enabled"] },
  "diagnostics.read": {},
  "protocol.getTasks": repo, "protocol.getStatus": repo, "protocol.install": repo, "protocol.enable": repo,
  "protocol.uninstall": { ...repo, booleans: ["cleanTeamContext"] }, "protocol.resolveIdentity": {}, "protocol.syncNow": repo, "protocol.updateHarness": repo,
  "hooks.getSessions": repo,
  "usage.getSummary": { numbers: ["periodDays"] },
  "usage.getReport": { strings: ["startDate", "endDate", "agentId", "projectPath"] },
};

export function validateApplicationInput(method: string, value: unknown): Record<string, unknown> {
  if (!Object.hasOwn(applicationInputRules, method)) throw new ApplicationError("UNKNOWN_METHOD", "Unsupported application command", 404);
  const input = value === undefined ? {} : value;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApplicationError("INVALID_INPUT", "Command input must be an object");
  const data = input as Record<string, unknown>;
  const rule = applicationInputRules[method as ApplicationMethod];
  const allowed = new Set([...(rule.strings ?? []), ...(rule.booleans ?? []), ...(rule.numbers ?? []), ...(rule.objects ?? []), ...(rule.optional ?? [])]);
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) throw new ApplicationError("INVALID_INPUT", `Unexpected field: ${key}`);
    const field = data[key];
    if (field === undefined || (field === null && rule.optional?.includes(key))) continue;
    if (rule.strings?.includes(key) && (typeof field !== "string" || field.length > (key === "content" ? 1024 * 1024 : 65536))) throw new ApplicationError("INVALID_INPUT", `Invalid ${key}`);
    if (rule.booleans?.includes(key) && typeof field !== "boolean") throw new ApplicationError("INVALID_INPUT", `Invalid ${key}`);
    if (rule.numbers?.includes(key) && (typeof field !== "number" || !Number.isFinite(field))) throw new ApplicationError("INVALID_INPUT", `Invalid ${key}`);
    if (rule.objects?.includes(key) && (!field || typeof field !== "object" || Array.isArray(field))) throw new ApplicationError("INVALID_INPUT", `Invalid ${key}`);
  }
  for (const key of rule.required ?? []) if (data[key] === undefined || (typeof data[key] === "string" && !(data[key] as string).length && key !== "content" && key !== "data")) throw new ApplicationError("INVALID_INPUT", `Missing ${key}`);
  for (const key of ["cols", "rows"]) if (data[key] !== undefined && (!Number.isInteger(data[key]) || (data[key] as number) < 1 || (data[key] as number) > 500)) throw new ApplicationError("INVALID_INPUT", `Invalid ${key}`);
  if (data.service) {
    const service = data.service as Record<string, unknown>;
    if (Object.keys(service).some((key) => !["id", "label", "command"].includes(key)) || ["id", "label", "command"].some((key) => typeof service[key] !== "string" || !(service[key] as string).length)) throw new ApplicationError("INVALID_INPUT", "Invalid service command");
  }
  return data;
}
