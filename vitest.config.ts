import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    typecheck: {
      enabled: false,
    },
  },
  // Inline transform settings since the package has no tsconfig.json.
  // Vitest 4.x uses oxc for TypeScript transform by default.
  oxc: {
    target: "es2022",
  },
});
