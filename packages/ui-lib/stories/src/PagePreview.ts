import { cloneData } from "@ttt/ui"
import { defineComponent, h, ref } from "vue"
import type { ViewerSnapshot } from "./types.ts"
import type { LayoutFile, SettingsFile } from "@ttt/ui"
import { Workbench } from "./Workbench.ts"
import seed from "../../fixtures/snapshot.json"

export const PagePreview = defineComponent({
  name: "PagePreview", props: {
    page: {
      type: String, default: "boards",
    },
  }, setup(p) {
    const sample = ref(cloneData(seed) as ViewerSnapshot)
    const route = ref(`/${p.page}/alpha`)
    const first = sample.value.boards[0]!.messages[0]!.messageId
    return () => {
      const [page = "boards", board = "alpha", id] = route.value.split("/").filter(Boolean)
      return h(Workbench, {
        page, boardName: board, entityId: id || ([
          "threads", "messages",
        ].includes(page) ? first : ""), snapshot: sample.value, connectionState: "disconnected", onNavigate: (path: string) => {
          route.value = path
        }, onSaveLayout: (name: string, value: LayoutFile) => {
          sample.value = {
            ...sample.value, layouts: {
              ...sample.value.layouts, [name]: value,
            },
          }
        }, onSaveSettings: (settings: SettingsFile) => {
          sample.value = {
            ...sample.value, settings,
          }
        }, onStep: () => {
          const board = sample.value.boards[0]!
          const now = new Date()
          const id = `ttt-${now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}-${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}`
          const msg = {
            ...board.messages[1]!, messageId: id, timestamp: now.toISOString(), body: "A locally simulated agent reply. Histoire is not connected to a live TTT backend.",
          }
          sample.value = {
            ...sample.value, boards: sample.value.boards.map((b, i) => i ? b : {
              ...b, messages: [
                ...b.messages, msg,
              ], threads: {
                ...b.threads, [msg.threadId]: [
                  ...(b.threads[msg.threadId] ?? []), id,
                ],
              },
            }),
          }
        },
      })
    }
  },
})
