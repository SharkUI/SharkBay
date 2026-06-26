import { describe, expect, it } from "vitest";

import {
  chunkMessage,
  parseSelection,
  relativeTime,
  renderSessionsList,
  sessionButtonLabel,
  statusBadge,
  TELEGRAM_MAX_MESSAGE,
} from "../src/main/telegram/render.js";
import type { TelegramSessionRow } from "../src/main/telegram/types.js";

function row(over: Partial<TelegramSessionRow> = {}): TelegramSessionRow {
  return {
    sessionId: "sess-1",
    projectPath: "/p/SharkBay",
    cwdUri: "local:/p/SharkBay",
    projectName: "SharkBay",
    agentId: "Kiro",
    model: "opus-4.8",
    title: "修复终端标题刷新",
    subtitle: null,
    lastEventAt: "2026-06-26T06:00:00Z",
    state: "working",
    ...over,
  };
}

describe("statusBadge", () => {
  it("maps states to badges", () => {
    expect(statusBadge("working")).toBe("🟢");
    expect(statusBadge("stopped")).toBe("🟡");
    expect(statusBadge("approval")).toBe("🔴");
    expect(statusBadge(null)).toBe("⚪");
  });
});

describe("relativeTime", () => {
  it("renders coarse buckets", () => {
    const now = Date.parse("2026-06-26T06:00:00Z");
    expect(relativeTime("2026-06-26T05:59:30Z", now)).toBe("30 秒前");
    expect(relativeTime("2026-06-26T05:57:00Z", now)).toBe("3 分钟前");
    expect(relativeTime("2026-06-26T05:00:00Z", now)).toBe("1 小时前");
    expect(relativeTime("2026-06-24T06:00:00Z", now)).toBe("2 天前");
  });
});

describe("sessionButtonLabel", () => {
  it("packs index, badge, project, agent/model and title into one line", () => {
    expect(sessionButtonLabel(1, row())).toBe("1. 🟢 SharkBay · Kiro/opus-4.8 · 修复终端标题刷新");
  });

  it("omits model when null", () => {
    expect(sessionButtonLabel(2, row({ model: null, title: "做调研" }))).toBe("2. 🟢 SharkBay · Kiro · 做调研");
  });

  it("truncates overly long labels with an ellipsis", () => {
    const label = sessionButtonLabel(1, row({ title: "x".repeat(200) }));
    expect(label.length).toBeLessThanOrEqual(50);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("renderSessionsList", () => {
  it("includes header, buttons, refresh, and footer", () => {
    const { text, buttons } = renderSessionsList([row(), row({ sessionId: "sess-2", projectName: "api", state: "approval" })], 14);
    expect(text).toContain("最近会话（共 14，显示 2）");
    expect(text).toContain("直接回复数字序号");
    expect(buttons.map((b) => b.callbackData)).toEqual(["use:sess-1", "use:sess-2", "sessions:refresh"]);
  });

  it("handles empty list", () => {
    expect(renderSessionsList([], 0)).toEqual({ text: "这台机器暂无 agent 会话记录。", buttons: [] });
  });
});

describe("parseSelection", () => {
  const rows = [row({ sessionId: "a" }), row({ sessionId: "b" }), row({ sessionId: "c" })];
  it("parses numeric reply (1-based)", () => {
    expect(parseSelection("2", rows)).toBe("b");
  });
  it("parses button callback", () => {
    expect(parseSelection("use:c", rows)).toBe("c");
  });
  it("rejects out-of-range and unknown", () => {
    expect(parseSelection("9", rows)).toBeNull();
    expect(parseSelection("use:zzz", rows)).toBeNull();
    expect(parseSelection("hello", rows)).toBeNull();
  });
});

describe("chunkMessage", () => {
  it("returns single chunk under the limit", () => {
    expect(chunkMessage("short")).toEqual(["short"]);
  });
  it("splits on line boundaries", () => {
    const line = "x".repeat(2000);
    const chunks = chunkMessage([line, line, line].join("\n"));
    expect(chunks.length).toBe(2);
    expect(chunks.every((c) => c.length <= TELEGRAM_MAX_MESSAGE)).toBe(true);
  });
  it("hard-splits an over-long single line", () => {
    const chunks = chunkMessage("y".repeat(5000));
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.length).toBe(TELEGRAM_MAX_MESSAGE);
  });
});
