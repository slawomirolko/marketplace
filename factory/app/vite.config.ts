import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cspMiddleware, NONCE_PLACEHOLDER } from "./csp.ts";
import { apiMiddleware, createDataApi } from "./data.ts";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const factoryDir = path.join(appDir, "..");

function factoryData(): Plugin {
  const api = createDataApi({
    factoryDir,
    dataDir: process.env.FACTORY_DATA_DIR ?? path.join(factoryDir, ".viewer-data"),
    configFile: process.env.FACTORY_CONFIG ?? path.join(factoryDir, "spec", "examples", "valid", "factory-config.json"),
    demo: !process.env.FACTORY_DATA_DIR,
  });
  return {
    name: "factory-data",
    configureServer(server) {
      server.middlewares.use(cspMiddleware());
      server.middlewares.use(apiMiddleware(api));
      server.httpServer?.once("listening", () => console.log(`  factory data: ${api.dataDir}`));
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/viewer/" : "/",
  plugins: [react(), factoryData()],
  html: { cspNonce: NONCE_PLACEHOLDER },
  server: { host: "127.0.0.1", port: 5180, open: true },
}));
