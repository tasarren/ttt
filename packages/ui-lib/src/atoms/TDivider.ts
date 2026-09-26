import { defineComponent, h } from "vue"

export const TDivider = defineComponent({
  name: "TDivider", setup: () => () => h("hr", {
    class: "t-divider",
  }),
})
