import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostFolderPicker } from "../src/renderer/host-folder-picker";
import type { HostDirectoryListing } from "../src/shared/application-api.js";

let tree: ReactTestRenderer;
afterEach(() => { act(() => tree?.unmount()); });
const listing: HostDirectoryListing = { path: "/host", parentPath: "/", directories: [{ name: "project", path: "/host/project" }] };
const button = (label: string) => tree.root.findAllByType("button").find((entry) => entry.children.join("") === label)!;
const go = async (directory: string) => {
  await act(async () => { tree.root.findByType("input").props.onChange({ target: { value: directory } }); });
  await act(async () => { tree.root.findByType("form").props.onSubmit({ preventDefault() {} }); });
};

describe("host folder selection", () => {
  it("requires a successfully loaded path before selecting and allows retry after a failed path", async () => {
    const load = vi.fn(async () => listing);
    const select = vi.fn(), back = vi.fn();
    await act(async () => { tree = create(<HostFolderPicker load={load} purpose="local" busy={false} onSelect={select} onCancel={back} />); });
    act(() => tree.root.findByType("input").props.onChange({ target: { value: "/missing" } }));
    expect(button("Add Project").props.disabled).toBe(true);
    load.mockRejectedValueOnce(new Error("Folder unavailable"));
    await go("/missing");
    expect(tree.root.findByProps({ role: "alert" }).children).toEqual(["Folder unavailable"]);
    expect(button("Add Project").props.disabled).toBe(true);
    load.mockResolvedValueOnce({ ...listing, path: "/missing" });
    await go("/missing");
    expect(button("Add Project").props.disabled).toBe(false);
    act(() => button("Add Project").props.onClick());
    expect(select).toHaveBeenCalledWith("/missing");
    act(() => button("Cancel").props.onClick());
    expect(back).toHaveBeenCalledOnce();
  });

  it("ignores a stale response after a new load and disables navigation while cloning", async () => {
    let finish!: (value: HostDirectoryListing) => void;
    const oldLoad = vi.fn(() => new Promise<HostDirectoryListing>(resolve => { finish = resolve; }));
    const load = vi.fn(async () => listing), select = vi.fn(), back = vi.fn();
    await act(async () => { tree = create(<HostFolderPicker load={oldLoad} purpose="remote" busy={false} onSelect={select} onCancel={back} />); });
    expect(button("Clone Here").props.disabled).toBe(true);
    await act(async () => { tree.update(<HostFolderPicker load={load} purpose="remote" busy={false} onSelect={select} onCancel={back} />); });
    await act(async () => { finish({ ...listing, path: "/stale" }); });
    expect(tree.root.findByType("input").props.value).toBe("/host");
    act(() => button("Clone Here").props.onClick());
    expect(select).toHaveBeenCalledWith("/host");
    act(() => tree.update(<HostFolderPicker load={load} purpose="remote" busy onSelect={select} onCancel={back} />));
    expect(tree.root.findAllByType("button").every((entry) => entry.props.disabled)).toBe(true);
  });
});
