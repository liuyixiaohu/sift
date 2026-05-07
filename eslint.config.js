// ESLint flat config for Sift.
// Permissive baseline — passes the existing codebase as-is so CI doesn't
// turn into a source-rewriting exercise. Tighten rule-by-rule over time.

import js from "@eslint/js";
import globals from "globals";

export default [
  // Bundled output, vendored deps, and node_modules are ignored everywhere.
  {
    ignores: ["content.js", "feed.js", "popup.js", "background.js", "node_modules/**", "*.min.js"],
  },
  // Source code (browser content scripts + service worker)
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // The codebase has documented intentional silent fallthrough in three
      // places (URL.parse on bad URLs, cross-origin iframe access). Allow
      // empty catch blocks; require empty function bodies to be flagged.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Allow unused parameters and prefixed-underscore variables.
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  // Build script + config files (Node, ESM)
  {
    files: ["build.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules },
  },
  // Tests (vitest globals + node)
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off",
    },
  },
];
