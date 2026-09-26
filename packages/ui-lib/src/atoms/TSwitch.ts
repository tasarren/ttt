import { defineComponent, h } from "vue"

export const TSwitch = defineComponent({
  name: "TSwitch", inheritAttrs: false, props: {
    modelValue: Boolean, label: {
      type: String, required: true,
    }, disabled: Boolean,
  }, emits: {
    "update:modelValue": (_value: boolean) => true,
  }, setup: (p, { emit, attrs }) => () => h("label", {
    class: "t-switch",
  }, [
    h("input", {
      ...attrs, type: "checkbox", role: "switch", checked: p.modelValue, disabled: p.disabled, "aria-checked": p.modelValue, onChange: (e: Event) => { emit("update:modelValue", (e.target as HTMLInputElement).checked) },
    }), h("span", p.label),
  ]),
})
