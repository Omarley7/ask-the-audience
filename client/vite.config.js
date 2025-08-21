import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");

  return {
    plugins: [react()],
    envDir: "..",
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: `http://localhost:${env.SERVER_PORT}`,
          changeOrigin: true,
        },
      },
    },
  };
});
