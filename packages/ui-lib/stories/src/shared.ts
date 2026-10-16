import { h } from "vue"
import type { PropType, ExtractPropTypes, VNodeChild } from "vue"
import type { ViewerSnapshot } from "./types.ts"
import type { LayoutFile, SettingsFile, ConnectionState  } from "@ttt/ui"
import { AppShell, TTopBar, TEntityTree, TPageHeader, TBadge } from "@ttt/ui"

export const pageProps = {
  snapshot: {
    type: Object as PropType<ViewerSnapshot>, required: true as const,
  }, boardName: {
    type: String, default: "alpha",
  }, entityId: String as PropType<string | undefined>, connectionState: {
    type: String as PropType<ConnectionState>, default: "live",
  }, compact: Boolean, layoutSources: {
    type: Object as PropType<Record<string, string>>, default: () => ({}),
  },
}
export type PageProps = Readonly<ExtractPropTypes<typeof pageProps>>
export const pageEmits = {
  navigate: (_path: string) => true, saveLayout: (_name: string, _value: LayoutFile, _source: string) => true, saveSettings: (_value: SettingsFile) => true, step: () => true,
}
export interface PageEmit {
  (event: "navigate", path: string): void
  (event: "saveLayout", name: string, value: LayoutFile, source: string): void
  (event: "saveSettings", value: SettingsFile): void
  (event: "step"): void
}
export const navigation = [
  {
    id: "boards", label: "Boards", href: "/boards",
  }, {
    id: "agents", label: "Agents", href: "/agents",
  }, {
    id: "sessions", label: "Sessions", href: "/sessions",
  }, {
    id: "layouts", label: "Layouts", href: "/layouts",
  }, {
    id: "activity", label: "Activity", href: "/activity",
  }, {
    id: "projects", label: "Projects", href: "/projects",
  }, {
    id: "diagnostics", label: "Diagnostics", href: "/diagnostics",
  }, {
    id: "settings", label: "Settings", href: "/settings",
  },
]
export const boardFor = (p: PageProps) => p.snapshot.boards.find(b => b.name === p.boardName) || p.snapshot.boards[0]
export const goMessage = (board: string, id: string) => `/messages/${encodeURIComponent(board)}/${encodeURIComponent(id)}`
export const goThread = (board: string, id: string) => `/threads/${encodeURIComponent(board)}/${encodeURIComponent(id)}`
export function boardSidebar(p: PageProps, emit: PageEmit, route = "boards") {
  return h("div", [
    h("h2", "Boards"), h(TEntityTree, {
      nodes: p.snapshot.boards.map(b => ({
        id: b.name, label: b.name, count: Object.keys(b.threads).length,
      })), selected: boardFor(p)?.name, label: "Board contexts", onSelect: (id: string) => { emit("navigate", `/${route}/${id}`) },
    }), h("div", {
      style: {
        marginTop: "28px", padding: "0 10px",
      },
    }, [
      h(TBadge, {
        tone: "lavender", value: "Demo data",
      }), h("p", {
        class: "small dim", style: {
          marginTop: "10px",
        },
      }, "Board names come from session context. Counts represent thread records."),
    ]),
  ])
}
export function shell(p: PageProps, emit: PageEmit, active: string, main: VNodeChild, inspector: VNodeChild, sidebar?: VNodeChild) {
  return h(AppShell, {
    compact: p.compact,
  }, {
    topbar: () => h(TTopBar, {
      active, items: navigation, state: p.connectionState, onNavigate: (path: string) => { emit("navigate", path) },
    }), sidebar: () => sidebar || boardSidebar(p, emit), default: () => main, inspector: () => inspector,
  })
}
export function heading(title: string, subtitle?: string, actions?: () => VNodeChild) {
  return h(TPageHeader, {
    title, subtitle,
  }, actions ? {
    actions,
  } : undefined)
}
export function inspector(title: string, children: VNodeChild[]) {
  return h("div", {
    class: "stack",
  }, [
    h("h2", title), ...children,
  ])
}
export function section(title: string, children: VNodeChild[]) {
  return h("section", {
    class: "stack",
  }, [
    h("h2", title), ...children,
  ])
}
export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([
    content,
  ], {
    type: "application/json;charset=utf-8",
  }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => { URL.revokeObjectURL(url) }, 500)
}
export async function readUpload(event: Event): Promise<{
  name: string
  text: string
} | undefined> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""
  if (!file)
    return
  if (file.size > 2000000)
    throw new Error("File must be smaller than 2 MB")
  return {
    name: file.name, text: await file.text(),
  }
}
