import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels as channels } from "../src/shared/ipc-channels.js";
import type { FindPopoverResult } from "../src/shared/types.js";

contextBridge.exposeInMainWorld("findPopover", {
  onInit: (callback: (data: { theme: string }) => void) => {
    ipcRenderer.on(channels.findPopoverInit, (_event, data: { theme: string }) => callback(data));
  },
  onResult: (callback: (data: FindPopoverResult) => void) => {
    ipcRenderer.on(channels.findPopoverResult, (_event, data: FindPopoverResult) => callback(data));
  },
  query: (text: string) => ipcRenderer.send(channels.findPopoverQuery, text),
  step: (forward: boolean) => ipcRenderer.send(channels.findPopoverStep, forward),
  dismiss: () => ipcRenderer.send(channels.findPopoverDismiss),
});
