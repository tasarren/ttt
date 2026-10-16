import { defineComponent, h, useId } from "vue"
import { TInput } from "../atoms/TInput.ts"

export const TSearch = defineComponent({
  name: "TSearch", props: {
    modelValue: {
      type: String, default: "",
    }, label: {
      type: String, default: "Search",
    },
  }, emits: {
    "update:modelValue": (_value: string) => true,
  }, setup(p, { emit }) {
    const id = useId()
    return () => h("div", {
      class: "t-search",
    }, [
      h("label", {
        class: "sr-only", for: id,
      }, p.label), h("span", {
        "aria-hidden": "true",
      }, "⌕"), h(TInput, {
        id, type: "search", modelValue: p.modelValue, placeholder: p.label, "onUpdate:modelValue": (v: string) => { emit("update:modelValue", v) },
      }),
    ])
  },
})
