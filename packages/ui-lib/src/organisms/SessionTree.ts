import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { TreeSession } from "../contracts/index.ts"
import { TEntityTree } from "../molecules/TEntityTree.ts"

export const SessionTree = defineComponent({
  name: "SessionTree", props: {
    sessions: {
      type: Array as PropType<readonly TreeSession[]>, required: true,
    }, selected: String,
  }, emits: {
    select: (_id: string) => true,
  }, setup: (p, { emit }) => () => h(TEntityTree, {
    label: "Sessions, windows and panes", ...(p.selected === undefined ? {} : { selected: p.selected }), nodes: p.sessions.map(s => ({
      id: s.id, label: s.name, count: s.windows.length, detail: s.attached ? "Attached tmux session" : "Detached tmux session", children: s.windows.map(w => ({
        id: w.id, label: `${w.index}  ${w.name}`, count: w.panes.length, children: w.panes.map(p => ({
          id: p.pane, label: `${p.pane}  ${p.agent || p.title || "helper"}`, detail: p.cwd,
        })),
      })),
    })), onSelect: (id: string) => { emit("select", id) },
  }),
})
