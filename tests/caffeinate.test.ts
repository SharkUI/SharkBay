import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaffeinateController } from "../src/main/caffeinate.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

function mockChild() {
  return Object.assign(new EventEmitter(), { kill: vi.fn() });
}

function spawnChild(child: ReturnType<typeof mockChild>) {
  vi.mocked(spawn).mockReturnValueOnce(child as unknown as ReturnType<typeof spawn>);
}

describe("CaffeinateController", () => {
  beforeEach(() => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    vi.mocked(spawn).mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("starts one parent-bound assertion and releases it when work stops", async () => {
    const controller = new CaffeinateController();
    const child = mockChild();
    spawnChild(child);
    await controller.setActive(false);
    expect(spawn).not.toHaveBeenCalled();
    const started = controller.setActive(true);
    await controller.setActive(true);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("/usr/bin/caffeinate", ["-di", "-w", String(process.pid)], { stdio: "ignore" });
    child.emit("spawn");
    await started;
    await controller.setActive(false);
    await controller.setActive(false);
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it("does not let an old process exit clear a new assertion", async () => {
    const controller = new CaffeinateController();
    const oldChild = mockChild();
    const newChild = mockChild();
    spawnChild(oldChild);
    const first = controller.setActive(true);
    oldChild.emit("spawn");
    await first;
    await controller.setActive(false);
    spawnChild(newChild);
    const second = controller.setActive(true);
    newChild.emit("spawn");
    await second;
    oldChild.emit("exit", 0);
    await controller.setActive(true);
    expect(spawn).toHaveBeenCalledTimes(2);
    await controller.setActive(false);
    expect(newChild.kill).toHaveBeenCalledTimes(1);
  });

  it("reports spawn failure and allows a later activation to retry", async () => {
    const controller = new CaffeinateController();
    const child = mockChild();
    spawnChild(child);
    const failed = controller.setActive(true);
    child.emit("error", new Error("Cannot start caffeinate"));
    await expect(failed).rejects.toThrow("Cannot start caffeinate");
    const retry = mockChild();
    spawnChild(retry);
    const started = controller.setActive(true);
    retry.emit("spawn");
    await started;
    expect(spawn).toHaveBeenCalledTimes(2);
    await controller.setActive(false);
  });

  it("does not spawn a macOS command on other platforms", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    await new CaffeinateController().setActive(true);
    expect(spawn).not.toHaveBeenCalled();
  });
});
