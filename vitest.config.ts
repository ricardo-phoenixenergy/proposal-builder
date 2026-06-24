import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      include: [
        "packages/shared/src/**/*.ts",
        "apps/web/src/**/*.{ts,tsx}",
        "apps/web/app/**/*.{ts,tsx}",
      ],
      exclude: ["**/*.test.*", "**/__tests__/**", "**/*.d.ts"],
      // No thresholds yet — reporting only. Add a ratchet (e.g. lines: 70) in a later phase.
    },
  },
});
