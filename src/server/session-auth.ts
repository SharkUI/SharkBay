import { randomBytes } from "node:crypto";
import { ApplicationError } from "../shared/application-api.js";

const sessionLifetime = 8 * 60 * 60 * 1000;
const grantLifetime = 5 * 60 * 1000;
export class SessionAuth {
  private readonly grants = new Map<string, number>();
  private readonly sessions = new Map<string, number>();
  private readonly exchanges = new Map<string, { count: number; reset: number }>();
  issueGrant(): string {
    this.prune();
    const token = randomBytes(32).toString("base64url");
    this.grants.set(token, Date.now() + grantLifetime);
    return token;
  }
  exchange(token: unknown, address: string): string {
    const now = Date.now();
    const rate = this.exchanges.get(address);
    const attempt = rate && rate.reset > now ? rate : { count: 0, reset: now + 60000 };
    this.exchanges.set(address, attempt);
    if (++attempt.count > 10) throw new ApplicationError("RATE_LIMITED", "Too many connection attempts", 429);
    this.prune();
    if (typeof token !== "string" || token.length > 128 || !this.grants.has(token)) throw new ApplicationError("INVALID_GRANT", "Connection link has expired or was already used", 401);
    this.grants.delete(token);
    const session = randomBytes(32).toString("base64url");
    this.sessions.set(session, now + sessionLifetime);
    return session;
  }
  authenticate(cookie: string | undefined): string {
    this.prune();
    const value = cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("sharkbay_session="))?.slice("sharkbay_session=".length);
    if (!value || !this.sessions.has(value)) throw new ApplicationError("UNAUTHORIZED", "Open a fresh connection link from the running host", 401);
    return value;
  }
  revokeAll(): void { this.sessions.clear(); this.grants.clear(); }
  private prune(): void {
    const now = Date.now();
    for (const [key, expires] of this.grants) if (expires <= now) this.grants.delete(key);
    for (const [key, expires] of this.sessions) if (expires <= now) this.sessions.delete(key);
    for (const [key, rate] of this.exchanges) if (rate.reset <= now) this.exchanges.delete(key);
  }
}
