import { defineComponent, h, ref, watch } from "vue"
import type { PropType, VNode } from "vue"
import { TCount } from "../atoms/TCount.ts"

export interface EntityNode {
  id: string
  label: string
  count?: number
  badge?: string
  countLabel?: string
  detail?: string
  children?: EntityNode[]
}
export const TEntityTree = defineComponent({
  name: "TEntityTree", props: {
    nodes: {
      type: Array as PropType<readonly EntityNode[]>, required: true,
    }, selected: String as PropType<string | undefined>, contextIds: {
      type: Array as PropType<readonly string[]>, default: () => [],
    }, label: {
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
    watch(() => p.selected, () => {
      function reveal(nodes: readonly EntityNode[]): boolean {
        let contains = false
        for (const node of nodes) {
          const child = node.children ? reveal(node.children) : false
          if (child) collapsed.value.delete(node.id)
          contains = node.id === p.selected || child || contains
        }
        return contains
      }
      reveal(p.nodes)
    })
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
          class: "t-tree-row", "data-selected": n.id === p.selected, "data-context": p.contextIds.includes(n.id), style: {
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
            }, n.label), n.badge ? h("span", { class: "t-tree-id", title: n.badge }, n.badge) : null, n.count !== undefined ? h(TCount, {
              value: n.count, title: n.countLabel, "aria-label": n.countLabel,
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
