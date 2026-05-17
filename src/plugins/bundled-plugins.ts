import { agentBundledPlugin, createAgentInstallRecipes } from "./bundled/agent-detector.js";
import { coreBundledPlugin } from "./bundled/core-detectors.js";
import { goBundledPlugin } from "./bundled/go-detector.js";
import { javaBundledPlugin } from "./bundled/java-detector.js";
import { nodeBundledPlugin } from "./bundled/node-detector.js";
import { pythonBundledPlugin } from "./bundled/python-detector.js";
import { rustBundledPlugin } from "./bundled/rust-detector.js";
import type { BundledPlugin } from "./plugin-host.js";

export function bundledPlugins(): BundledPlugin[] {
  return [
    coreBundledPlugin(),
    agentBundledPlugin(),
    nodeBundledPlugin(),
    pythonBundledPlugin(),
    goBundledPlugin(),
    rustBundledPlugin(),
    javaBundledPlugin(),
  ];
}

export { createAgentInstallRecipes };
