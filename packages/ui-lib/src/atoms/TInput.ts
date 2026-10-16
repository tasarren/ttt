import { defineComponent, h } from "vue"

export const TInput = defineComponent({
  name: "TInput", props: {
    modelValue: {
      type: [
        String, Number,
      ], default: "",
    }, type: {
      type: String, default: "text",
    },
  }, emits: {
    "update:modelValue": (_value: string) => true,
  }, setup: (p, { emit }) => () => h("input", {
    class: "t-input", type: p.type, value: p.modelValue, onInput: (e: Event) => { emit("update:modelValue", (e.target as HTMLInputElement).value) },
  }),
})
