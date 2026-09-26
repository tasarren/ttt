import { createSSRApp, defineComponent, h, ref, computed, onMounted, onBeforeUnmount, watch } from "vue"
import type { PropType } from "vue"
import { createPinia, defineStore } from "pinia"
import { createRouter, createMemoryHistory, createWebHistory, RouterView, useRoute, useRouter, onBeforeRouteUpdate } from "vue-router"
import { AppShell, TTopBar, TButton, TNotice, TEntityTree, SessionTree, PaneInspector, PaneTable, TInspector, TSourceViewer, TDisclosure, ThreadList, ThreadReader, MessageCard, ReceiptTable, LayoutEditor, SettingsForm, DoctorReport, TSearch, TCheckbox, TSelect, TTabs, MailboxSummary, WaitingPresence, ActivityTimeline, timeline, groupProjects, TSurface, receiptStates } from "@ttt/ui"
import type { LayoutFile, SettingsFile } from "@ttt/ui"
import type { WebState, ActionRequest, SourceDocument } from "./protocol.ts"
import { LiveWindow } from "./terminal.ts"
import { responseError, isWebState, boardViews } from "./protocol.ts"

const nav = [
  { id: "boards", label: "Boards", href: "/boards" },
  { id: "agents", label: "Agents", href: "/agents" },
  { id: "sessions", label: "Sessions", href: "/sessions" },
  { id: "layouts", label: "Layouts", href: "/layouts" },
  { id: "activity", label: "Activity", href: "/activity" },
  { id: "projects", label: "Projects", href: "/projects" },
  { id: "diagnostics", label: "Diagnostics", href: "/diagnostics" },
  { id: "settings", label: "Settings", href: "/settings" },
]
const routeOf = (url: string): string => new URL(url, "http://localhost").pathname + new URL(url, "http://localhost").search

export function createApplication(initial: WebState, url: string, server: boolean) {
  const pinia = createPinia()
  const useWeb = defineStore("web", () => {
    const state = ref(initial)
    const connection = ref<"connecting" | "live" | "reconnecting" | "disconnected">("connecting")
    const error = ref("")
    return { state, connection, error }
  })
  const store = useWeb(pinia)
  const router = createRouter({
    history: server ? createMemoryHistory() : createWebHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: defineComponent({ render: () => h(WebPage, { store }) }) }],
  })
  const app = createSSRApp({ render: () => h(RouterView) })
  app.use(pinia).use(router)
  void router.push(routeOf(url))
  return { app, router, store }
}

type WebStore = { state: WebState; connection: "connecting" | "live" | "reconnecting" | "disconnected"; error: string }

const WebPage = defineComponent({
  props: { store: { type: Object as PropType<WebStore>, required: true } },
  setup(p) {
    const route = useRoute()
    const router = useRouter()
    const active = computed(() => route.path.split("/")[1] || "boards")
    const selectedPane = ref("")
    const detailsOpen = ref(false)
    const selectedWindow = ref("")
    const pending = ref("")
    const message = ref("")
    const query = ref(String(route.query["q"] ?? ""))
    const urgent = ref(route.query["urgent"] === "1")
    const receiptState = ref(String(route.query["state"] ?? ""))
    const boardView = computed(() => String(route.query["view"] ?? "all"))
    watch(() => route.query, value => { query.value = String(value["q"] ?? ""); urgent.value = value["urgent"] === "1"; receiptState.value = String(value["state"] ?? "") })
    const harness = ref(p.store.state.harnesses.includes("opencode2") ? "opencode2" : "")
    const settingsBase = ref(p.store.state.settings)
    const settingsDirty = ref(false)
    const layoutBase = ref<SourceDocument<LayoutFile>>()
    const layoutDirty = ref(false)
    const layoutName = computed(() => route.path.split("/")[2] ?? Object.keys(p.store.state.layouts)[0] ?? "")
    watch(() => p.store.state.settings, value => { if (!settingsDirty.value) settingsBase.value = value })
    watch(() => ({ name: layoutName.value, file: p.store.state.layouts[layoutName.value] }), value => {
      if (!layoutDirty.value) layoutBase.value = value.file
    }, { immediate: true })
    onBeforeRouteUpdate(to => {
      if (to.path !== route.path && (settingsDirty.value || layoutDirty.value)) {
        if (!confirm("Discard unsaved changes?")) return false
        settingsDirty.value = false; layoutDirty.value = false
      }
      return true
    })
    let requestNumber = 0
    const boardName = computed(() => route.path.split("/")[2] || p.store.state.boards[0]?.name || "")
    const session = computed(() => {
      const name = active.value === "sessions" ? route.path.split("/")[2] : undefined
      if (name) return p.store.state.sessions.find(item => item.name === name)
      return p.store.state.sessions.find(item => item.windows.some(window => window.id === selectedWindow.value)) ?? p.store.state.sessions[0]
    })
    const window = computed(() => session.value?.windows.find(item => item.id === selectedWindow.value) ?? session.value?.windows[0])
    const pane = computed(() => window.value?.panes.find(item => item.pane === selectedPane.value) ?? window.value?.panes[0])
    watch(() => window.value?.id, () => { if (window.value) { selectedWindow.value = window.value.id; selectedPane.value = window.value.panes[0]?.pane ?? "" } }, { immediate: true })
    async function refresh() {
      const current = ++requestNumber
      const path = route.fullPath
      const response = await fetch(`/api/state?route=${encodeURIComponent(route.fullPath)}`)
      if (!response.ok) throw new Error(responseError(await response.json() as unknown, `HTTP ${response.status}`))
      const data: unknown = await response.json()
      if (!isWebState(data)) throw new Error("Invalid server state")
      if (current !== requestNumber || path !== route.fullPath) return
      if (data.settings.etag === p.store.state.settings.etag) data.settings = p.store.state.settings
      for (const [name, layout] of Object.entries(data.layouts)) if (layout.etag === p.store.state.layouts[name]?.etag) data.layouts[name] = p.store.state.layouts[name]!
      p.store.state = data
    }
    async function mutate(path: string, data: unknown) {
      pending.value = path
      message.value = ""
      p.store.error = ""
      try {
        const response = await fetch(path, { method: path.startsWith("/api/actions") ? "POST" : "PUT", headers: { "Content-Type": "application/json", "X-TTT-Token": p.store.state.token }, body: JSON.stringify(data) })
        if (!response.ok) throw new Error(responseError(await response.json() as unknown, `HTTP ${response.status}`))
        const result: unknown = await response.json()
        await refresh()
        message.value = typeof result === "object" && result !== null && "output" in result && typeof result.output === "string" ? result.output : "Saved"
        return true
      } catch(error) { p.store.error = error instanceof Error ? error.message : String(error); return false }
      finally { pending.value = "" }
    }
    function action(request: ActionRequest) { void mutate("/api/actions", request) }
    function filter() { void router.replace({ path: route.path, query: { view: boardView.value, ...(query.value ? { q: query.value } : {}), ...(urgent.value ? { urgent: "1" } : {}), ...(receiptState.value ? { state: receiptState.value } : {}) } }) }
    async function newLayout() {
      const name = prompt("Layout name")
      if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return
      if (!await mutate(`/api/layouts/${name}`, { source: JSON.stringify({ version: 1, windows: [{ name: "main" }] }, null, 2), etag: "" })) return
      await router.push(`/layouts/${name}`)
    }
    let events: EventSource | undefined
    onMounted(() => {
      events = new EventSource("/api/events")
      events.addEventListener("open", () => { p.store.connection = "live"; void refresh().catch((error: unknown) => { p.store.error = String(error) }) })
      events.addEventListener("error", () => { p.store.connection = "reconnecting" })
      events.addEventListener("invalidate", event => { if (Number((event as MessageEvent<string>).data) !== p.store.state.revision) void refresh().catch((error: unknown) => { p.store.error = String(error) }) })
    })
    onBeforeUnmount(() => { events?.close() })
    watch(() => route.fullPath, () => { void refresh().catch((error: unknown) => { p.store.error = String(error) }) })
    return () => {
      const state = p.store.state
      const pager = () => h("div", { class: "t-toolbar", "aria-label": "History pages" }, [
        h(TButton, { disabled: state.page.offset === 0, onClick: () => { void router.push({ path: route.path, query: { ...route.query, offset: Math.max(0, state.page.offset - state.page.limit) } }) } }, () => "Previous"),
        h("span", `${state.page.total ? state.page.offset + 1 : 0}–${Math.min(state.page.total, state.page.offset + state.page.limit)} of ${state.page.total}`),
        h(TButton, { disabled: state.page.offset + state.page.limit >= state.page.total, onClick: () => { void router.push({ path: route.path, query: { ...route.query, offset: state.page.offset + state.page.limit } }) } }, () => "Next"),
      ])
      const sidebar = active.value === "sessions" ? h("div", [
        h("h2", "Sessions"), h(SessionTree, { sessions: state.sessions, selected: pane.value?.pane ?? "", onSelect: (id: string) => {
          const match = state.sessions.flatMap(session => session.windows.map(window => ({ session, window }))).find(item => item.session.id === id || item.window.id === id || item.window.panes.some(pane => pane.pane === id))
          if (match) { selectedWindow.value = match.window.id; selectedPane.value = id.startsWith("%") ? id : match.window.panes[0]?.pane ?? ""; void router.push(`/sessions/${match.session.name}`) }
        } }),
      ]) : active.value === "activity" ? h("div", [
        h("h2", "Sessions"), h(TEntityTree, { nodes: [...new Set([...state.sessions.map(session => session.name), ...state.boards.map(board => board.name)])].map(name => ({ id: name, label: name })), selected: state.board?.name ?? boardName.value, onSelect: (name: string) => { void router.push(`/activity/${name}`) } }),
      ]) : ["boards", "threads", "messages", "agents"].includes(active.value) ? h("div", [
        h("h2", "Boards"), h(TEntityTree, { nodes: state.boards.map(board => ({ id: board.name, label: board.name })), selected: boardName.value, onSelect: (id: string) => { void router.push(`/boards/${id}`) } }),
      ]) : active.value === "layouts" ? h("div", [h("h2", "Layouts"), h(TEntityTree, { nodes: Object.keys(state.layouts).map(name => ({ id: name, label: name })), selected: route.path.split("/")[2] ?? Object.keys(state.layouts)[0], onSelect: (name: string) => { void router.push(`/layouts/${name}`) } }), h(TButton, { onClick: () => { void newLayout() } }, () => "New layout")]) : h("div", [h("h2", `${active.value[0]?.toUpperCase() ?? ""}${active.value.slice(1)}`)])
      let main
      let inspector = h("div", [h("h2", "Details")])
      if (active.value === "sessions") {
        if (!session.value || !window.value) main = h(TNotice, { tone: "amber" }, () => "No live session")
        else {
          const current = session.value, win = window.value
          main = h("div", { class: "stack" }, [
            h("header", { class: "t-page-head" }, [h("div", [h("h1", `${current.name} / ${win.name}`), h("p", `${current.windows.length} ${current.windows.length === 1 ? "window" : "windows"} · ${win.panes.length} ${win.panes.length === 1 ? "pane" : "panes"}`)]), h("div", { class: "t-toolbar" }, [
              h(TSelect, { modelValue: harness.value, options: [{ value: "", label: "Shell" }, ...state.harnesses.map(name => ({ value: name, label: name }))], "aria-label": "Program for new panes", "onUpdate:modelValue": (value: string) => { harness.value = value } }),
              h(TButton, { disabled: !!pending.value, onClick: () => { action({ action: "open-pane", session: current.name, target: win.name, ...(harness.value ? { harness: harness.value } : {}) }) } }, () => "Open pane"),
              h(TButton, { disabled: !!pending.value, onClick: () => { action({ action: "open-window", session: current.name, ...(harness.value ? { harness: harness.value } : {}) }) } }, () => "Open window"),
              h(TButton, { intent: "danger", onClick: () => { if (confirm(`Close ${win.name}?`)) action({ action: "close", session: current.name, target: win.name }) } }, () => "Close window"),
            ])]),
            h(LiveWindow, { session: current.name, window: win, layout: state.geometry[win.id] ?? "", token: state.token, selected: pane.value?.pane ?? "", onSelect: (id: string) => { selectedPane.value = id },
              onInspect: (id: string) => { selectedPane.value = id; detailsOpen.value = true },
              onClose: (id: string) => { if (confirm(`Close pane ${id}? This stops its process. Closing the last pane also closes its window.`)) action({ action: "close-pane", session: current.name, target: id }) },
            }),
          ])
          inspector = h("div", { class: "stack" }, [
            h("h2", `Pane ${pane.value?.pane ?? ""}`), pane.value ? h(PaneInspector, { pane: pane.value }) : null,
            pane.value ? h("div", { class: "t-toolbar" }, [
              h(TButton, { disabled: !pane.value.agent && pane.value !== win.panes[0], onClick: () => { if (confirm(`Respawn ${pane.value?.pane}?`)) action({ action: "respawn", session: current.name, target: pane.value!.agent ?? win.name }) } }, () => "Respawn"),
              h(TButton, { intent: "danger", onClick: () => { if (confirm(`Interrupt ${pane.value?.pane}?`)) action({ action: "interrupt", session: current.name, target: pane.value!.pane }) } }, () => "Interrupt"),
            ]) : null,
            h(TInspector, { items: [{ label: "Session ID", value: current.id }, { label: "Attached", value: current.attached }, { label: "Group", value: current.group }] }),
            h(TDisclosure, { title: "Window panes" }, () => h(PaneTable, { panes: win.panes, selected: pane.value?.pane ?? "", onSelect: (id: string) => { selectedPane.value = id } })),
            h(TButton, { onClick: () => { const name = prompt("New window name", win.name); if (name) action({ action: "rename", session: current.name, target: win.name, name }) } }, () => "Rename window"),
            h(TButton, { onClick: () => { const name = prompt("Save current session as layout"); if (name) action({ action: "save", session: current.name, name }) } }, () => "Save session layout"),
            h(TDisclosure, { title: "Source" }, () => h(TSourceViewer, { value: { session: current, window: win, pane: pane.value } })),
          ])
        }
      } else if (active.value === "boards" || active.value === "threads" || active.value === "messages") {
        const board = state.board
        if (!board) main = h(TNotice, { tone: "amber" }, () => "No board data")
        else if (active.value === "threads") {
          const id = route.path.split("/")[3] ?? ""
          const root = board.messages.find(message => message.messageId === id)
          main = h("div", { class: "stack t-thread-page" }, [h("h1", root?.subject || root?.body.split("\n").find(Boolean)?.slice(0, 100) || "Conversation"), h(ThreadReader, { key: id, pageScroll: true, messages: board.messages, index: (board.threads[id] ?? []).slice(state.page.offset, state.page.offset + state.page.limit), onInspect: (messageId: string) => { void router.push(`/messages/${board.name}/${messageId}`) } }), pager()])
        } else if (active.value === "messages") {
          const found = board.messages[0]
          main = found ? h("div", { class: "stack" }, [h(MessageCard, { message: found }), h(ReceiptTable, { status: { message: found, receipts: board.receipts } })]) : h(TNotice, { tone: "amber" }, () => "Message not found")
        } else main = h("div", { class: "stack" }, [
          h("h1", board.name), h(TTabs, { modelValue: boardView.value, tabs: boardViews, label: "Board record types", "onUpdate:modelValue": (value: string) => { void router.push({ path: route.path, query: { ...route.query, view: value, offset: 0 } }) } }),
          h("div", { class: "t-filterbar" }, [h(TSearch, { class: "grow", label: "Search board history", modelValue: query.value, "onUpdate:modelValue": (value: string) => { query.value = value }, onKeydown: (event: KeyboardEvent) => { if (event.key === "Enter") filter() } }), h(TCheckbox, { label: "Urgent only", modelValue: urgent.value, "onUpdate:modelValue": (value: boolean) => { urgent.value = value; filter() } }),
            h(TSelect, { class: "t-history-state", modelValue: receiptState.value, options: [{ value: "", label: "All receipt states" }, ...receiptStates.map(value => ({ value, label: value }))], "aria-label": "Receipt state", "onUpdate:modelValue": (value: string) => { receiptState.value = value; filter() } }), h(TButton, { onClick: filter }, () => "Search")]),
          boardView.value === "acknowledgements" ? h(ActivityTimeline, { entries: timeline([], board.receipts).filter(entry => entry.type === "acked").reverse(), onInspect: (id: string) => { void router.push(`/messages/${board.name}/${id}`) } }) : h(ThreadList, { summaryOnly: true, messages: board.messages, threads: board.threads, onSelect: (id: string) => { void router.push(`/threads/${board.name}/${id}`) } }),
          pager(),
        ])
        inspector = h(TInspector, { items: [{ label: "Board", value: board?.name }, { label: "Visible messages", value: board?.messages.length }, { label: "Threads on page", value: Object.keys(board?.threads ?? {}).length }] })
      } else if (active.value === "agents") {
        const board = state.board
        const selected = route.path.split("/")[3] ?? Object.keys(board?.summaries ?? {})[0] ?? ""
        main = board ? h("div", { class: "stack" }, [h("h1", "Agents"), h(TEntityTree, { nodes: Object.keys(board.summaries).map(name => ({ id: name, label: name })), selected, onSelect: (name: string) => { void router.push(`/agents/${board.name}/${name}`) } }), board.summaries[selected] ? h(MailboxSummary, { summary: board.summaries[selected] }) : null, h(WaitingPresence, { presence: board.presences[selected], streak: board.streaks[selected] })]) : h(TNotice, { tone: "amber" }, () => "No board data")
      } else if (active.value === "activity") {
        main = h("div", { class: "stack" }, [h("h1", `Activity · ${state.board?.name ?? boardName.value}`), h(ActivityTimeline, { entries: state.board?.activity ?? [], onInspect: (id: string) => { if (state.board) void router.push(`/messages/${state.board.name}/${id}`) } }), pager()])
      } else if (active.value === "projects") {
        main = h("div", { class: "stack" }, [h("h1", "Projects"), ...groupProjects(state.sessions).map(group => h(TSurface, { title: group.cwd }, () => h("div", { class: "row wrap" }, group.sessions.map(name => h(TButton, { onClick: () => { selectedWindow.value = ""; void router.push(`/sessions/${name}`) } }, () => name)))))])
      } else if (active.value === "layouts") {
        const name = route.path.split("/")[2] ?? Object.keys(state.layouts)[0] ?? ""
        const file = layoutBase.value
        main = file ? h("div", { class: "stack" }, [h(TButton, { onClick: () => { const nameForSession = prompt("New session name"); if (nameForSession) action({ action: "restore", session: nameForSession, name }) } }, () => "Create session from layout"), h(LayoutEditor, { key: name, modelValue: file.value, source: file.source, fileName: `${name}.jsonc`, onDirty: (value: boolean) => { layoutDirty.value = value }, onSave: (_value: LayoutFile, source: string) => {
          void mutate(`/api/layouts/${name}`, { source, etag: file.etag }).then(saved => { if (saved) { layoutDirty.value = false; layoutBase.value = p.store.state.layouts[name] } })
        } })]) : h(TNotice, { tone: "amber" }, () => "No saved layouts")
      } else if (active.value === "settings") {
        main = h(SettingsForm, { modelValue: settingsBase.value.value, source: settingsBase.value.source, shippedHarnesses: state.harnesses, onDirty: (value: boolean) => { settingsDirty.value = value }, onSave: (_value: SettingsFile, source: string) => {
          void mutate("/api/settings", { source, etag: settingsBase.value.etag }).then(saved => { if (saved) { settingsDirty.value = false; settingsBase.value = p.store.state.settings } })
        } })
      } else if (active.value === "diagnostics") {
        main = h(DoctorReport, { findings: state.findings })
      } else main = h(TNotice, { tone: "amber" }, () => "Choose a page")
      return h(AppShell, { detailsOpen: detailsOpen.value, "onUpdate:detailsOpen": (value: boolean) => { detailsOpen.value = value } }, { topbar: () => h(TTopBar, { items: nav, active: active.value, state: p.store.connection, onNavigate: (path: string) => { void router.push(path) } }), sidebar: () => sidebar, default: () => h("div", { class: "stack" }, [p.store.error ? h(TNotice, { tone: "coral" }, () => p.store.error) : null, message.value ? h(TNotice, { tone: "mint" }, () => message.value) : null, main]), inspector: () => inspector })
    }
  },
})
