import { defineComponent, h } from "vue"

export const TSkeleton = defineComponent({
  name: "TSkeleton", props: {
    lines: {
      type: Number, default: 3,
    },
  }, setup: p => () => h("div", {
    class: "stack", "aria-busy": "true", "aria-label": "Loading",
  }, Array.from({
    length: p.lines,
  }, (_, i) => h("div", {
    key: i, class: "t-skeleton", style: {
      width: i === p.lines - 1 ? "65%" : "100%",
    },
  }))),
})
