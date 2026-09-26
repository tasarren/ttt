import { defineConfig } from "vite"
import { fileURLToPath } from "node:url"

export default defineConfig({
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  resolve: { alias: [
    { find: "@ttt/ui/styles.css", replacement: fileURLToPath(new URL("../ui-lib/src/styles/index.css", import.meta.url)) },
    { find: "@ttt/ui", replacement: fileURLToPath(new URL("../ui-lib/src/index.ts", import.meta.url)) },
  ] },
  build: { outDir: "dist/client", emptyOutDir: true },
})
