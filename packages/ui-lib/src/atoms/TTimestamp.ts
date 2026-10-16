import { defineComponent, h } from "vue"
import type { PropType } from "vue"

export const TTimestamp = defineComponent({
  name: "TTimestamp", props: {
    value: String as PropType<string | undefined>, full: Boolean,
  }, setup: p => () => {
    if (!p.value)
      return h("span", {
        class: "t-time dim",
      }, "Not recorded")
    const date = new Date(p.value)
    const text = Number.isNaN(date.getTime()) ? p.value : p.full ? date.toISOString().replace("T", " ").replace(".000Z", " UTC") : date.toISOString().slice(11, 16) + " UTC"
    return h("time", {
      class: "t-time", datetime: p.value, title: p.value,
    }, text)
  },
})
