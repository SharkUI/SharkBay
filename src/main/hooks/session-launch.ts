import { execFile } from "node:child_process";
import { lstat, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { readJsonFile, writeJsonAtomic } from "../json-file.js";
import { qwenSessionHooks, sessionHookArguments } from "./connectors/claude-family.js";
import { cursorSessionHookSettings } from "./connectors/cursor.js";
import { geminiSessionHooks } from "./connectors/gemini.js";
import { registerKiroLaunchHooks } from "./connectors/kiro.js";
import { hasOpenCodeUserHook, registerOpenCodeUserHook, writeOpenCodeHookPlugin } from "./connectors/opencode.js";
import { ReasonixConnector, reasonixHome } from "./connectors/reasonix.js";

export type SessionHookLaunch = { args?: string[]; command?: string; env?: Record<string, string>; disabled?: boolean };
export type SessionHookCommand = { command: string; cwd: string; env: NodeJS.ProcessEnv };

const execFileAsync = promisify(execFile);

export async function prepareSessionHookLaunch(agentId: string, hookCli: string, launch: SessionHookCommand): Promise<SessionHookLaunch> {
  const { command, cwd, env } = launch;
  if (agentId === "claude" || agentId === "codex") return { args: sessionHookArguments(agentId, hookCli, command) };
  if (agentId === "kiro") {
    const version = await readAgentVersion("kiro-cli", launch);
    return version ? registerKiroLaunchHooks(hookCli, command, cwd, env, version) : {};
  }
  if (agentId === "reasonix") {
    const connector = new ReasonixConnector({ configPath: path.join(reasonixHome(env, cwd), "settings.json") });
    if (await connector.status(hookCli) !== "installed") await connector.install(hookCli);
    return {};
  }
  const directory = path.join(path.dirname(path.dirname(hookCli)), "session-hooks", agentId);
  if (agentId === "cursor") {
    const hooksDir = path.join(directory, "hooks");
    const manifestDir = path.join(directory, ".cursor-plugin");
    await mkdir(hooksDir, { recursive: true });
    await mkdir(manifestDir, { recursive: true });
    await writeJsonAtomic(path.join(manifestDir, "plugin.json"), { name: "sharkbay-status" });
    await writeJsonAtomic(path.join(hooksDir, "hooks.json"), cursorSessionHookSettings(hookCli));
    return { args: ["--plugin-dir", directory] };
  }
  if (agentId === "opencode") {
    const variable = "OPENCODE_CONFIG_CONTENT";
    const configDir = openCodeConfigDir(env);
    if (!hasOpenCodeUserHook(configDir) && !hasConfigOverride(variable, launch) && !hasConfigOverride("OPENCODE_CONFIG_DIR", launch)
        && await openCodePluginReady(launch, configDir)) {
      writeOpenCodeHookPlugin(directory, hookCli);
      return { env: { [variable]: JSON.stringify({ plugin: [pathToFileURL(directory + path.sep).href] }) } };
    }
    registerOpenCodeUserHook(hookCli, configDir);
    return {};
  }
  if (agentId !== "gemini" && agentId !== "qwen") return {};
  const gemini = agentId === "gemini";
  const prefix = gemini ? "GEMINI_CLI" : "QWEN_CODE";
  const defaultsVariable = `${prefix}_SYSTEM_DEFAULTS_PATH`;
  if (hasConfigOverride(defaultsVariable, launch) || hasConfigOverride(`${prefix}_SYSTEM_SETTINGS_PATH`, launch)) return {};
  const systemDir = process.platform === "darwin"
    ? path.join("/Library/Application Support", gemini ? "GeminiCli" : "QwenCode")
    : path.join("/etc", gemini ? "gemini-cli" : "qwen-code");
  // A CLI defaults override replaces the file at its normal path. Keep any administrator defaults.
  try {
    await lstat(path.join(systemDir, "system-defaults.json"));
    return {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(directory, { recursive: true });
  const settings = path.join(directory, "settings.json");
  await writeJsonAtomic(settings, { hooks: gemini ? geminiSessionHooks(hookCli) : qwenSessionHooks(hookCli) });
  return { env: { [defaultsVariable]: settings } };
}

function hasConfigOverride(variable: string, launch: SessionHookCommand): boolean {
  return Boolean(launch.env[variable]) || new RegExp(`(?:^|\\s)${variable}=`, "u").test(launch.command);
}

async function readAgentVersion(bin: string, { command, cwd, env }: SessionHookCommand): Promise<string> {
  const invocation = command.replace(/^(?:[A-Z_][A-Z0-9_]*=(?:'[^']*'|[^\s]+)\s+)+/u, "");
  const executable = invocation.match(/^'([^']+)'(?:\s|$)/u)?.[1] ?? invocation.split(" ", 1)[0] ?? "";
  if (path.basename(executable) !== bin) return "";
  return execFileAsync(executable, ["--version"], { cwd, env, timeout: 1000 })
    .then(result => result.stdout.trim(), () => "");
}

function openCodeConfigDir(env: NodeJS.ProcessEnv): string {
  return path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || homedir(), ".config"), "opencode");
}

async function openCodePluginReady(launch: SessionHookCommand, config: string): Promise<boolean> {
  // OpenCode v1 waits for dependency installation before loading any external plugin.
  const { cwd, env } = launch;
  const version = (await readAgentVersion("opencode", launch)).replace(/^v/u, "");
  if (!/^1\.\d+\.\d+$/u.test(version)) return false;
  const home = env.HOME || homedir();
  const directories = new Set([config, path.join(home, ".opencode")]);
  for (let current = cwd; current !== path.dirname(current); current = path.dirname(current)) {
    directories.add(path.join(current, ".opencode"));
  }
  for (const dir of directories) {
    try {
      await lstat(dir);
    } catch (error) {
      if (dir !== config && (error as NodeJS.ErrnoException).code === "ENOENT") continue;
      return false;
    }
    const dependency = await readJsonFile(path.join(dir, "node_modules", "@opencode-ai", "plugin", "package.json"));
    if (!dependency.ok || (dependency.data as { version?: string } | null)?.version !== version) return false;
  }
  return true;
}
