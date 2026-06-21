import { defineWorkspace } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two projects: pure schema/validation logic (node) and React render tests (jsdom).
export default defineWorkspace([
  {
    test: {
      name: "shared",
      environment: "node",
      include: ["packages/shared/src/**/*.test.ts"],
    },
  },
  {
    plugins: [react()],
    test: {
      name: "web",
      environment: "jsdom",
      include: ["apps/web/src/**/*.test.{ts,tsx}"],
      setupFiles: ["apps/web/vitest.setup.ts"],
    },
  },
]);
