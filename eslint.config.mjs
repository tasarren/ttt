import js from "@eslint/js"
import stylistic from "@stylistic/eslint-plugin"
import { defineConfig } from "eslint/config"
import importX from "eslint-plugin-import-x"
import unusedImports from "eslint-plugin-unused-imports"
import globals from "globals"
import tseslint from "typescript-eslint"
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript"

const tsFiles = ["**/*.ts", "**/*.mts", "**/*.cts"]
const typedTypeScriptConfigs = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: tsFiles,
}))

const sharedRules = {
  "@stylistic/array-bracket-spacing": ["error", "never"],
  "@stylistic/comma-dangle": ["error", "always-multiline"],
  "@stylistic/eol-last": ["error", "always"],
  "@stylistic/indent": ["error", 2],
  "@stylistic/key-spacing": "error",
  "@stylistic/keyword-spacing": "error",
  "@stylistic/no-extra-semi": "error",
  "@stylistic/no-trailing-spaces": "error",
  "@stylistic/object-curly-spacing": ["error", "always"],
  "@stylistic/quotes": ["error", "double"],
  "@stylistic/semi": ["error", "never"],
  "@stylistic/space-before-blocks": "error",
  "@stylistic/space-before-function-paren": ["error", "never"],
  "@stylistic/space-infix-ops": "error",
  "@typescript-eslint/no-invalid-void-type": "off",
  "@typescript-eslint/no-non-null-assertion": "off",
  "@typescript-eslint/no-unnecessary-type-parameters": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/preserve-caught-error": "off",
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/restrict-template-expressions": ["error", { "allowNumber": true }],
  "import-x/first": "error",
  "import-x/newline-after-import": "error",
  "import-x/no-duplicates": "error",
  "import-x/no-relative-packages": "error",
  "import-x/no-self-import": "error",
  "import-x/no-useless-path-segments": "error",
  "no-console": "error",
  "no-unused-vars": "off",
  "unused-imports/no-unused-imports": "error",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      "argsIgnorePattern": "^_",
      "caughtErrorsIgnorePattern": "^_",
      "varsIgnorePattern": "^_",
    },
  ],
  "no-restricted-imports": [
    "error",
    {
      "patterns": [
        {
          "message": "Use bare workspace aliases for cross-package imports.",
          "regex": "^\\.\\.(?:/\\.\\.)*/packages/",
        },
        {
          "message": "Use package public exports instead of deep workspace imports.",
          "regex": "^@ttt/[^/]+/.+",
        },
      ],
    },
  ],
}

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      ".orchestrator/**",
      "**/docs/**",
    ],
  },
  js.configs.recommended,
  ...typedTypeScriptConfigs,
  {
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: tsFiles,
    languageOptions: {
      globals: globals.node,
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        }),
      ],
    },
    plugins: {
      "@stylistic": stylistic,
      "@typescript-eslint": tseslint.plugin,
      "import-x": importX,
      "unused-imports": unusedImports,
    },
    rules: sharedRules,
  },
  {
    // node:test's test() returns a promise by design; awaiting it would serialize the suite.
    files: ["**/tests/**/*.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
)
