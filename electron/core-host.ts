import { SharkBayCoreService } from "../src/core/core-service.js";
import { LocalProvider } from "../src/providers/local/local-provider.js";
import { SshProvider } from "../src/providers/ssh/ssh-provider.js";
import { createDefaultSecretStore } from "../src/main/secrets.js";
import {
  serializeError,
  type CoreEventMessage,
  type CoreEventName,
  type CoreMessage,
  type CoreMethodName,
  type CoreReadyMessage,
  type CoreRequestMessage,
  type CoreResponseMessage,
} from "../src/core/core-protocol.js";

const parentPort = process.parentPort;
if (!parentPort) {
  throw new Error("core-host must be launched as an Electron utility process");
}

const secretStore = createDefaultSecretStore();
const core = new SharkBayCoreService([
  new LocalProvider(),
  new SshProvider({ secretStore }),
]);

const forwardEvent = (name: CoreEventName, payload: unknown) => {
  const message: CoreEventMessage = { kind: "event", name, payload };
  parentPort.postMessage(message);
};

core.on("terminalData", (event) => forwardEvent("terminalData", event));
core.on("terminalUpdate", (event) => forwardEvent("terminalUpdate", event));
core.on("terminalExit", (event) => forwardEvent("terminalExit", event));
core.on("installLog", (event) => forwardEvent("installLog", event));

type Dispatcher = (args: unknown[]) => Promise<unknown> | unknown;

const dispatchers: Record<CoreMethodName, Dispatcher> = {
  scanProjects: ([runtime, input]) => core.scanProjects(runtime as never, input as never),
  listAgentClis: ([runtime, input]) => core.listAgentClis(runtime as never, input as never),
  listInstallRecipes: ([runtime, input]) => core.listInstallRecipes(runtime as never, input as never),
  installTool: ([runtime, input]) => core.installTool(runtime as never, input as never),
  getProjectDetail: ([runtime, input]) => core.getProjectDetail(runtime as never, input as never),
  listProjectFiles: ([runtime, input]) => core.listProjectFiles(runtime as never, input as never),
  readProjectFile: ([runtime, input]) => core.readProjectFile(runtime as never, input as never),
  writeProjectFile: ([runtime, input]) => core.writeProjectFile(runtime as never, input as never),
  readMachineProfile: ([runtime, targetId, options]) => core.readMachineProfile(runtime as never, targetId as string, options as never),
  readProjectProfile: ([runtime, projectUri, options]) => core.readProjectProfile(runtime as never, projectUri as string, options as never),
  pathExistsOnTarget: ([runtime, input]) => core.pathExistsOnTarget(runtime as never, input as never),
  listPlugins: () => core.listPlugins(),
  setPluginEnabled: ([pluginId, enabled]) => core.setPluginEnabled(pluginId as string, enabled as boolean),
  applyDisabledPlugins: ([disabledIds]) => core.applyDisabledPlugins(disabledIds as string[]),
  readDiagnostics: () => core.readDiagnostics(),
  createTerminal: ([runtime, input]) => core.createTerminal(runtime as never, input as never),
  inputTerminal: ([input]) => core.inputTerminal(input as never),
  resizeTerminal: ([input]) => core.resizeTerminal(input as never),
  closeTerminal: ([input]) => core.closeTerminal(input as never),
  closeAllTerminalSessions: () => core.closeAllTerminalSessions(),
};

parentPort.on("message", async (event) => {
  const message = event.data as CoreMessage;
  if (!message || message.kind !== "request") return;
  const request = message as CoreRequestMessage;
  const dispatch = dispatchers[request.method];
  if (!dispatch) {
    const response: CoreResponseMessage = {
      kind: "response",
      id: request.id,
      ok: false,
      error: { name: "Error", message: `Unknown core method: ${request.method}` },
    };
    parentPort.postMessage(response);
    return;
  }
  try {
    const result = await dispatch(request.args);
    const response: CoreResponseMessage = { kind: "response", id: request.id, ok: true, result };
    parentPort.postMessage(response);
  } catch (error) {
    const response: CoreResponseMessage = {
      kind: "response",
      id: request.id,
      ok: false,
      error: serializeError(error),
    };
    parentPort.postMessage(response);
  }
});

const ready: CoreReadyMessage = { kind: "ready" };
parentPort.postMessage(ready);
