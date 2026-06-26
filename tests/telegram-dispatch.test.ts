import { describe, expect, it } from "vitest";

import { dispatchMessage } from "../src/main/telegram/dispatch.js";

describe("dispatchMessage", () => {
  it("routes plain text to the agent", () => {
    expect(dispatchMessage("修复终端标题刷新")).toEqual({ kind: "agent", text: "修复终端标题刷新" });
  });

  it("routes // passthrough to the agent dropping exactly one slash", () => {
    expect(dispatchMessage("//compact")).toEqual({ kind: "agent", text: "/compact" });
    expect(dispatchMessage("//model gpt-5")).toEqual({ kind: "agent", text: "/model gpt-5" });
  });

  it("keeps a single leading slash for known bot commands with args", () => {
    expect(dispatchMessage("/sessions")).toEqual({ kind: "bot", command: "sessions", args: "" });
    expect(dispatchMessage("/pair 482913")).toEqual({ kind: "bot", command: "pair", args: "482913" });
  });

  it("resolves bot command even with a group mention suffix", () => {
    expect(dispatchMessage("/sessions@my_bot 5")).toEqual({ kind: "bot", command: "sessions", args: "5" });
  });

  it("rejects an unknown single-slash command instead of forwarding it", () => {
    expect(dispatchMessage("/stp")).toEqual({ kind: "unknownCommand", raw: "/stp" });
    expect(dispatchMessage("/Users/shark/x")).toEqual({ kind: "unknownCommand", raw: "/Users/shark/x" });
  });

  it("treats `//` alone as agent receiving a single slash", () => {
    expect(dispatchMessage("//")).toEqual({ kind: "agent", text: "/" });
  });

  it("does not trigger passthrough on mid-message double slash", () => {
    expect(dispatchMessage("see https://example.com")).toEqual({ kind: "agent", text: "see https://example.com" });
  });

  it("trims leading whitespace before classifying", () => {
    expect(dispatchMessage("  /stop")).toEqual({ kind: "bot", command: "stop", args: "" });
  });

  it("bot command name is case-insensitive", () => {
    expect(dispatchMessage("/HELP")).toEqual({ kind: "bot", command: "help", args: "" });
  });
});
