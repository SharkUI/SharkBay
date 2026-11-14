import type { SharkBayBridge } from "../types.js";
import type { TerminalSession } from "../../shared/types.js";
import type { ApplicationMethod, ApplicationMethodMap, RuntimeTerminal, TerminalFrame } from "../../shared/application-api.js";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "unauthorized";
export type WebRuntimeBridge = {
  host: "web" | "electron";
  dispose: () => void;
  connection: () => ConnectionState;
  onConnection: (callback: (state: ConnectionState) => void) => () => void;
  onControl: (callback: () => void) => () => void;
  onTerminalsChanged: (callback: (terminals: RuntimeTerminal[]) => void) => () => void;
  onNotice: (callback: (message: string) => void) => () => void;
  listTerminals: () => Promise<RuntimeTerminal[]>;
  attachTerminal: (sessionId: string) => void;
  canControl: (sessionId: string) => boolean;
  takeControl: (sessionId: string) => Promise<void>;
  previewUrl: (url: string) => string;
};

export async function createWebBridge(): Promise<SharkBayBridge & { runtime: WebRuntimeBridge }> {
  const listeners = new Map<string, Set<(value: unknown) => void>>();
  const owners = new Map<string, string | null>();
  const sessions = new Map<string, TerminalSession>();
  const sequences = new Map<string, number>();
  const attached = new Set<string>();
  let disposed = false;
  let clientId = "";
  let connection: ConnectionState = "connecting";
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 300;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const publish = (name: string, value: unknown) => listeners.get(name)?.forEach((listener) => listener(value));
  const subscribe = <T>(name: string, callback: (value: T) => void) => {
    const listener = (value: unknown) => callback(value as T);
    let set = listeners.get(name);
    if (!set) { set = new Set(); listeners.set(name, set); }
    set.add(listener);
    return () => { set!.delete(listener); };
  };
  function setConnection(state: ConnectionState) { connection = state; publish("connection", state); }
  async function exchangeFragment(): Promise<void> {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const token = fragment.get("connect");
    if (!token) return;
    history.replaceState(null, "", location.pathname + location.search);
    const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (!response.ok) throw new Error((await response.json()).error?.message ?? "Connection link is invalid");
  }
  await exchangeFragment();
  const capabilities = await fetch("/api/capabilities");
  if (!capabilities.ok) throw new Error("Open the connection link printed by the running SharkBay host.");

  async function request<M extends ApplicationMethod>(method: M, input: ApplicationMethodMap[M]["input"]): Promise<ApplicationMethodMap[M]["result"]> {
    if (connection !== "connected" || !clientId) throw new Error("Runtime is disconnected. Wait for the connection to recover.");
    const response = await fetch("/api/command", { method: "POST", headers: { "Content-Type": "application/json", "X-SharkBay-Request": "1", "X-SharkBay-Client": clientId },
      body: JSON.stringify({ requestId: crypto.randomUUID(), method, input }) });
    const result = await response.json();
    if (response.status === 401) { setConnection("unauthorized"); socket?.close(); }
    if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Application command failed");
    return result.result;
  }
  const canControl = (sessionId: string) => connection === "connected" && owners.get(sessionId) === clientId;
  function attachTerminal(sessionId: string) {
    attached.add(sessionId); sequences.delete(sessionId);
    if (socket?.readyState === WebSocket.OPEN && connection === "connected") socket.send(JSON.stringify({ type: "attach", sessionId }));
  }
  async function listTerminals() {
    const result = await request("terminal.list", undefined);
    const ids = new Set(result.map((terminal) => terminal.session.id));
    for (const id of sessions.keys()) if (!ids.has(id)) { sessions.delete(id); owners.delete(id); sequences.delete(id); attached.delete(id); }
    for (const terminal of result) { owners.set(terminal.session.id, terminal.ownerId); sessions.set(terminal.session.id, terminal.session); }
    publish("control", undefined);
    return result;
  }
  function refreshTerminals() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { void listTerminals().then((result) => publish("terminals", result)).catch(() => {}); }, 50);
  }
  async function connect(): Promise<void> {
    clearTimeout(retry);
    setConnection("connecting");
    const next = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/events`);
    socket = next;
    await new Promise<void>((done, reject) => {
      const timeout = setTimeout(() => { reject(new Error("Runtime connection timed out")); next.close(); }, 10000);
      next.addEventListener("message", (message) => {
        if (socket !== next) return;
        let data: { type: string; clientId?: string; name?: string; payload?: unknown; message?: string };
        try { data = JSON.parse(String(message.data)); } catch { next.close(); return; }
        if (data.type === "hello" && data.clientId) {
          clearTimeout(timeout); clientId = data.clientId; retryDelay = 300;
          setConnection("connected");
          void listTerminals().then((result) => { for (const sessionId of attached) attachTerminal(sessionId); publish("terminals", result); }).catch(() => {});
          done(); return;
        }
        if (data.type === "error") { publish("notice", data.message ?? "Terminal operation failed"); return; }
        if (data.type !== "event" || !data.name) return;
        if (data.name === "terminal:control") {
          const control = data.payload as { sessionId: string; ownerId: string | null };
          owners.set(control.sessionId, control.ownerId); publish("control", undefined);
        }
        if (data.name === "terminal:update") {
          const update = data.payload as { session: TerminalSession; reason?: string };
          sessions.set(update.session.id, update.session);
          if (update.reason === "closed") { sessions.delete(update.session.id); attached.delete(update.session.id); sequences.delete(update.session.id); owners.delete(update.session.id); }
          if (update.reason === "created" || update.reason === "closed") refreshTerminals();
        }
        if (data.name === "terminal:exit") {
          const exit = data.payload as { sessionId: string };
          const session = sessions.get(exit.sessionId);
          if (session) sessions.set(exit.sessionId, { ...session, status: "exited" });
          publish("control", undefined);
        }
        if (data.name === "terminal:data") {
          const frame = data.payload as TerminalFrame;
          if (!attached.has(frame.sessionId)) return;
          if (frame.reset) sequences.set(frame.sessionId, frame.sequence);
          else {
            const previous = sequences.get(frame.sessionId);
            if (previous === undefined) return;
            if (frame.sequence <= previous) return;
            if (frame.sequence !== previous + 1) { attachTerminal(frame.sessionId); return; }
            sequences.set(frame.sessionId, frame.sequence);
          }
        }
        publish(data.name, data.payload);
      });
      next.addEventListener("close", (event) => {
        clearTimeout(timeout);
        if (socket !== next || disposed) return;
        clientId = "";
        if (event.code === 4001 || connection === "unauthorized") setConnection("unauthorized");
        else {
          setConnection("disconnected");
          const schedule = () => {
            if (socket !== next || disposed) return;
            retry = setTimeout(() => { void connect().catch(() => {}); }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 5000);
          };
          void fetch("/api/capabilities").then((response) => {
            if (socket !== next || disposed) return;
            if (response.status === 401) setConnection("unauthorized"); else schedule();
          }).catch(schedule);
        }
        reject(new Error("Runtime connection closed"));
      });
      next.addEventListener("error", () => next.close());
    });
  }
  const hashChange = () => { if (location.hash.includes("connect=")) void exchangeFragment().then(() => { socket?.close(); return connect(); }).catch((error) => publish("notice", error.message)); };
  const dispose = () => { disposed = true; clearTimeout(retry); clearTimeout(refreshTimer); socket?.close(); window.removeEventListener("hashchange", hashChange); };
  try { await connect(); } catch (error) { dispose(); throw error; }
  window.addEventListener("hashchange", hashChange);

  const runtime: WebRuntimeBridge = {
    host: "web", dispose, connection: () => connection,
    onConnection: (callback) => { callback(connection); return subscribe("connection", callback); },
    onControl: (callback) => subscribe("control", callback), onTerminalsChanged: (callback) => subscribe("terminals", callback), onNotice: (callback) => subscribe("notice", callback),
    listTerminals, attachTerminal, canControl,
    takeControl: async (sessionId) => { await request("terminal.claim", { sessionId }); owners.set(sessionId, clientId); publish("control", undefined); attachTerminal(sessionId); },
    previewUrl: (url) => `/api/preview?url=${encodeURIComponent(url)}`,
  };
  return {
    runtime,
    config: {
      get: () => request("config.get", undefined),
      listRoots: () => request("config.get", undefined),
      renameProject: (input) => request("config.renameProject", input), removeProject: (input) => request("config.removeProject", input),
      createWorktree: (input) => request("config.createWorktree", input),
      setAppearanceTheme: (input) => request("config.setAppearanceTheme", input), setTerminalAppearance: (input) => request("config.setTerminalAppearance", input),
      setStatusChangeNotifications: (input) => request("config.setStatusChangeNotifications", input),
    },
    projects: {
      scan: async () => { const result = await request("projects.scan", undefined); return { candidates: result.candidates, roots: result.roots.map((root) => ({ ...root, path: root.path ?? root.inputPath })) }; }, getSetupStatus: (input) => request("projects.getSetupStatus", input),
      getDetail: (input) => request("projects.getDetail", input), getGitHub: (input) => request("projects.getGitHub", input),
      listFiles: (input) => request("projects.listFiles", { projectUri: input.projectUri, directoryPath: input.directoryPath }),
      readFile: (input) => request("projects.readFile", input), writeFile: (input) => request("projects.writeFile", input),
      deleteFile: (input) => request("projects.deleteFile", input), renameFile: (input) => request("projects.renameFile", input),
    },
    codeGraph: { getStatus: (input) => request("codeGraph.getStatus", input), ensureStatus: (input) => request("codeGraph.ensureStatus", input) },
    terminal: {
      create: async (input) => { const { protocolBootstrap: _bootstrap, review: _review, artifact, ...command } = input;
        const session = artifact ? await request("artifacts.start", { repoPath: input.cwdUri.startsWith("local:") ? decodeURI(input.cwdUri.slice(6)) : new URL(input.cwdUri).pathname, taskId: artifact.taskId, agentId: input.agentId! }) : await request("terminal.create", command); sessions.set(session.id, session); owners.set(session.id, clientId); return session; },
      input: (input) => request("terminal.input", input),
      inputFire: (input) => {
        if (!canControl(input.sessionId)) { publish("notice", connection === "connected" ? "Take control of this terminal to type." : "Runtime disconnected; input was not sent."); return; }
        for (let index = 0; index < input.data.length; index += 8000) socket!.send(JSON.stringify({ type: "input", sessionId: input.sessionId, data: input.data.slice(index, index + 8000) }));
      },
      resize: async (input) => {
        const session = sessions.get(input.sessionId);
        if (!session) throw new Error("Terminal session no longer exists");
        if (!canControl(input.sessionId) || session.status === "exited" || (session.cols === input.cols && session.rows === input.rows)) return session;
        const result = await request("terminal.resize", input); sessions.set(result.id, result); return result;
      },
      close: async (input) => { const result = await request("terminal.close", input); attached.delete(input.sessionId); sequences.delete(input.sessionId); sessions.delete(input.sessionId); return result; },
      recordPrompt: (input) => { void request("terminal.recordPrompt", input).catch(() => {}); },
      recordPromptHistoryEntry: (input) => { void request("terminal.recordPromptHistoryEntry", input).catch(() => {}); },
      loadPromptHistory: (input) => request("terminal.loadPromptHistory", input),
      onData: (callback) => subscribe("terminal:data", callback), onExit: (callback) => subscribe("terminal:exit", callback), onUpdate: (callback) => subscribe("terminal:update", callback),
      onArtifactReady: (callback) => subscribe("terminal:openArtifact", callback), onArtifactStarted: (callback) => subscribe("artifacts:started", callback),
    },
    artifacts: { start: (input) => request("artifacts.start", input) },
    reviews: { start: (input) => request("reviews.start", { repoPath: input.repoPath, taskId: input.taskId, agentId: input.agentId, parentTerminalSessionId: input.parentTerminalSessionId }), cancel: (input) => request("reviews.cancel", input), onStarted: (callback) => subscribe("reviews:started", callback), onUpdated: (callback) => subscribe("reviews:updated", callback) },
    agents: {
      listClis: (input) => request("agents.listClis", input), listInstallRecipes: (input) => request("agents.listInstallRecipes", input), installTool: (input) => request("agents.installTool", input),
      setHooksEnabled: (input) => request("agents.setHooksEnabled", input), onStatus: (callback) => subscribe("agents:status", callback), onInstallLog: (callback) => subscribe("agents:installLog", callback),
    },
    targets: { pathExists: (input) => request("targets.pathExists", input) },
    plugins: { list: () => request("plugins.list", undefined), setEnabled: (input) => request("plugins.setEnabled", input) }, diagnostics: { read: () => request("diagnostics.read", undefined) },
    protocol: {
      getTasks: (input) => request("protocol.getTasks", input), getStatus: (input) => request("protocol.getStatus", input),
      install: (input) => request("protocol.install", { repoPath: input.repoPath }), enable: (input) => request("protocol.enable", input), uninstall: (input) => request("protocol.uninstall", input),
      resolveIdentity: () => request("protocol.resolveIdentity", undefined), syncNow: (input) => request("protocol.syncNow", input), updateHarness: (input) => request("protocol.updateHarness", input),
      onTasksChanged: (callback) => subscribe("protocol:tasksChanged", callback),
    },
    hooks: { getSessions: (input) => request("hooks.getSessions", input) },
    usage: { getSummary: (input) => request("usage.getSummary", input), getReport: (input) => request("usage.getReport", input) },
    shell: { openExternal: async ({ url }) => { const target = new URL(url, location.href); if (!["http:", "https:"].includes(target.protocol)) throw new Error("Unsupported link protocol"); window.open(target.href, "_blank", "noopener,noreferrer"); } },
  };
}
