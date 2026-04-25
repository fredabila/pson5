import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_PORT = process.env.PORT ?? "3031";

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: resolve(__dirname, "public"),
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        ws: false
      }
    }
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: true
  }
});
