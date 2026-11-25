import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, cp, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const [flavor, configFile, legacyZip, option] = process.argv.slice(2);
if (!["legacy-qa", "bridge", "1.0"].includes(flavor) || !configFile || (flavor !== "1.0" && !legacyZip)) {
  throw new Error("Usage: pack-macos-migration-desktop.mjs legacy-qa|bridge CONFIG LEGACY.zip [--dir|--zip] | 1.0 CONFIG [--dir|--zip]");
}
const config = JSON.parse(await readFile(configFile, "utf8"));
const qa = config.qa;
const productionRepo = `${config.owner}/${config.repo}`.toLowerCase() === "sharkui/sharkbay";
if (typeof config.owner !== "string" || !/^[a-zA-Z0-9-]+$/.test(config.owner) || typeof config.repo !== "string"
  || !/^[a-zA-Z0-9_.-]+$/.test(config.repo) || productionRepo === !!qa) {
  throw new Error("Use SharkUI/SharkBay for production and a separate fixture repository for QA");
}
if (qa && (!/^xyz\.sharkbay\.[a-z0-9-]+$/.test(qa.appId) || qa.appId === "xyz.sharkbay.app"
  || !/^SharkBay [A-Za-z0-9 -]+$/.test(qa.name) || !/^xyz\.sharkbay\.runtime\.[a-z0-9-]+$/.test(qa.serviceLabel)
  || !Number.isInteger(qa.port) || qa.port < 1024 || qa.port > 65535 || qa.port === 17777)) {
  throw new Error("The QA app must have isolated application and service identifiers");
}
if (flavor === "legacy-qa" && !qa) throw new Error("Legacy builds require an isolated QA configuration");
if (qa?.host && !/^127\.0\.0\.1:[1-9]\d{0,4}$/.test(qa.host)) throw new Error("The QA update host must be loopback");
const feed = {
  provider: "github", owner: config.owner, repo: config.repo,
  ...(flavor === "legacy-qa" ? {} : { channel: "desktop" }),
  ...(qa?.host ? { host: qa.host, protocol: "http" } : {}),
};
const project = process.cwd();
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Use the npm packaging command");
const output = path.resolve("release", qa?.host ? "desktop-migration-single-repo-qa" : qa ? "desktop-migration-github-qa" : "desktop-migration", flavor);
await mkdir(output, { recursive: true });
async function verifyDesktopOnlyManifest() {
  if (flavor === "1.0" && (await readdir(output)).includes("latest-mac.yml")) {
    throw new Error("The 1.0 output directory contains an old-channel latest-mac.yml. Move it out before packaging.");
  }
}
await verifyDesktopOnlyManifest();
const workspace = await mkdtemp(path.join(tmpdir(), "sharkbay-migration-desktop-"));
const run = (bin, args, cwd = project) => execFileSync(bin, args, { cwd, stdio: "inherit" });

async function patch(file, old, replacement) {
  const source = await readFile(file, "utf8");
  if (source.split(old).length !== 2) throw new Error(`The audited v0.3.13 patch does not match ${file}`);
  await writeFile(file, source.replace(old, () => replacement));
}

async function runtimeFiles(root, directory = "", result = []) {
  for (const name of (await readdir(path.join(root, directory))).sort()) {
    const relative = path.join(directory, name);
    const file = path.join(root, relative);
    const info = await lstat(file);
    if (info.isDirectory()) await runtimeFiles(root, relative, result);
    else if (info.isSymbolicLink()) result.push({ path: relative, link: await readlink(file) });
    else if (info.isFile()) result.push({ path: relative, sha256: createHash("sha256").update(await readFile(file)).digest("hex") });
    else throw new Error(`Unexpected legacy Runtime file: ${relative}`);
  }
  return result;
}

try {
  const overrides = {
    publish: feed, directories: { output },
    ...(qa ? { productName: qa.name, appId: qa.appId } : {}),
    extraMetadata: {
      version: { "legacy-qa": "0.3.13", bridge: "0.3.14", "1.0": "1.0.0" }[flavor],
      ...(qa ? { name: qa.appId.replaceAll(".", "-"), productName: qa.name } : {}),
    },
  };
  let cwd = project;
  if (flavor !== "1.0") {
    const extracted = path.join(workspace, "released");
    run("/usr/bin/ditto", ["-x", "-k", path.resolve(legacyZip), extracted]);
    const released = path.join(extracted, "SharkBay.app");
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", released]);
    run("/usr/bin/codesign", ["--verify", "-R", '=identifier "xyz.sharkbay.app" and anchor apple generic and certificate leaf[subject.OU] = "P43Y97XG4F"', released]);
    const version = execFileSync("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", path.join(released, "Contents/Info.plist")], { encoding: "utf8" }).trim();
    if (version !== "0.3.13") throw new Error("Legacy archive must be the signed 0.3.13 release");
    cwd = path.join(workspace, "bridge");
    await mkdir(cwd);
    const source = execFileSync("git", ["archive", "v0.3.13"], { maxBuffer: 80 * 1024 * 1024 });
    execFileSync("/usr/bin/tar", ["-xf", "-"], { input: source, cwd });
    const legacy = path.join(released, "Contents/Resources/runtime");
    await cp(legacy, path.join(cwd, ".runtime-bundle"), { recursive: true, verbatimSymlinks: true });
    await writeFile(path.join(output, "legacy-runtime-manifest.json"), JSON.stringify(await runtimeFiles(legacy), null, 2) + "\n");

    const entry = path.join(cwd, "electron/main.ts");
    if (qa) await patch(entry, 'app.setName("SharkBay");', `app.setName(${JSON.stringify(qa.name)});`);
    if (flavor === "bridge") {
      const runtimeUrl = new URL(config.runtime.url);
      if (config.runtime.version !== "1.0.0" || !/^[a-f0-9]{64}$/.test(config.runtime.sha256)
        || (runtimeUrl.protocol !== "https:" && !(qa?.host === runtimeUrl.host && runtimeUrl.protocol === "http:"))) {
        throw new Error("The signed bridge requires a pinned 1.0.0 Runtime package");
      }
      for (const file of [
        "electron/desktop-migration.ts", "src/main/app-updates.ts", "src/runtime/migration-state.ts",
        "src/runtime/migration-package.ts", "src/runtime/mac-runtime-service.ts", "src/runtime/profile-lock.ts", "src/runtime/control-client.ts",
      ]) await copyFile(path.join(project, file), path.join(cwd, file));

      await patch(entry, 'import { ensureRuntime } from "./runtime-client.js";',
        'import { ensureRuntime } from "./runtime-client.js";\nimport { openDesktopMigrationBridge } from "./desktop-migration.js";');
      await patch(entry, "let installUpdateOnQuit = false;\n", "");
      await patch(entry, "  const runtime = await ensureRuntime(startup);", [
        "  const bridge = await openDesktopMigrationBridge();",
        "  if (bridge) electronUpdater.autoUpdater.setFeedURL(bridge.feed);",
        "  const runtime = bridge ? await bridge.connectLegacy((dataDir, configPath) => ensureRuntime(startup, dataDir, configPath)) : await ensureRuntime(startup);",
      ].join("\n"));
      await patch(entry, '    if (isQuitting && cleanupComplete && state.status === "error") app.quit();\n  });',
        '    if (isQuitting && cleanupComplete && state.status === "error") app.quit();\n  }, bridge?.allowUpdate);');
      await patch(entry, '    installUpdateOnQuit = true;\n    app.quit();', [
        "    return appUpdates!.install(() => {",
        "      // Close desktop windows before the native updater asks the process to exit.",
        "      isQuitting = true;",
        "      cleanupComplete = true;",
        "      appUpdates!.stop();",
        "      void disconnectRuntime().catch(() => {});",
        "      for (const window of BrowserWindow.getAllWindows()) window.destroy();",
        "    });",
      ].join("\n"));
      await patch(entry, '    if (installUpdateOnQuit && appUpdates?.getState().status === "ready") {\n      appUpdates.install();\n    } else {\n      app.quit();\n    }', '    app.quit();');
      const updateHint = path.join(cwd, "src/renderer/update-hint.tsx");
      await patch(updateHint, "Restart SharkBay to install. Running agents and terminals will stop.", "Restart SharkBay to install. The Runtime keeps running.");
      await patch(updateHint, "Install when SharkBay quits", "Keep using this version until you choose to install");

      const client = path.join(cwd, "electron/runtime-client.ts");
      await patch(client, "export async function ensureRuntime(report: (stage: string) => void = () => {}): Promise<RuntimeClient> {\n  const dataPath = process.env.SHARKBAY_RUNTIME_DATA_DIR ?? defaultRuntimeDataPath();",
        "export async function ensureRuntime(report: (stage: string) => void = () => {}, dataPath = process.env.SHARKBAY_RUNTIME_DATA_DIR ?? defaultRuntimeDataPath(), configPath = process.env.SHARKBAY_CONFIG_PATH): Promise<RuntimeClient> {");
      await patch(client, '  if (process.env.SHARKBAY_CONFIG_PATH) args.push("--config", process.env.SHARKBAY_CONFIG_PATH);',
        '  if (configPath) args.push("--config", configPath);');

      const bridgeManifest = path.join(cwd, "runtime-migration.json");
      await writeFile(bridgeManifest, JSON.stringify({ ...feed, runtime: config.runtime, serviceLabel: qa?.serviceLabel, qa: !!qa }));
      const legacyConfig = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")).build;
      overrides.extraResources = [...legacyConfig.extraResources, { from: "runtime-migration.json", to: "runtime-migration.json" }];
    }
    if (qa) {
      const client = path.join(cwd, "electron/runtime-client.ts");
      await patch(client, "?? defaultRuntimeDataPath()", '?? join(app.getPath("userData"), "qa-runtime")');
      await patch(client, '?? "17777"', `?? "${qa.port}"`);
    }
    run(process.execPath, [npm, "ci", "--no-audit", "--no-fund"], cwd);
  } else if (qa) {
    const marker = path.join(workspace, "runtime-migration-qa");
    await writeFile(marker, "");
    const desktop = JSON.parse(await readFile(path.join(project, "package.json"), "utf8")).build;
    overrides.extraResources = [...desktop.extraResources, { from: marker, to: "runtime-migration-qa" }];
  }
  run(process.execPath, [npm, "run", "build:desktop"], cwd);
  run(process.execPath, [npm, "exec", "--", "vite", "build"], cwd);
  const manifest = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
  const builderConfig = path.join(workspace, "electron-builder.json");
  const mac = qa?.host ? { ...manifest.build.mac, timestamp: "none", notarize: false } : manifest.build.mac;
  await writeFile(builderConfig, JSON.stringify({ ...manifest.build, ...overrides, mac }, null, 2));
  const targetMode = flavor === "1.0" ? legacyZip : option;
  if (targetMode && targetMode !== "--zip" && targetMode !== "--dir") throw new Error("Unsupported build target");
  run(process.execPath, [
    npm, "exec", "--", "electron-builder", "--config", builderConfig, "--mac", ...(targetMode === "--zip" ? ["zip"] : []),
    "--arm64", "--publish", "never", ...(targetMode === "--dir" ? ["--dir"] : []),
  ], cwd);
  if (targetMode !== "--dir" && flavor === "bridge") {
    await copyFile(path.join(output, "desktop-mac.yml"), path.join(output, "latest-mac.yml"));
  }
  await verifyDesktopOnlyManifest();
} finally { await rm(workspace, { recursive: true, force: true }); }
