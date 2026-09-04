import { defineConfig } from "tsdown"

// One self-contained file: the workspace packages and jsonc-parser are inlined.
export default defineConfig({
  entry: ["src/ttt.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  dts: false,
  deps: { alwaysBundle: [/^@ttt\//, "jsonc-parser"], onlyBundle: false },
  // jsonc-parser ships a UMD `main` whose inner requires cannot be inlined; its `module` build can.
  inputOptions: { resolve: { mainFields: ["module", "main"] } },
})
