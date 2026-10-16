import { defineComponent, h } from "vue"

export const TCount = defineComponent({
  name: "TCount", props: {
    value: Number, label: String,
  }, setup: p => () => h("span", {
    class: "t-count", title: p.label,
  }, p.value === undefined ? "Not recorded" : p.value.toLocaleString()),
})
