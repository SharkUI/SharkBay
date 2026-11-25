import { execFileSync } from "node:child_process";
import { link, lstat, mkdir, open, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir, userInfo } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { readRuntimeMigration, sameProfile, type AdoptedRuntime, type RuntimeMigration } from "./migration-state.js";
import { RuntimeClient, type RuntimeHello } from "./control-client.js";

export const macRuntimeServiceLabel = "xyz.sharkbay.runtime";

function serviceTarget(label: string) {
  if (!/^xyz\.sharkbay\.runtime(?:\.[a-z0-9-]+)?$/.test(label)) throw new Error("Invalid Runtime service label");
  const domain = `gui/${userInfo().uid}`;
  return { domain, target: `${domain}/${label}`, file: path.join(homedir(), "Library", "LaunchAgents", `${label}.plist`) };
}

export function runtimeServiceEnvironment() {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    SHELL: process.env.SHELL || userInfo().shell || "/bin/sh",
    TMPDIR: tmpdir(),
  };
}

export function macRuntimeServicePlist(label: string, args: string[], env: Record<string, string>, log: string) {
  const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join("")}</array>
  <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([key, value]) => `<key>${xml(key)}</key><string>${xml(value)}</string>`).join("")}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`;
}

function launchctl(args: string[]): string {
  return execFileSync("/bin/launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function registeredService(target: string): string | undefined {
  try { return launchctl(["print", target]); } catch { return undefined; }
}

async function unloadService(target: string) {
  try { launchctl(["bootout", target]); }
  catch (error) { if (registeredService(target)) throw error; }
  const deadline = Date.now() + 10_000;
  while (registeredService(target)) {
    if (Date.now() >= deadline) throw new Error("SharkBay LaunchAgent is still stopping");
    await delay(100);
  }
}

function serviceMatches(status: string, file: string, args: string[]) {
  const field = (name: string) => status.match(new RegExp(`^[ \\t]*${name} = (.+)$`, "m"))?.[1];
  const registeredArgs = status.match(/^[ \t]*arguments = \{\n([\s\S]*?)^[ \t]*\}/m)?.[1]?.trim().split("\n").map((arg) => arg.trim());
  return field("path") === file && field("program") === args[0] && sameArguments(registeredArgs, args);
}

function sameArguments(actual: unknown, expected: string[]) {
  return Array.isArray(actual) && actual.length === expected.length && expected.every((arg, index) => actual[index] === arg);
}

function readMacRuntimeService(label: string, executable: string, args?: string[]): { target: string; pid?: number } | undefined {
  const { target, file } = serviceTarget(label);
  try {
    const status = launchctl(["print", target]);
    const field = (name: string) => status.match(new RegExp(`^\\s*${name} = (.+)$`, "m"))?.[1];
    if (field("path") !== file || field("program") !== executable || (args && !serviceMatches(status, file, args))) return undefined;
    const pid = Number(field("pid"));
    return { target, pid: Number.isSafeInteger(pid) && pid > 0 ? pid : undefined };
  } catch { return undefined; }
}

export function migrationServiceArguments(recordFile: string, record: RuntimeMigration): string[] {
  if (record.phase === "adopted") return record.arguments;
  const { label, node, port, lan } = record.service;
  const cli = path.resolve(path.dirname(node), "../dist-runtime/src/server/cli.js");
  return [
    node, cli, "serve", "--background", "--data-dir", record.userDataPath, "--config", record.configPath,
    "--port", String(port), ...(lan ? ["--lan"] : []), "--migration-record", recordFile, "--migration-service", label,
    ...(record.attempt ? ["--migration-attempt", record.attempt] : []),
  ];
}

async function readLaunchAgent(file: string) {
  const info = await lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (!info) return undefined;
  if (!info.isFile() || (info.mode & 0o022) !== 0 || info.uid !== userInfo().uid) throw new Error("Untrusted SharkBay LaunchAgent file");
  return JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" })) as {
    Label?: string; Program?: string; ProgramArguments?: unknown; RunAtLoad?: boolean; Disabled?: boolean; KeepAlive?: { SuccessfulExit?: boolean };
  };
}

function requireLaunchAgent(label: string, agent: Awaited<ReturnType<typeof readLaunchAgent>>, args: string[]) {
  if (agent?.Label !== label || !sameArguments(agent.ProgramArguments, args) || agent.RunAtLoad !== true
    || (agent.Program !== undefined && agent.Program !== args[0])
    || (agent.Disabled !== undefined && agent.Disabled !== false) || agent.KeepAlive?.SuccessfulExit !== false) {
    throw new Error("SharkBay LaunchAgent configuration does not match the Runtime");
  }
}

async function requirePersistentService(label: string, args: string[]) {
  const { file, domain } = serviceTarget(label);
  requireLaunchAgent(label, await readLaunchAgent(file), args);
  const overrides = launchctl(["print-disabled", domain]);
  if (overrides.split("\n").some((line) => line.trim() === `"${label}" => disabled`)) {
    throw new Error("SharkBay LaunchAgent is disabled");
  }
}

function standaloneServiceProfile(args: string[]) {
  const [node, cli, command, background, dataFlag, userDataPath] = args;
  if (!node || !cli || !userDataPath || ![node, cli, userDataPath].every((value) => path.isAbsolute(value))
    || command !== "serve" || background !== "--background" || dataFlag !== "--data-dir") return undefined;
  const rest = args.slice(6);
  const configPath = rest[0] === "--config" ? rest.splice(0, 2)[1] : path.join(userDataPath, "config.json");
  const [portFlag, portText, lanFlag] = rest;
  if (!configPath || !path.isAbsolute(configPath) || portFlag !== "--port" || !portText || !/^\d+$/.test(portText)
    || Number(portText) > 65535 || rest.length > 3 || (rest.length === 3 && lanFlag !== "--lan")) return undefined;
  return { node, cli, userDataPath, configPath, port: Number(portText), lan: lanFlag === "--lan" };
}

export async function standaloneRuntimeService(label: string, hello: RuntimeHello, version: string): Promise<AdoptedRuntime | undefined> {
  if (hello.runtime?.version !== version) return undefined;
  const { file } = serviceTarget(label);
  const args = (await readLaunchAgent(file))?.ProgramArguments;
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) return undefined;
  const service = standaloneServiceProfile(args);
  if (!service || service.port === 0) return undefined;
  const { node, port, lan, cli } = service;
  if (await realpath(node) !== hello.runtime.executable || await realpath(cli) !== hello.runtime.cli
    || hello.origin !== `http://127.0.0.1:${port}`) return undefined;
  const record: AdoptedRuntime = {
    phase: "adopted", version, cli: hello.runtime.cli, arguments: args, service: { label, node, port, lan },
    userDataPath: await realpath(service.userDataPath), configPath: await realpath(service.configPath),
  };
  if (await persistentServicePid(label, args) === hello.pid) return record;
  return undefined;
}

export async function matchesAdoptedRuntime(record: AdoptedRuntime, hello: RuntimeHello) {
  const configured = await standaloneRuntimeService(record.service.label, hello, record.version);
  return !!configured && sameProfile(configured, record) && configured.cli === record.cli
    && sameArguments(configured.arguments, record.arguments);
}

export async function changeRegisteredMacRuntimeService(label: string, action: "enable" | "disable", lan: boolean) {
  const { file, domain, target } = serviceTarget(label);
  const agent = await readLaunchAgent(file);
  const registered = registeredService(target);
  if (!agent && !registered) return undefined;
  const args = agent?.ProgramArguments;
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === "string")) throw new Error("Unrecognized SharkBay LaunchAgent");
  let profile = standaloneServiceProfile(args);
  if (!profile) {
    const index = args.indexOf("--migration-record");
    const recordFile = index === -1 ? undefined : args[index + 1];
    const record = recordFile && path.isAbsolute(recordFile) ? await readRuntimeMigration(recordFile) : undefined;
    if (!recordFile || record?.phase !== "committed" || record.service.label !== label || !sameArguments(args, migrationServiceArguments(recordFile, record))) {
      throw new Error("Unrecognized or unfinished SharkBay Runtime migration service");
    }
    profile = { ...record, ...record.service, cli: args[1]! };
  }
  requireLaunchAgent(label, agent, args);
  if (registered && !serviceMatches(registered, file, args)) throw new Error("A different SharkBay Runtime service is registered");
  if (action === "disable") {
    launchctl(["disable", target]);
    if (registered) await unloadService(target);
  } else {
    if (lan && !profile.lan) throw new Error("This SharkBay service is configured for localhost. Enable it without --lan to keep its profile.");
    if (!registered) {
      const running = await RuntimeClient.connect(profile.userDataPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT" && error.code !== "ECONNREFUSED") throw error;
        return undefined;
      });
      if (running) {
        running.dispose();
        throw new Error("A SharkBay runtime is already running. Stop it before enabling the background service.");
      }
    }
    launchctl(["enable", target]);
    if (!registered) launchctl(["bootstrap", domain, file]);
    else if (!readMacRuntimeService(label, args[0]!, args)?.pid) launchctl(["kickstart", target]);
  }
  return profile.userDataPath;
}

export async function persistentMigrationServicePid(recordFile: string, record: RuntimeMigration): Promise<number | undefined> {
  return persistentServicePid(record.service.label, migrationServiceArguments(recordFile, record));
}

async function persistentServicePid(label: string, args: string[]) {
  await requirePersistentService(label, args);
  return readMacRuntimeService(label, args[0]!, args)?.pid;
}

export function macRuntimeServicePid(label: string, executable: string): number | undefined {
  return readMacRuntimeService(label, executable)?.pid;
}

export async function startRecordedMacRuntimeService(recordFile: string, record: RuntimeMigration): Promise<void> {
  const args = migrationServiceArguments(recordFile, record);
  const { label, node } = record.service;
  if (record.phase === "adopted") {
    const configured = standaloneServiceProfile(args);
    if (!configured || configured.node !== node || configured.port !== record.service.port || configured.lan !== record.service.lan
      || await realpath(configured.cli) !== record.cli || await realpath(configured.userDataPath) !== record.userDataPath
      || await realpath(configured.configPath) !== record.configPath) throw new Error("The standalone Runtime service configuration has changed");
  }
  await requirePersistentService(label, args);
  const service = readMacRuntimeService(label, node, args);
  if (service) {
    if (!service.pid) launchctl(["kickstart", service.target]);
  } else {
    const { domain, file, target } = serviceTarget(label);
    if (registeredService(target)) throw new Error("A different SharkBay Runtime service is registered");
    launchctl(["bootstrap", domain, file]);
  }
}

export async function installMigrationService(label: string, args: string[], dataPath: string): Promise<void> {
  const { file, domain, target } = serviceTarget(label);
  const log = path.join(dataPath, "runtime.log");
  await (await open(log, "a", 0o600)).close();
  const content = macRuntimeServicePlist(label, args, runtimeServiceEnvironment(), log);
  const current = await readLaunchAgent(file);
  if (current) await requirePersistentService(label, args);
  const registered = registeredService(target);
  if (registered) {
    if (current && serviceMatches(registered, file, args)) return;
    throw new Error("A different SharkBay Runtime service is already registered");
  }
  if (!current) {
    await mkdir(path.dirname(file), { recursive: true });
    const staging = `${file}.${randomUUID()}`;
    try {
      const handle = await open(staging, "wx", 0o600);
      try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
      // Link succeeds only if no other service has claimed this label.
      await link(staging, file);
    } finally { await rm(staging, { force: true }); }
  }
  await requirePersistentService(label, args);
  launchctl(["bootstrap", domain, file]);
}

export async function removeCancelledMigrationService(label: string, args: string[]): Promise<void> {
  const { target, file } = serviceTarget(label);
  const installed = await readLaunchAgent(file);
  const registered = registeredService(target);
  if (registered) {
    if (!serviceMatches(registered, file, args)) return;
    await unloadService(target);
  }
  if (installed?.Label === label && sameArguments(installed.ProgramArguments, args)) await rm(file, { force: true });
}
