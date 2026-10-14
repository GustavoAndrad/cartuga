import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: {
      // Docker Desktop's bind-mount on Windows/Mac doesn't reliably forward native
      // filesystem change events into the container, so Vite's default chokidar
      // watcher silently misses edits. Polling is slower but actually detects them.
      usePolling: true,
      interval: 300,
    },
  },
});
