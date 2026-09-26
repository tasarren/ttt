import { defineComponent, h } from "vue"
import type { PropType } from "vue"

export interface Crumb {
  label: string
  href?: string
}
export const TBreadcrumb = defineComponent({
  name: "TBreadcrumb", props: {
    items: {
      type: Array as PropType<readonly Crumb[]>, required: true,
    },
  }, setup: p => () => h("nav", {
    class: "t-breadcrumb", "aria-label": "Breadcrumb",
  }, p.items.flatMap((item, i) => [
    i ? h("span", {
      "aria-hidden": "true",
    }, "/") : null, item.href ? h("a", {
      href: item.href,
    }, item.label) : h("span", {
      "aria-current": i === p.items.length - 1 ? "page" : undefined,
    }, item.label),
  ])),
})
