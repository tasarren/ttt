import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { TreeSession } from "../contracts/index.ts"
import { TEntityTree } from "../molecules/TEntityTree.ts"

export const SessionTree = defineComponent({
  name: "SessionTree", props: {
    sessions: {
      type: Array as PropType<readonly TreeSession[]>, required: true,
    }, selected: String, unreadCounts: { type: Object as PropType<Readonly<Record<string, number>>>, default: () => ({}) },
  }, emits: {
    select: (_id: string) => true,
  }, setup: (p, { emit }) => () => h(TEntityTree, {
    contextIds: p.sessions.flatMap(session => session.windows.flatMap(window => window.id === p.selected || window.panes.some(pane => pane.pane === p.selected) ? [session.id, window.id] : [])),
    label: "Sessions, windows and panes", ...(p.selected === undefined ? {} : { selected: p.selected }), nodes: p.sessions.map(s => ({
      id: s.id, label: s.name, ...(p.unreadCounts[s.id] ? { count: p.unreadCounts[s.id]! } : {}), countLabel: `${p.unreadCounts[s.id] ?? 0} unread messages`, detail: s.attached ? "Attached tmux session" : "Detached tmux session", children: s.windows.map(w => ({
        id: w.id, label: w.name, badge: `#${w.index}`, ...(p.unreadCounts[w.id] ? { count: p.unreadCounts[w.id]! } : {}), countLabel: `${p.unreadCounts[w.id] ?? 0} unread messages`, children: w.panes.map(pane => ({
          id: pane.pane, label: pane.agent || pane.paneTitle || pane.title || pane.command || "Helper", badge: pane.pane, ...(p.unreadCounts[pane.pane] ? { count: p.unreadCounts[pane.pane]! } : {}), countLabel: `${p.unreadCounts[pane.pane] ?? 0} unread messages`, detail: pane.cwd,
        })),
      })),
    })), onSelect: (id: string) => { emit("select", id) },
  }),
})
