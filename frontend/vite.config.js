// frontend/vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: {
    host: "0.0.0.0",
    port: 3000,
    open: true,
    fs: { allow: [".."] },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4090",
        changeOrigin: true
      },
      "/socket.io": {
        target: "http://127.0.0.1:4090",
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (err) => {
            // Silently swallow disconnect/abort errors when browser refreshes or server starts up
            if (err.code !== "ECONNRESET" && err.code !== "ECONNABORTED" && err.code !== "ECONNREFUSED") {
              console.warn("[vite ws proxy]", err.message);
            }
          });
        }
      }
    }
  },
  build: { outDir: "dist" }
});
