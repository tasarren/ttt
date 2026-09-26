import { defineComponent, h, ref } from "vue"
import type { PropType, VNode } from "vue"
import { TCount } from "../atoms/TCount.ts"

export interface EntityNode {
  id: string
  label: string
  count?: number
  detail?: string
  children?: EntityNode[]
}
export const TEntityTree = defineComponent({
  name: "TEntityTree", props: {
    nodes: {
      type: Array as PropType<readonly EntityNode[]>, required: true,
    }, selected: String as PropType<string | undefined>, label: {
      type: String, default: "Items",
    },
  }, emits: {
    select: (_id: string) => true,
  }, setup(p, { emit }) {
    const closed = new Set<string>()
    function initialize(nodes: readonly EntityNode[], depth = 0): boolean {
      let contains = false
      for (const [i, node] of nodes.entries()) {
        const childSelected = node.children ? initialize(node.children, depth + 1) : false
        const selected = node.id === p.selected || childSelected
        if (node.children?.length && !selected && !(i === 0 && depth < 2 && !p.selected))
          closed.add(node.id)
        contains = contains || selected
      }
      return contains
    }
    initialize(p.nodes)
    const collapsed = ref(closed)
    function toggle(id: string) {
      const next = new Set(collapsed.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      collapsed.value = next
    }
    function render(nodes: readonly EntityNode[], depth = 0): VNode {
      return h("ul", {
        class: "t-tree",
      }, nodes.map(n => h("li", {
        key: n.id,
      }, [
        h("div", {
          class: "t-tree-row", "data-selected": n.id === p.selected, style: {
            paddingLeft: `${depth * 14}px`,
          },
        }, [
          n.children?.length ? h("button", {
            type: "button", class: "t-tree-toggle", "aria-label": `Toggle ${n.label}`, "aria-expanded": !collapsed.value.has(n.id), onClick: () => { toggle(n.id) },
          }, collapsed.value.has(n.id) ? "›" : "⌄") : h("span", {
            style: {
              width: "20px",
            },
          }), h("button", {
            type: "button", class: "t-tree-label", "aria-current": n.id === p.selected ? "true" : undefined, onClick: () => { emit("select", n.id) }, title: n.detail,
          }, [
            h("span", {
              class: "truncate mono grow",
            }, n.label), n.count !== undefined ? h(TCount, {
              value: n.count,
            }) : null,
          ]),
        ]), n.children?.length && !collapsed.value.has(n.id) ? render(n.children, depth + 1) : null,
      ])))
    }
    return () => h("nav", {
      "aria-label": p.label,
    }, [
      render(p.nodes),
    ])
  },
})
