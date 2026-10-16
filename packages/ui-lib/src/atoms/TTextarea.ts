import { defineComponent, h } from "vue"

export const TTextarea = defineComponent({
  name: "TTextarea", props: {
    modelValue: {
      type: String, default: "",
    },
  }, emits: {
    "update:modelValue": (_value: string) => true,
  }, setup: (p, { emit }) => () => h("textarea", {
    class: "t-textarea", value: p.modelValue, onInput: (e: Event) => { emit("update:modelValue", (e.target as HTMLTextAreaElement).value) },
  }),
})
