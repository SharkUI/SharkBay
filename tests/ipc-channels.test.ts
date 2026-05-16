import { describe, expect, it } from "vitest";
import { ipcChannels } from "../src/shared/ipc-channels.js";

describe("IPC channels", () => {
  it("exposes only the current generic workbench channels", () => {
    expect(ipcChannels).toEqual({
      listRoots: "config:listRoots",
      addRoot: "config:addRoot",
      removeRoot: "config:removeRoot",
      pickProjectFolder: "config:pickProjectFolder",
      addProject: "config:addProject",
      removeProject: "config:removeProject",
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
      createBrowser: "browser:create",
      browserNavigate: "browser:navigate",
      browserResize: "browser:resize",
      browserClose: "browser:close",
      browserGoBack: "browser:goBack",
      browserGoForward: "browser:goForward",
      browserReload: "browser:reload",
      browserUpdate: "browser:update",
      listAgentClis: "agents:listClis",
      agentStatus: "agents:status",
      teamworkGetTasks: "teamwork:getTasks",
      teamworkGetStatus: "teamwork:getStatus",
      teamworkInstall: "teamwork:install",
      teamworkEnable: "teamwork:enable",
      teamworkUninstall: "teamwork:uninstall",
      teamworkResolveIdentity: "teamwork:resolveIdentity",
      teamworkSyncNow: "teamwork:syncNow",
      teamworkTasksChanged: "teamwork:tasksChanged",
    });
  });
});
