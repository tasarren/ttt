import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath } from "node:url"

const source = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: "@ttt/ui/styles.css", replacement: source("./src/styles/index.css") },
      { find: "@ttt/ui", replacement: source("./src/index.ts") },
    ],
    dedupe: ["vue"],
  },
})
