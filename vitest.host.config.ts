import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

export default defineConfig({
  ...base,
  test: { ...base.test, include: ["tests/terminal.test.ts", "tests/harness.test.ts", "tests/agent-clis.test.ts"], exclude: [] },
});
