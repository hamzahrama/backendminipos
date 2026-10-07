import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/main.ts"],
      reporter: ["text-summary", "text"],
      thresholds: { lines: 60, statements: 60, functions: 60, branches: 60 },
    },
  },
});
