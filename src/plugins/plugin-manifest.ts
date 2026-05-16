import { promises as fs } from "node:fs";
import type { PluginCapabilityRequest, SharkBayPluginManifest } from "../shared/types.js";

export async function readPluginManifest(filePath: string): Promise<SharkBayPluginManifest> {
  const raw = await fs.readFile(filePath, "utf8");
  return parsePluginManifest(JSON.parse(raw));
}

export function parsePluginManifest(value: unknown): SharkBayPluginManifest {
  if (!isRecord(value)) throw new Error("Plugin manifest must be an object");
  const id = readRequiredString(value, "id");
  const name = readRequiredString(value, "name");
  const version = readRequiredString(value, "version");
  const publisher = readRequiredString(value, "publisher");
  const engines = readRecord(value, "engines");
  const sharkbay = readRequiredString(engines, "sharkbay");
  const main = readOptionalString(value, "main");
  const capabilities = readCapabilities(value.capabilities);
  return {
    id,
    name,
    version,
    publisher,
    engines: { sharkbay },
    ...(main ? { main } : {}),
    ...(capabilities.length ? { capabilities } : {}),
    ...(isRecord(value.contributes) ? { contributes: value.contributes as SharkBayPluginManifest["contributes"] } : {}),
  };
}

function readCapabilities(value: unknown): PluginCapabilityRequest[] {
  if (!Array.isArray(value)) return [];
  const capabilities: PluginCapabilityRequest[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (item.kind === "profile:machine") capabilities.push({ kind: "profile:machine" });
    else if (item.kind === "profile:project") capabilities.push({ kind: "profile:project" });
    else if (item.kind === "agent:detect") capabilities.push({ kind: "agent:detect" });
    else if (item.kind === "install:software") capabilities.push({ kind: "install:software", requiresConfirmation: true });
    if (item.kind === "command:run") {
      const scope = item.scope === "local" ? "local" : "target";
      capabilities.push({ kind: "command:run", scope });
    }
    if (item.kind === "file:read") {
      const patterns = Array.isArray(item.patterns)
        ? item.patterns.filter((pattern): pattern is string => typeof pattern === "string")
        : undefined;
      capabilities.push({ kind: "file:read", ...(patterns?.length ? { patterns } : {}) });
    }
  }
  return capabilities;
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Plugin manifest field "${key}" is required`);
  }
  return value.trim();
}

function readOptionalString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) {
    throw new Error(`Plugin manifest field "${key}" must be an object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
