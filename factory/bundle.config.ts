import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: { stdio: "src/stdio.ts", "viewer-server": "src/viewer-server.ts", "install-opencode": "src/install-opencode.ts" },
      output: { format: "es", entryFileNames: "[name].mjs", chunkFileNames: "[name].mjs" },
    },
  },
  ssr: { noExternal: true, target: "node" },
});
