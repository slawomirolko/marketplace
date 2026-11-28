import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup/setupTests.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/types.ts"],
      reporter: ["text", "lcovonly"],
      thresholds: { lines: 60, statements: 60, functions: 60, branches: 60 },
    },
  },
});
