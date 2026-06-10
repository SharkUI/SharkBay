import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
      }
    }
  },
  clearScreen: false
});
