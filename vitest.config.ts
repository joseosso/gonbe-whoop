import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // Match the `@/*` path alias from tsconfig so tests can import app modules.
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
