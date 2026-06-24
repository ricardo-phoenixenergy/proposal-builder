import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default tseslint.config(
  // 0. Never lint build output, deps, generated, or config files.
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.config.{js,mjs,ts}",
      "**/*.d.ts",
    ],
  },

  // 1. Baseline (no type info needed) — applies to all TS/TSX incl. tests.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 2. Type-checked rules — SOURCE ONLY (tests excluded; they live in a separate tsconfig).
  //    This is where the high-value bug-catchers live (floating/misused promises).
  {
    files: [
      "packages/shared/src/**/*.ts",
      "apps/web/src/**/*.{ts,tsx}",
      "apps/web/app/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/__tests__/**"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // In-memory repo implements async interface methods without real I/O;
      // removing async would break the Repository contract. Downgrade to warn.
      "@typescript-eslint/require-await": "warn",
    },
  },

  // 3. React / Next rules for the web app.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // 4. Project-wide rule tuning (keep CI green on adoption; tighten later).
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // 5. Tests: relax (Node globals; allow the project's test casts).
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**", "**/vitest.setup.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },

  // 6. Node scripts (plain .mjs in apps/web/scripts) — Node globals, no DOM.
  {
    files: ["apps/web/scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
);
