import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const script = readFileSync(new URL("../src/island/island.html", import.meta.url), "utf8")
  .match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error("Island script not found");

type Tab = { sessionId: string; state: string; projectName: string; lastPrompt?: string };
const tab = (state: string, sessionId = "codex-1"): Tab => ({ sessionId, state, projectName: "SharkBay" });

function islandHarness() {
  function element() {
    const classes = new Set<string>();
    const listeners = new Map<string, () => void>();
    return {
      style: { display: "", height: "", setProperty: vi.fn() },
      innerHTML: "",
      classList: {
        contains: (name: string) => classes.has(name),
        add: (name: string) => { classes.add(name); },
        remove: (name: string) => { classes.delete(name); },
        toggle: (name: string, enabled: boolean) => { if (enabled) classes.add(name); else classes.delete(name); },
      },
      addEventListener: (name: string, listener: () => void) => { listeners.set(name, listener); },
      setAttribute: vi.fn(),
      matches: () => false,
      emit: (name: string) => listeners.get(name)?.(),
    };
  }
  const elements = new Map<string, ReturnType<typeof element>>();
  function getElement(id: string) {
    let found = elements.get(id);
    if (!found) { found = element(); elements.set(id, found); }
    return found;
  }
  const island = getElement("island");
  island.classList.add("closed");
  let sendTabs: (tabs: Tab[]) => void = () => {};
  let collapse: () => void = () => {};
  const setExpanded = vi.fn();
  runInNewContext(script!, {
    document: { getElementById: getElement, body: element(), hidden: true, addEventListener: vi.fn() },
    window: { island: {
      onTabs: (handler: typeof sendTabs) => { sendTabs = handler; },
      onCollapse: (handler: typeof collapse) => { collapse = handler; },
      onPreferences: vi.fn(),
      setExpanded,
      beginAutoCollapse: vi.fn(),
      cancelAutoCollapse: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
    } },
    navigator: {}, setTimeout, clearTimeout, setInterval, clearInterval, performance,
  });
  return {
    tabs: (tabs: Tab[]) => sendTabs(tabs),
    opened: () => island.classList.contains("opened"),
    openManually: () => island.emit("click"),
    hover: () => island.emit("mouseenter"),
    collapse: () => collapse(),
    setExpanded,
  };
}

describe("Island automatic expansion", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("does not expand for a pre-existing stopped session on startup", () => {
    const island = islandHarness();
    island.tabs([tab("stopped")]);
    vi.advanceTimersByTime(1000);
    expect(island.opened()).toBe(false);
  });

  it("does not treat working to unknown as an attention event", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab("unknown")]);
    vi.advanceTimersByTime(1000);
    expect(island.setExpanded).not.toHaveBeenCalled();
  });

  it.each(["working", "unknown"])("ignores a stopped pulse that returns to %s", (next) => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab("stopped")]);
    vi.advanceTimersByTime(750);
    island.tabs([tab(next)]);
    vi.advanceTimersByTime(1000);
    expect(island.setExpanded).not.toHaveBeenCalled();
  });

  it.each(["stopped", "approval"])("opens only after %s remains stable for 1000ms", (state) => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab(state)]);
    vi.advanceTimersByTime(999);
    expect(island.opened()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(island.opened()).toBe(true);
  });

  it("cancels pending expansion when the session closes", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab("stopped")]);
    vi.advanceTimersByTime(100);
    island.tabs([]);
    vi.advanceTimersByTime(1000);
    expect(island.setExpanded).not.toHaveBeenCalled();
  });

  it("keeps the deadline when only prompt metadata changes", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab("stopped")]);
    vi.advanceTimersByTime(300);
    island.tabs([{ ...tab("stopped"), lastPrompt: "Updated task title" }]);
    vi.advanceTimersByTime(700);
    expect(island.opened()).toBe(true);
  });

  it("waits independently for each session, ignoring a later stopped pulse", () => {
    const island = islandHarness();
    island.tabs([tab("working", "first"), tab("working", "second")]);
    island.tabs([tab("stopped", "first"), tab("working", "second")]);
    vi.advanceTimersByTime(950);
    island.tabs([tab("working", "first"), tab("stopped", "second")]);
    vi.advanceTimersByTime(100);
    island.tabs([tab("working", "first"), tab("working", "second")]);
    vi.advanceTimersByTime(1000);
    expect(island.setExpanded).not.toHaveBeenCalled();
  });

  it("recognizes a real stop after a temporary unknown gap", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab("unknown")]);
    island.tabs([tab("stopped")]);
    vi.advanceTimersByTime(1000);
    expect(island.opened()).toBe(true);
  });

  it("restarts confirmation when stopped changes to approval", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab("stopped")]);
    vi.advanceTimersByTime(900);
    island.tabs([tab("approval")]);
    vi.advanceTimersByTime(100);
    expect(island.opened()).toBe(false);
    vi.advanceTimersByTime(900);
    expect(island.opened()).toBe(true);
  });

  it("collapses an automatic panel once only working and unknown remain", () => {
    const island = islandHarness();
    island.tabs([tab("working", "done"), tab("working", "running")]);
    island.tabs([tab("stopped", "done"), tab("working", "running")]);
    vi.advanceTimersByTime(1000);
    expect(island.opened()).toBe(true);
    island.tabs([tab("unknown", "done"), tab("working", "running")]);
    expect(island.opened()).toBe(false);
    vi.advanceTimersByTime(450);
    expect(island.setExpanded).toHaveBeenLastCalledWith(false, 0);
  });

  it("preserves a manually opened panel when sessions are working", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.openManually();
    island.tabs([tab("unknown")]);
    expect(island.opened()).toBe(true);
  });

  it("keeps an automatic panel open after the user hovers to inspect it", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab("stopped")]);
    vi.advanceTimersByTime(1000);
    island.hover();
    island.tabs([tab("working")]);
    expect(island.opened()).toBe(true);
  });

  it("does not reopen a panel dismissed during confirmation", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.tabs([tab("stopped")]);
    island.openManually();
    island.collapse();
    island.tabs([tab("stopped")]);
    vi.advanceTimersByTime(1000);
    expect(island.opened()).toBe(false);
  });

  it("cancels a delayed window shrink when the panel reopens", () => {
    const island = islandHarness();
    island.tabs([tab("working")]);
    island.openManually();
    island.collapse();
    vi.advanceTimersByTime(100);
    island.openManually();
    island.setExpanded.mockClear();
    vi.advanceTimersByTime(500);
    expect(island.opened()).toBe(true);
    expect(island.setExpanded).not.toHaveBeenCalled();
  });
});
