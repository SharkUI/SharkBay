import { describe, expect, it } from "vitest";

import { PairStore } from "../src/main/telegram/pairing.js";

function fixedClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("PairStore", () => {
  it("pairs a user with a valid code and invalidates it (one-time)", () => {
    const clock = fixedClock();
    const store = new PairStore({ now: clock.now, generateCode: () => "482913", ttlMs: 1000 });
    store.issueCode();

    const r = store.redeem("482913", { telegramUserId: 1, displayName: "alice" });
    expect(r.ok).toBe(true);
    expect(store.isAuthorized(1)).toBe(true);

    // Code is consumed: a second user cannot reuse it.
    const r2 = store.redeem("482913", { telegramUserId: 2, displayName: "bob" });
    expect(r2).toEqual({ ok: false, reason: "no-active-code" });
  });

  it("rejects a mismatched code", () => {
    const store = new PairStore({ generateCode: () => "111111" });
    store.issueCode();
    expect(store.redeem("999999", { telegramUserId: 1, displayName: "a" })).toEqual({ ok: false, reason: "mismatch" });
    expect(store.isAuthorized(1)).toBe(false);
  });

  it("rejects an expired code", () => {
    const clock = fixedClock();
    const store = new PairStore({ now: clock.now, generateCode: () => "222222", ttlMs: 1000 });
    store.issueCode();
    clock.advance(1001);
    expect(store.redeem("222222", { telegramUserId: 1, displayName: "a" })).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects when no code is active", () => {
    const store = new PairStore();
    expect(store.redeem("000000", { telegramUserId: 1, displayName: "a" })).toEqual({ ok: false, reason: "no-active-code" });
  });

  it("does not re-pair an already paired user", () => {
    const store = new PairStore({ generateCode: () => "333333" });
    store.issueCode();
    store.redeem("333333", { telegramUserId: 1, displayName: "a" });
    store.issueCode();
    expect(store.redeem("333333", { telegramUserId: 1, displayName: "a" })).toEqual({ ok: false, reason: "already-paired" });
  });

  it("revokes a user, making access immediately invalid", () => {
    const store = new PairStore({ generateCode: () => "444444" });
    store.issueCode();
    store.redeem("444444", { telegramUserId: 7, displayName: "a" });
    expect(store.revoke(7)).toBe(true);
    expect(store.isAuthorized(7)).toBe(false);
  });

  it("records github id and pairedAt, and lists users", () => {
    const clock = fixedClock(0);
    const store = new PairStore({ now: clock.now, generateCode: () => "555555" });
    store.issueCode();
    store.redeem("555555", { telegramUserId: 9, displayName: "alice", githubUserId: "3960864" });
    const [u] = store.list();
    expect(u).toMatchObject({ telegramUserId: 9, displayName: "alice", githubUserId: "3960864", pairedAt: "1970-01-01T00:00:00.000Z" });
  });

  it("seeds from initial users", () => {
    const store = new PairStore({ initialUsers: [{ telegramUserId: 5, displayName: "x", pairedAt: "2026-01-01T00:00:00Z" }] });
    expect(store.isAuthorized(5)).toBe(true);
  });
});
