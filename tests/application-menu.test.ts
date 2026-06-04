import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createApplicationMenuTemplate } from "../src/main/application-menu.js";

function submenu(item: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  return Array.isArray(item.submenu) ? item.submenu : [];
}

describe("application menu", () => {
  it("puts Settings in the macOS app menu", () => {
    const openSettings = vi.fn();
    const newTerminalTab = vi.fn();
    const template = createApplicationMenuTemplate({
      appName: "SharkBay",
      isMac: true,
      openSettings,
      newTerminalTab,
    });

    expect(template[0]?.label).toBe("SharkBay");
    const settings = submenu(template[0] ?? {}).find((item) => item.label === "Settings...");

    expect(settings).toEqual(expect.objectContaining({ accelerator: "CmdOrCtrl+," }));
    settings?.click?.({} as never, undefined, {} as never);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it("puts New Terminal Tab in the macOS File menu", () => {
    const newTerminalTab = vi.fn();
    const template = createApplicationMenuTemplate({
      appName: "SharkBay",
      isMac: true,
      openSettings: vi.fn(),
      newTerminalTab,
    });

    const fileMenu = template.find((item) => item.label === "File");
    const newTerminal = submenu(fileMenu ?? {}).find((item) => item.label === "New Terminal Tab");

    expect(newTerminal).toEqual(expect.objectContaining({ accelerator: "CmdOrCtrl+T" }));
    newTerminal?.click?.({} as never, undefined, {} as never);
    expect(newTerminalTab).toHaveBeenCalledTimes(1);
  });

  it("keeps Settings reachable from File outside macOS", () => {
    const template = createApplicationMenuTemplate({
      appName: "SharkBay",
      isMac: false,
      openSettings: vi.fn(),
      newTerminalTab: vi.fn(),
    });

    expect(template[0]?.label).toBe("File");
    expect(submenu(template[0] ?? {})[2]).toEqual(
      expect.objectContaining({
        label: "Settings...",
        accelerator: "CmdOrCtrl+,",
      }),
    );
  });

  it("keeps New Terminal Tab reachable from File outside macOS", () => {
    const newTerminalTab = vi.fn();
    const template = createApplicationMenuTemplate({
      appName: "SharkBay",
      isMac: false,
      openSettings: vi.fn(),
      newTerminalTab,
    });

    const newTerminal = submenu(template[0] ?? {})[0];

    expect(newTerminal).toEqual(expect.objectContaining({ label: "New Terminal Tab", accelerator: "CmdOrCtrl+T" }));
    newTerminal?.click?.({} as never, undefined, {} as never);
    expect(newTerminalTab).toHaveBeenCalledTimes(1);
  });
});
