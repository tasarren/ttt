import { defineComponent, h, ref, onBeforeUnmount } from "vue"
import type { PropType, VNode } from "vue"
import type { LayoutNode } from "../contracts/index.ts"
import { leaves, resizeSplit } from "../contracts/index.ts"
import { TBadge } from "../atoms/TBadge.ts"

export interface PaneTile {
  id: number
  label: string
  command?: string | undefined
  cwd?: string | undefined
  agent?: string | undefined
  content?: string | undefined
}
export const LayoutCanvas = defineComponent({
  name: "LayoutCanvas",
  props: {
    modelValue: {
      type: Object as PropType<LayoutNode>, required: true,
    }, tiles: {
      type: Array as PropType<readonly PaneTile[]>, required: true,
    }, selected: {
      type: Number, default: 0,
    }, editable: Boolean,
  },
  emits: {
    "update:modelValue": (_tree: LayoutNode) => true, select: (_id: number) => true, error: (_message: string) => true,
  },
  setup(p, { emit }) {
    const root = ref<HTMLElement>()
    let cleanup: (() => void) | undefined
    function resize(path: number[], ratio: number, boundary = 0) {
      try {
        emit("update:modelValue", resizeSplit(p.modelValue, path, ratio, boundary))
      }
      catch(e) {
        emit("error", (e as Error).message)
      }
    }
    function start(e: PointerEvent, node: LayoutNode, path: number[], boundary: number) {
      if (!p.editable || !root.value)
        return
      e.preventDefault()
      cleanup?.()
      const rect = root.value.getBoundingClientRect()
      const horizontal = node.direction === "horizontal"
      const first = node.children![boundary]!
      const second = node.children![boundary + 1]!
      const total = horizontal ? first.width + second.width : first.height + second.height
      const move = (event: PointerEvent) => {
        const position = horizontal ? (event.clientX - rect.left) / rect.width * p.modelValue.width - first.x : (event.clientY - rect.top) / rect.height * p.modelValue.height - first.y
        resize(path, position / total, boundary)
      }
      cleanup = () => {
        document.removeEventListener("pointermove", move)
        document.removeEventListener("pointerup", cleanup!)
        document.removeEventListener("pointercancel", cleanup!)
      }
      document.addEventListener("pointermove", move)
      document.addEventListener("pointerup", cleanup, {
        once: true,
      })
      document.addEventListener("pointercancel", cleanup, {
        once: true,
      })
    }
    onBeforeUnmount(() => cleanup?.())
    function handles(node: LayoutNode, path: number[] = []): VNode[] {
      if (!node.children)
        return []
      const items = node.children.flatMap((c, i) => handles(c, [
        ...path, i,
      ]))
      const horizontal = node.direction === "horizontal"
      node.children.slice(0, -1).forEach((first, boundary) => {
        const second = node.children![boundary + 1]!
        const ratio = horizontal ? first.width / (first.width + second.width) : first.height / (first.height + second.height)
        items.push(h("div", {
          key: `split-${path.join("-")}-${boundary}`, class: "t-resize", role: "separator", tabindex: 0,
          "aria-label": "Resize pane split", "aria-orientation": horizontal ? "vertical" : "horizontal", "aria-valuemin": 10, "aria-valuemax": 90, "aria-valuenow": Math.round(ratio * 100),
          style: horizontal ? {
            left: `calc(${(first.x + first.width + .5) / p.modelValue.width * 100}% - 4px)`, top: `${node.y / p.modelValue.height * 100}%`, height: `${node.height / p.modelValue.height * 100}%`, width: "8px", cursor: "col-resize",
          } : {
            top: `calc(${(first.y + first.height + .5) / p.modelValue.height * 100}% - 4px)`, left: `${node.x / p.modelValue.width * 100}%`, width: `${node.width / p.modelValue.width * 100}%`, height: "8px", cursor: "row-resize",
          },
          onPointerdown: (e: PointerEvent) => { start(e, node, path, boundary) },
          onKeydown: (e: KeyboardEvent) => {
            const positive = horizontal ? "ArrowRight" : "ArrowDown"
            const negative = horizontal ? "ArrowLeft" : "ArrowUp"
            if ([
              positive, negative, "Home", "End",
            ].includes(e.key)) {
              e.preventDefault()
              resize(path, e.key === "Home" ? .1 : e.key === "End" ? .9 : ratio + (e.key === positive ? .025 : -.025), boundary)
            }
          },
        }))
      })
      return items
    }
    return () => h("div", {
      ref: root, class: "t-pane-canvas", "aria-label": p.editable ? "Editable layout" : "Pane layout",
    }, [
      ...leaves(p.modelValue).map(leaf => {
        const tile = p.tiles.find(t => t.id === leaf.pane)
        return h("button", {
          type: "button", class: "t-pane-tile", "data-selected": p.selected === leaf.pane, key: leaf.pane!, "aria-label": `Inspect pane ${tile?.label || leaf.pane}`, "aria-pressed": p.selected === leaf.pane, style: {
            left: `calc(${leaf.x / p.modelValue.width * 100}% + 5px)`, top: `calc(${leaf.y / p.modelValue.height * 100}% + 5px)`, width: `calc(${leaf.width / p.modelValue.width * 100}% - 10px)`, height: `calc(${leaf.height / p.modelValue.height * 100}% - 10px)`,
          }, onClick: () => { emit("select", leaf.pane!) },
        }, [
          h("header", [
            h("h3", `${leaf.pane}  ${tile?.label || "Pane"}`), h(TBadge, {
              tone: tile?.agent ? "sage" : "lavender", value: tile?.agent ? "agent" : "helper",
            }),
          ]), h("p", {
            class: "small mono muted truncate", style: {
              marginTop: "8px",
            },
          }, [
            tile?.command || "Plain shell", "  ", tile?.cwd || "",
          ]), h("pre", tile?.content || (tile?.agent ? `Agent: ${tile.agent}\n` : "Helper pane\n") + "\nNo terminal capture supplied."),
        ])
      }), ...(p.editable ? handles(p.modelValue) : []),
    ])
  },
})
