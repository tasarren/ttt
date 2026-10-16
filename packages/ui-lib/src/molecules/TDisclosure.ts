import { defineComponent, h } from "vue"

export const TDisclosure = defineComponent({
  name: "TDisclosure", props: {
    title: {
      type: String, required: true,
    }, open: Boolean,
  }, setup: (p, { slots }) => () => h("details", {
    class: "t-disclosure", open: p.open,
  }, [
    h("summary", p.title), h("div", slots["default"]?.()),
  ]),
})
