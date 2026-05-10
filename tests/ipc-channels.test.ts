import { describe, expect, it } from "vitest";
import { ipcChannels } from "../src/shared/ipc-channels.js";

describe("IPC channels", () => {
  it("exposes only the current generic workbench channels", () => {
    expect(ipcChannels).toEqual({
      listRoots: "config:listRoots",
      addRoot: "config:addRoot",
      removeRoot: "config:removeRoot",
      setAppearanceTheme: "config:setAppearanceTheme",
      scanProjects: "projects:scan",
      getProjectDetail: "projects:getDetail",
      listProjectFiles: "projects:listFiles",
      createTerminal: "terminal:create",
      terminalInput: "terminal:input",
      resizeTerminal: "terminal:resize",
      closeTerminal: "terminal:close",
      terminalData: "terminal:data",
      terminalUpdate: "terminal:update",
      terminalExit: "terminal:exit",
      listAgentClis: "agents:listClis",
      agentStatus: "agents:status",
    });
    expect(Object.values(ipcChannels).some((channel) => channel.startsWith("harness:"))).toBe(false);
  });
});
