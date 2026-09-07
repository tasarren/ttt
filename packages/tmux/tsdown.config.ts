import { defineConfig } from "tsdown"

// Standalone library: ESM plus declarations, nothing bundled in (the package has no dependencies).
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  dts: true,
})
