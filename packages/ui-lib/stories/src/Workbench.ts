import { defineComponent, h } from "vue"
import { pageProps, pageEmits } from "./shared.ts"
import { BoardsPage } from "./pages/BoardsPage.ts"
import { ThreadPage } from "./pages/ThreadPage.ts"
import { MessagePage } from "./pages/MessagePage.ts"
import { AgentsPage } from "./pages/AgentsPage.ts"
import { ActivityPage } from "./pages/ActivityPage.ts"
import { SessionsPage } from "./pages/SessionsPage.ts"
import { LayoutsPage } from "./pages/LayoutsPage.ts"
import { DiagnosticsPage } from "./pages/DiagnosticsPage.ts"
import { SettingsPage } from "./pages/SettingsPage.ts"
import { ProjectsPage } from "./pages/ProjectsPage.ts"

export const pages = {
  boards: BoardsPage, threads: ThreadPage, messages: MessagePage, agents: AgentsPage, activity: ActivityPage, sessions: SessionsPage, layouts: LayoutsPage, diagnostics: DiagnosticsPage, settings: SettingsPage, projects: ProjectsPage,
}
export const Workbench = defineComponent({
  name: "Workbench", props: {
    ...pageProps, page: {
      type: String, default: "boards",
    },
  }, emits: pageEmits, setup: (p, { emit }) => () => h(p.page in pages ? pages[p.page as keyof typeof pages] : BoardsPage, {
    ...p, onNavigate: (path: string) => { emit("navigate", path) }, onSaveLayout: (...args: Parameters<typeof pageEmits.saveLayout>) => { emit("saveLayout", ...args) }, onSaveSettings: (...args: Parameters<typeof pageEmits.saveSettings>) => { emit("saveSettings", ...args) }, onStep: () => { emit("step") },
  }),
})
