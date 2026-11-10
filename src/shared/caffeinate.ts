export type CaffeinateMode = "off" | "on" | "auto";

export function normalizeCaffeinateMode(value: unknown, legacyEnabled?: unknown): CaffeinateMode {
  if (value === "off" || value === "on" || value === "auto") return value;
  return legacyEnabled === false ? "off" : "auto";
}

export function isCaffeinateActive(mode: CaffeinateMode, working: boolean): boolean {
  return mode === "on" || (mode === "auto" && working);
}
