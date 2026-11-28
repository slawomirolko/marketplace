import "../src/home-env.ts";
import path from "node:path";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cspMiddleware, NONCE_PLACEHOLDER } from "../src/csp.ts";
import { FACTORY_DIR, viewerOptions } from "../src/paths.ts";
import { allowedHostsFor, failRequest, viewerHandler } from "../src/viewer-routes.ts";

const DEV_PORT = 5180;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;

/**
 * The dev server answers the API through the same viewer handler as production: host allow-list, POST guard,
 * origin check and the factory config of viewerOptions. Vite serves the page and its modules itself.
 */
function factoryData(): Plugin {
  const dataDir = process.env.FACTORY_DATA_DIR ?? path.join(FACTORY_DIR, ".viewer-data");
  const viewer = viewerHandler({ ...viewerOptions(dataDir), allowedHosts: allowedHostsFor(DEV_URL, DEV_PORT), demo: !process.env.FACTORY_DATA_DIR, serveStatic: false });
  return {
    name: "factory-data",
    configureServer(server) {
      server.middlewares.use(cspMiddleware());
      server.middlewares.use((req, res, next) => {
        try {
          if (!viewer(req, res)) {
            next();
          }
        } catch (error) {
          failRequest(res, error);
        }
      });
      server.httpServer?.once("listening", () => console.log(`  factory data: ${dataDir}`));
    },
  };
}

export default defineConfig(() => ({
  base: "/viewer/",
  plugins: [react(), factoryData()],
  html: { cspNonce: NONCE_PLACEHOLDER },
  server: { host: "127.0.0.1", port: DEV_PORT, strictPort: true, open: true },
}));
