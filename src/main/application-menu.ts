import type { MenuItemConstructorOptions } from "electron";

export type ApplicationMenuOptions = {
  appName: string;
  isMac: boolean;
  openSettings: () => void;
  newTerminalTab: () => void;
};

function createNewTerminalTabItem(newTerminalTab: () => void): MenuItemConstructorOptions {
  return {
    label: "New Terminal Tab",
    accelerator: "CmdOrCtrl+T",
    click: newTerminalTab,
  };
}

function createSettingsItem(openSettings: () => void): MenuItemConstructorOptions {
  return {
    label: "Settings...",
    accelerator: "CmdOrCtrl+,",
    click: openSettings,
  };
}

function createSharedMenus(newTerminalTab: () => void): MenuItemConstructorOptions[] {
  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [createNewTerminalTabItem(newTerminalTab)],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "delete" },
      { type: "separator" },
      { role: "selectAll" },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
  };

  const helpMenu: MenuItemConstructorOptions = {
    role: "help",
    submenu: [{ label: "SharkBay Help", enabled: false }],
  };

  return [fileMenu, editMenu, viewMenu, windowMenu, helpMenu];
}

export function createApplicationMenuTemplate({
  appName,
  isMac,
  openSettings,
  newTerminalTab,
}: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  const settingsItem = createSettingsItem(openSettings);
  const newTerminalTabItem = createNewTerminalTabItem(newTerminalTab);

  if (isMac) {
    return [
      {
        label: appName,
        submenu: [
          { role: "about" },
          { type: "separator" },
          settingsItem,
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      ...createSharedMenus(newTerminalTab),
    ];
  }

  return [
    {
      label: "File",
      submenu: [newTerminalTabItem, { type: "separator" }, settingsItem, { type: "separator" }, { role: "quit" }],
    },
    ...createSharedMenus(newTerminalTab).slice(1),
  ];
}
