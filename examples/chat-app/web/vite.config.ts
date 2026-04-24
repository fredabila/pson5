import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Backend port (override via PORT in .env).
const BACKEND_PORT = process.env.PORT ?? "3030";

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: resolve(__dirname, "public"),
  server: {
    port: 5173,
    strictPort: true,
    // Proxy API + SSE calls to the backend during dev so the browser can
    // keep talking to one origin. `changeOrigin` avoids CORS complications.
    proxy: {
      "/api": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        // SSE needs the connection held open — turn off proxy buffering.
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
