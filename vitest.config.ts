import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/web-runtime-integration.test.ts", "tests/terminal.test.ts", "tests/harness.test.ts", "tests/agent-clis.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { hooks: "stack" },
    coverage: {
      reporter: ["text", "html"],
      reportsDirectory: "coverage"
    }
  }
});
