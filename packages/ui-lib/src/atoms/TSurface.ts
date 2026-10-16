import { defineComponent, h } from "vue"

export const TSurface = defineComponent({
  name: "TSurface", props: {
    title: String, padded: {
      type: Boolean, default: true,
    },
  }, setup: (p, { slots }) => () => h("section", {
    class: "t-surface",
  }, [
    p.title || slots["header"] ? h("header", {
      class: "t-surface-head",
    }, [
      slots["header"]?.() || h("h2", p.title), slots["actions"]?.(),
    ]) : null, h("div", {
      class: p.padded ? "t-surface-body" : "",
    }, slots["default"]?.()),
  ]),
})
