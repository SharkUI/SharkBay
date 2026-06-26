/**
 * Pairing codes and authorized-user whitelist (spec needs R-2).
 *
 * A single one-time pair code is active at a time, with a TTL. Redeeming it adds
 * the Telegram user to the whitelist and invalidates the code. Only whitelisted
 * users may use the bot (apart from `/start` and `/pair`). Pure/deterministic:
 * clock and RNG are injected for testing.
 */

import type { PairedUser } from "./types.js";

export const DEFAULT_PAIR_CODE_TTL_MS = 10 * 60 * 1000;

export type PairCode = { code: string; expiresAt: number };

export type RedeemResult =
  | { ok: true; user: PairedUser }
  | { ok: false; reason: "no-active-code" | "expired" | "mismatch" | "already-paired" };

export type PairStoreOptions = {
  now?: () => number;
  /** Returns a fresh code string. Defaults to a 6-digit numeric code. */
  generateCode?: () => string;
  ttlMs?: number;
  initialUsers?: PairedUser[];
};

export class PairStore {
  private now: () => number;
  private generateCode: () => string;
  private ttlMs: number;
  private active: PairCode | null = null;
  private users = new Map<number, PairedUser>();

  constructor(options: PairStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.generateCode = options.generateCode ?? defaultGenerateCode;
    this.ttlMs = options.ttlMs ?? DEFAULT_PAIR_CODE_TTL_MS;
    for (const user of options.initialUsers ?? []) this.users.set(user.telegramUserId, user);
  }

  /** Create (or replace) the active one-time pair code. */
  issueCode(): PairCode {
    const code = this.generateCode();
    this.active = { code, expiresAt: this.now() + this.ttlMs };
    return this.active;
  }

  isAuthorized(telegramUserId: number): boolean {
    return this.users.has(telegramUserId);
  }

  redeem(input: string, user: { telegramUserId: number; displayName: string; githubUserId?: string }): RedeemResult {
    if (this.users.has(user.telegramUserId)) return { ok: false, reason: "already-paired" };
    if (!this.active) return { ok: false, reason: "no-active-code" };
    if (this.now() > this.active.expiresAt) {
      this.active = null;
      return { ok: false, reason: "expired" };
    }
    if (input.trim() !== this.active.code) return { ok: false, reason: "mismatch" };

    const paired: PairedUser = {
      telegramUserId: user.telegramUserId,
      displayName: user.displayName,
      githubUserId: user.githubUserId,
      pairedAt: new Date(this.now()).toISOString(),
    };
    this.users.set(paired.telegramUserId, paired);
    this.active = null; // one-time
    return { ok: true, user: paired };
  }

  revoke(telegramUserId: number): boolean {
    return this.users.delete(telegramUserId);
  }

  list(): PairedUser[] {
    return [...this.users.values()].sort((a, b) => a.pairedAt.localeCompare(b.pairedAt));
  }

  get(telegramUserId: number): PairedUser | null {
    return this.users.get(telegramUserId) ?? null;
  }
}

function defaultGenerateCode(): string {
  // 6-digit numeric, zero-padded.
  return Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
}
