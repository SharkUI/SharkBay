import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { RuntimeClient, defaultRuntimeDataPath, runtimeProtocolVersion } from "../runtime/control-client.js";

const unit = "sharkbay-runtime.service";
const label = "xyz.sharkbay.runtime";

export async function changeUserService(action: "enable" | "disable", lan: boolean): Promise<void> {
  const mac = process.platform === "darwin";
  if (!mac && process.platform !== "linux") throw new Error("SharkBay background services are supported on macOS and Linux.");

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
    if (mac) {
      if (run(name, registeredArgs, true)) run(name, ["bootout", target]);
    } else if (current) {
      run(name, ["--user", "disable", "--now", unit]);
    }
    await rm(file, { force: true });
    if (!mac && current) run(name, ["--user", "daemon-reload"]);
    console.log("SharkBay background service disabled.");
    return;
  }

  const port = process.env.SHARKBAY_RUNTIME_PORT ?? "17777";
  if (!/^\d+$/.test(port) || Number(port) > 65535) throw new Error("Invalid SHARKBAY_RUNTIME_PORT");
  const args = [process.execPath, fileURLToPath(new URL("./cli.js", import.meta.url)),
    "serve", "--background", "--data-dir", profile, "--port", port, ...(lan ? ["--lan"] : [])];
  const env = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    SHELL: process.env.SHELL || userInfo().shell || "/bin/sh",
    TMPDIR: tmpdir(),
  };
  const log = join(profile, "runtime.log");
  const content = mac ? launchAgent(args, env, log) : systemdUnit(args, env);
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
    run(name, ["bootstrap", domain, file]);
  } else {
    run(name, ["--user", "daemon-reload"]);
    run(name, ["--user", "enable", "--now", unit]);
  }
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
  throw new Error(`SharkBay service is installed, but the runtime did not start. Check ${mac ? log : `journalctl --user -u ${unit}`}.`);
}

function run(command: string, args: string[], quiet = false): boolean {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (quiet) return false;
  throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim() || result.signal || result.status}`);
}

function launchAgent(args: string[], env: Record<string, string>, log: string): string {
  const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>${args.map((arg) => `<string>${xml(arg)}</string>`).join("")}</array>
  <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`).join("")}</dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`;
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
