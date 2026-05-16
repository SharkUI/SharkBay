import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const keychainService = "SharkBay";

export type SecretStore = {
  get(id: string): Promise<string | null>;
  set(id: string, value: string): Promise<void>;
  delete(id: string): Promise<void>;
};

export function createDefaultSecretStore(): SecretStore {
  return new MacOsKeychainSecretStore();
}

export class MacOsKeychainSecretStore implements SecretStore {
  async get(id: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("security", ["find-generic-password", "-a", id, "-s", keychainService, "-w"], {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });
      return stdout.replace(/\r?\n$/, "");
    } catch (error) {
      if (isSecurityItemNotFound(error)) return null;
      throw error;
    }
  }

  async set(id: string, value: string): Promise<void> {
    await execFileAsync("security", ["add-generic-password", "-a", id, "-s", keychainService, "-w", value, "-U"], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
  }

  async delete(id: string): Promise<void> {
    try {
      await execFileAsync("security", ["delete-generic-password", "-a", id, "-s", keychainService], {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      if (!isSecurityItemNotFound(error)) throw error;
    }
  }
}

function isSecurityItemNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; stderr?: unknown };
  return candidate.code === 44 || String(candidate.stderr ?? "").includes("could not be found");
}
