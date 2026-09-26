import { defineConfig } from "histoire"
import { HstVue } from "@histoire/plugin-vue"

export default defineConfig({
  plugins: [HstVue()],
  storyMatch: ["stories/src/**/*.story.vue"],
  setupFile: "./stories/src/setup.ts",
  outDir: "stories/dist",
  routerMode: "hash",
  theme: {
    title: "TTT",
    defaultColorScheme: "dark",
    hideColorSchemeSwitch: true,
    colors: {
      gray: { 50: "#f4edf4", 100: "#e7dce9", 200: "#d4c3d9", 300: "#bcaec1", 400: "#9d8ca5", 500: "#796880", 600: "#614e69", 700: "#493a4f", 750: "#382d3e", 800: "#2b2230", 850: "#211922", 900: "#1a1219", 950: "#120c12" },
      primary: { 50: "#effff5", 100: "#d9fbe8", 200: "#b0f3ce", 300: "#8bebbc", 400: "#67e8b1", 500: "#4cbf8c", 600: "#329367", 700: "#276d4e", 800: "#234c3b", 900: "#1c352b", 950: "#13271f" }
    }
  },
  backgroundPresets: [
    { label: "Canvas", color: "#1a1219", contrastColor: "#f4edf4" },
    { label: "Panel", color: "#211922", contrastColor: "#f4edf4" }
  ],
  responsivePresets: [
    { label: "Phone", width: 390, height: 844 },
    { label: "Tablet", width: 1024, height: 768 },
    { label: "Desktop", width: 1600, height: 1050 }
  ],
  vite: { server: { port: 6006, host: "127.0.0.1" } }
})
