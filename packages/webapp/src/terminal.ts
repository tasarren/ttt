import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue"
import type { PropType } from "vue"
import type { TreeWindow, LayoutNode } from "@ttt/ui"
import { parseLayout, leaves, TButton } from "@ttt/ui"
import type { Terminal } from "@xterm/xterm"
import { isTerminalEvent } from "./protocol.ts"

export const LiveWindow = defineComponent({
  name: "LiveWindow",
  props: {
    session: { type: String, required: true },
    window: { type: Object as PropType<TreeWindow>, required: true },
    token: { type: String, required: true },
    selected: { type: String, required: true },
    fontSizes: { type: Object as PropType<Readonly<Record<string, number>>>, default: () => ({}) },
    layout: { type: String, default: "" },
  },
  emits: { select: (_id: string) => true, inspect: (_id: string) => true, close: (_id: string) => true, zoom: (_id: string, _size: number) => true },
  setup(p, { emit }) {
    const host = ref<HTMLElement>()
    const terminals = new Map<string, Terminal>()
    const error = ref("")
    let events: EventSource | undefined
    const lifecycle = { disposed: false }
    let generation = 0
    let observer: ResizeObserver | undefined
    let visibilityObserver: IntersectionObserver | undefined
    let visible = false
    let inputQueue: Promise<unknown> = Promise.resolve()
    function fit() {
      for (const [pane, terminal] of terminals) {
        const node = host.value?.querySelector<HTMLElement>(`[data-pane="${pane}"] .t-terminal-screen`)
        const screen = terminal.element?.querySelector<HTMLElement>(".xterm-screen")
        if (!node || node.clientWidth <= 30 || !screen?.clientWidth) continue
        const fontSize = p.fontSizes[pane] ?? Math.max(1, Math.min(16, Math.floor((terminal.options.fontSize ?? 12) * (node.clientWidth - 30) / screen.clientWidth)))
        if (fontSize !== terminal.options.fontSize) terminal.options.fontSize = fontSize
      }
    }
    async function connect() {
      const current = ++generation
      events?.close()
      observer?.disconnect()
      for (const terminal of terminals.values()) terminal.dispose()
      terminals.clear()
      if (lifecycle.disposed || document.hidden || !visible || !host.value) return
      error.value = ""
      const { Terminal } = await import("@xterm/xterm")
      if (current !== generation) return
      for (const pane of p.window.panes) {
        const node = host.value.querySelector<HTMLElement>(`[data-pane="${pane.pane}"] .t-terminal-screen`)
        if (!node) continue
        const terminal = new Terminal({ cols: 80, rows: 24, convertEol: false, theme: { background: "#1b161e", foreground: "#f4edf4" }, fontFamily: "ui-monospace, monospace", fontSize: 12, scrollback: 1000 })
        terminal.open(node)
        observer ??= new ResizeObserver(fit)
        observer.observe(node)
        terminal.onData(data => {
          if (current !== generation || p.selected !== pane.pane) return
          if (data.length > 8192) { error.value = "Paste exceeds 8192 characters"; return }
          const input = { session: p.session, pane: pane.pane, data }
          const token = p.token
          inputQueue = inputQueue.then(async() => {
            const response = await fetch("/api/input", { method: "POST", headers: { "Content-Type": "application/json", "X-TTT-Token": token }, body: JSON.stringify(input) })
            if (!response.ok) throw new Error(`Input rejected (HTTP ${response.status})`)
          }).catch((failure: unknown) => { error.value = failure instanceof Error ? failure.message : String(failure) })
        })
        terminals.set(pane.pane, terminal)
      }
      events = new EventSource(`/api/terminal?session=${encodeURIComponent(p.session)}&window=${encodeURIComponent(p.window.id)}`)
      events.onmessage = event => {
        if (current !== generation) return
        let parsed: unknown
        try { parsed = JSON.parse(String(event.data)) } catch { error.value = "Invalid terminal event"; return }
        if (!isTerminalEvent(parsed)) return
        if (parsed.type === "error") { error.value = parsed.message; return }
        if (parsed.type === "snapshot") {
          const terminal = terminals.get(parsed.pane)
          if (terminal) { terminal.reset(); terminal.resize(parsed.frame.cols, parsed.frame.rows); terminal.write(parsed.frame.text, () => {
            fit()
            if (terminal.element) terminal.element.scrollTop = terminal.element.scrollHeight
          }) }
        } else {
          const terminal = terminals.get(parsed.pane)
          if (terminal) {
            const node = terminal.element
            const atBottom = !!node && node.scrollHeight - node.scrollTop - node.clientHeight < 48
            terminal.write(parsed.text, () => { if (atBottom) node.scrollTop = node.scrollHeight })
          }
        }
      }
    }
    const reconnect = () => { void nextTick(connect).catch((failure: unknown) => { error.value = failure instanceof Error ? failure.message : String(failure) }) }
    const pause = () => { generation++; events?.close(); events = undefined }
    const visibility = () => { if (document.hidden) pause(); else if (visible) reconnect() }
    onMounted(() => {
      document.addEventListener("visibilitychange", visibility)
      visibilityObserver = new IntersectionObserver(entries => {
        const shown = !!entries[0]?.isIntersecting
        if (shown === visible) return
        visible = shown
        if (shown) reconnect()
        else pause()
      })
      if (host.value) visibilityObserver.observe(host.value)
    })
    onBeforeUnmount(() => { lifecycle.disposed = true; pause(); observer?.disconnect(); visibilityObserver?.disconnect(); document.removeEventListener("visibilitychange", visibility); for (const terminal of terminals.values()) terminal.dispose(); terminals.clear() })
    watch([() => p.session, () => p.window.id, () => p.window.panes.map(pane => pane.pane).join(",")], () => { if (visible) reconnect() })
    watch(() => p.fontSizes, fit)
    watch(() => p.layout, () => { void nextTick(() => {
      if (lifecycle.disposed) return
      try { if (p.layout) for (const cell of leaves(parseLayout(p.layout))) {
        const pane = `%${cell.pane}`
        const terminal = terminals.get(pane)
        if (terminal && (terminal.cols !== cell.width || terminal.rows !== cell.height)) terminal.resize(cell.width, cell.height)
      } } catch { /* Keep snapshot dimensions without geometry. */ }
      fit()
    }) })
    return () => {
      let layout: LayoutNode | undefined
      try { if (p.layout) layout = parseLayout(p.layout) } catch { /* Missing geometry uses the labelled pane grid. */ }
      const cells = layout ? leaves(layout) : []
      return h("section", { ref: host, class: ["t-live-window", layout && "is-spatial"], style: !layout ? { gridTemplateColumns: `repeat(${Math.min(2, p.window.panes.length)},minmax(0,1fr))` } : {}, "aria-label": `Live panes of ${p.window.name}` }, [error.value ? h("p", { role: "alert" }, error.value) : null, ...p.window.panes.map(pane => {
        const cell = cells.find(cell => `%${cell.pane}` === pane.pane)
        return h("article", { key: pane.pane, class: "t-live-pane", style: cell && layout ? { left: `${cell.x / layout.width * 100}%`, top: `${cell.y / layout.height * 100}%`, width: `calc(${cell.width / layout.width * 100}% - 6px)`, height: `calc(${cell.height / layout.height * 100}% - 6px)` } : {}, "data-pane": pane.pane, "data-selected": pane.pane === p.selected, onClick: () => { emit("select", pane.pane) } }, [
          h("header", [h("div", { class: "row" }, [h("strong", pane.agent || pane.paneTitle || pane.title || pane.command || "Helper"), h("span", { class: "t-tree-id" }, pane.pane)]), h("div", { class: "t-toolbar" }, [h("span", pane.command),
            h(TButton, { size: "sm", intent: "ghost", "aria-label": `Decrease text size in pane ${pane.pane}`, onClick: (event: MouseEvent) => { event.stopPropagation(); emit("zoom", pane.pane, Math.max(6, (p.fontSizes[pane.pane] ?? terminals.get(pane.pane)?.options.fontSize ?? 12) - 1)) } }, () => "A−"),
            h(TButton, { size: "sm", intent: "ghost", "aria-label": `Increase text size in pane ${pane.pane}`, onClick: (event: MouseEvent) => { event.stopPropagation(); emit("zoom", pane.pane, Math.min(24, (p.fontSizes[pane.pane] ?? terminals.get(pane.pane)?.options.fontSize ?? 12) + 1)) } }, () => "A+"),
            p.fontSizes[pane.pane] !== undefined ? h(TButton, { size: "sm", intent: "ghost", "aria-label": `Reset text size in pane ${pane.pane}`, onClick: (event: MouseEvent) => { event.stopPropagation(); emit("zoom", pane.pane, 0) } }, () => "Auto") : null,
            h(TButton, { size: "sm", intent: "ghost", "aria-label": `Details for pane ${pane.pane}`, onClick: (event: MouseEvent) => { event.stopPropagation(); emit("inspect", pane.pane) } }, () => "Details"),
            h(TButton, { size: "sm", intent: "danger", "aria-label": `Close pane ${pane.pane}`, onClick: (event: MouseEvent) => { event.stopPropagation(); emit("close", pane.pane) } }, () => "Close pane"),
          ])]), h("div", { class: "t-terminal-screen", "aria-label": `${pane.pane} terminal`, tabindex: 0 }),
        ])
      })])
    }
  },
})
