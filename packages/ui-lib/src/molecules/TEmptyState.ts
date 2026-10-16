import { defineComponent, h } from "vue"

export const TEmptyState = defineComponent({
  name: "TEmptyState", props: {
    title: {
      type: String, default: "Nothing to show",
    }, detail: String,
  }, setup: (p, { slots }) => () => h("div", {
    class: "t-empty",
  }, [
    h("h3", p.title), p.detail ? h("p", {
      class: "small",
    }, p.detail) : null, slots["default"]?.(),
  ]),
})
