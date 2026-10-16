import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import { displayValue } from "../contracts/index.ts"

export interface InspectorItem {
  label: string
  value: unknown
  hint?: string
}
export const TInspector = defineComponent({
  name: "TInspector", props: {
    items: {
      type: Array as PropType<readonly InspectorItem[]>, required: true,
    },
  }, setup: (p, { slots }) => () => h("dl", {
    class: "t-inspector",
  }, p.items.map(item => h("div", {
    key: item.label, class: "t-inspector-row",
  }, [
    h("dt", {
      title: item.hint,
    }, item.label), h("dd", {
      class: item.value === undefined ? "dim" : "",
    }, slots["value"]?.({
      item,
    }) || displayValue(item.value)),
  ]))),
})
