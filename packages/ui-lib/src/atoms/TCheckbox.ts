import { defineComponent, h } from "vue"

export const TCheckbox = defineComponent({
  name: "TCheckbox", inheritAttrs: false, props: {
    modelValue: Boolean, label: {
      type: String, required: true,
    }, disabled: Boolean,
  }, emits: {
    "update:modelValue": (_value: boolean) => true,
  }, setup: (p, { emit, attrs }) => () => h("label", {
    class: "t-checkbox",
  }, [
    h("input", {
      ...attrs, type: "checkbox", checked: p.modelValue, disabled: p.disabled, onChange: (e: Event) => { emit("update:modelValue", (e.target as HTMLInputElement).checked) },
    }), h("span", p.label),
  ]),
})
