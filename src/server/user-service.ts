import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { RuntimeClient, defaultRuntimeDataPath, runtimeProtocolVersion } from "../runtime/control-client.js";
import { changeRegisteredMacRuntimeService, macRuntimeServiceLabel as label, macRuntimeServicePlist, runtimeServiceEnvironment } from "../runtime/mac-runtime-service.js";

const unit = "sharkbay-runtime.service";
export async function changeUserService(action: "enable" | "disable", lan: boolean): Promise<void> {
  const mac = process.platform === "darwin";
  if (!mac && process.platform !== "linux") throw new Error("SharkBay background services are supported on macOS and Linux.");

  if (mac) {
    const savedProfile = await changeRegisteredMacRuntimeService(label, action, lan);
    if (action === "disable") {
      console.log("SharkBay background service disabled.");
      return;
    }
    if (savedProfile) return waitForService(savedProfile);
  }
  const profile = defaultRuntimeDataPath();
  const file = mac
    ? join(homedir(), "Library", "LaunchAgents", `${label}.plist`)
    : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "systemd", "user", unit);
  const domain = `gui/${userInfo().uid}`;
  const target = `${domain}/${label}`;
  const name = mac ? "launchctl" : "systemctl";
  const registeredArgs = mac ? ["print", target] : ["--user", "is-active", "--quiet", unit];
  const current = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });

  if (action === "disable") {
    if (current) {
      run(name, ["--user", "disable", "--now", unit]);
    }
    await rm(file, { force: true });
    if (current) run(name, ["--user", "daemon-reload"]);
    console.log("SharkBay background service disabled.");
    return;
  }

  const port = process.env.SHARKBAY_RUNTIME_PORT ?? "17777";
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error("Invalid SHARKBAY_RUNTIME_PORT");
  const args = [process.execPath, fileURLToPath(new URL("./cli.js", import.meta.url)),
    "serve", "--background", "--data-dir", profile, "--port", port, ...(lan ? ["--lan"] : [])];
  const env = runtimeServiceEnvironment();
  const log = join(profile, "runtime.log");
  const content = mac ? macRuntimeServicePlist(label, args, env, log) : systemdUnit(args, env);
  if (current && current !== content) {
    throw new Error("SharkBay already has a different service configuration. Run sharkbay service disable before enabling it again.");
  }
  if (current && run(name, registeredArgs, true)) {
    console.log("SharkBay background service is already enabled.");
    return;
  }

  try {
    const running = await RuntimeClient.connect(profile);
    running.dispose();
    throw new Error("A SharkBay runtime is already running. Stop it before enabling the background service.");
  } catch (error) {
    if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }

  await mkdir(dirname(file), { recursive: true });
  if (mac) {
    await mkdir(profile, { recursive: true, mode: 0o700 });
    await writeFile(log, "", { flag: "a", mode: 0o600 });
  }
  if (!current) await writeFile(file, content, { flag: "wx", mode: 0o600 });
  if (mac) {
    run(name, ["enable", target]);
    run(name, ["bootstrap", domain, file]);
  } else {
    run(name, ["--user", "daemon-reload"]);
    run(name, ["--user", "enable", "--now", unit]);
  }
  await waitForService(profile);
}

async function waitForService(profile: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const client = await RuntimeClient.connect(profile).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT" && error.code !== "ECONNREFUSED") throw error;
      return undefined;
    });
    if (client) {
      try {
        const { origin } = await client.call<{ origin: string }>("hello", { protocol: runtimeProtocolVersion });
        console.log(`SharkBay background service enabled. Open ${origin}`);
        return;
      } finally { client.dispose(); }
    }
    await setTimeout(100);
  }
  throw new Error(`SharkBay service is installed, but the runtime did not start. Check ${process.platform === "darwin" ? join(profile, "runtime.log") : `journalctl --user -u ${unit}`}.`);
}

function run(command: string, args: string[], quiet = false): boolean {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (quiet) return false;
  throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim() || result.signal || result.status}`);
}

function systemdUnit(args: string[], env: Record<string, string>): string {
  const quote = (value: string) => JSON.stringify(value.replaceAll("%", "%%"));
  return `[Unit]
Description=SharkBay Runtime

[Service]
ExecStart=${[":" + args[0], ...args.slice(1)].map(quote).join(" ")}
${Object.entries(env).map(([key, value]) => `Environment=${quote(`${key}=${value}`)}`).join("\n")}
Restart=on-failure

[Install]
WantedBy=default.target
`;
}
