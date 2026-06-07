import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type { AgentProjectStatusEvent } from "../src/shared/types.js";

const islandApi = {
  onSessionStatus(callback: (event: AgentProjectStatusEvent) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentProjectStatusEvent) => callback(payload);
    ipcRenderer.on(channels.agentStatus, listener);
    return () => ipcRenderer.removeListener(channels.agentStatus, listener);
  },
  onTabs(callback: (tabs: Array<{ sessionId: string; title: string; projectName: string; agentId?: string }>) => void) {
    ipcRenderer.on("island:tabs", (_event, tabs) => callback(tabs));
  },
  getAllSessions(): Promise<AgentProjectStatusEvent[]> {
    return ipcRenderer.invoke(channels.islandGetAllSessions);
  },
  focusSession(terminalSessionId: string): void {
    ipcRenderer.send(channels.islandFocusSession, terminalSessionId);
  },
  setExpanded(expanded: boolean, height?: number): void {
    ipcRenderer.send("island:setExpanded", expanded, height);
  },
  onCollapse(callback: () => void): void {
    ipcRenderer.on("island:collapse", () => callback());
  },
};

contextBridge.exposeInMainWorld("island", islandApi);

export type IslandApi = typeof islandApi;
