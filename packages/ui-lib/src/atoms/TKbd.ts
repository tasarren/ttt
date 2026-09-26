import { defineComponent, h } from "vue"

export const TKbd = defineComponent({
  name: "TKbd", setup: (_p, { slots }) => () => h("kbd", {
    class: "t-kbd",
  }, slots["default"]?.()),
})
