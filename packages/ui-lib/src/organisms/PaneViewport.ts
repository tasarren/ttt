import { defineComponent, h, computed } from "vue"
import type { PropType } from "vue"
import type { TreePane } from "../contracts/index.ts"
import { makeLayout, parseLayout, leaves } from "../contracts/index.ts"
import { LayoutCanvas } from "./LayoutCanvas.ts"
import { TEmptyState } from "../molecules/TEmptyState.ts"
/** Exact geometry uses native tmux leaf IDs. A fallback is explicitly illustrative. */
export const PaneViewport = defineComponent({
  name: "PaneViewport",
  props: {
    panes: {
      type: Array as PropType<readonly TreePane[]>, required: true,
    },
    selected: String,
    geometry: String as PropType<string | undefined>,
    captures: {
      type: Object as PropType<Record<string, string>>, default: () => ({}),
    },
  },
  emits: {
    select: (_id: string) => true,
  },
  setup(p, { emit }) {
    const arrangement = computed(() => {
      if (p.geometry) {
        try {
          const tree = parseLayout(p.geometry)
          const cells = leaves(tree)
          const matching = cells.map(cell => p.panes.find(pane => pane.pane === `%${cell.pane}`))
          if (cells.length === p.panes.length && matching.every(Boolean)) {
            return {
              tree, entries: cells.map((cell, i) => ({
                id: cell.pane!, pane: matching[i]!,
              })), exact: true,
            }
          }
        }
        catch { /* Keep all runtime metadata readable when the optional geometry is invalid. */
        }
      }
      const visible = p.panes.slice(0, 24)
      return {
        tree: makeLayout(Math.max(1, visible.length)),
        entries: visible.map((pane, id) => ({
          id, pane,
        })),
        exact: false,
      }
    })
    return () => {
      if (!p.panes.length)
        return h(TEmptyState, {
          title: "No panes in this window",
        })
      const { tree, entries, exact } = arrangement.value
      const note = exact
        ? ""
        : "Illustrative arrangement. Valid geometry matching the pane IDs was not supplied." + (p.panes.length > 24 ? " First 24 tiles shown; the pane table contains every pane." : "")
      return h("div", {
        class: "stack",
      }, [
        h(LayoutCanvas, {
          modelValue: tree,
          tiles: entries.map(({ id, pane }) => ({
            id, label: pane.agent || pane.title || pane.pane, agent: pane.agent, command: pane.command, cwd: pane.cwd, content: p.captures[pane.pane],
          })),
          selected: entries.find(entry => entry.pane.pane === p.selected)?.id ?? -1,
          onSelect: (id: number) => {
            const entry = entries.find(item => item.id === id)
            if (entry)
              emit("select", entry.pane.pane)
          },
        }),
        note ? h("p", {
          class: "small dim",
        }, note) : null,
      ])
    }
  },
})
