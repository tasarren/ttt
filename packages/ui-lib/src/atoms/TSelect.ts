import { defineComponent, h } from "vue"
import type { PropType } from "vue"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}
export const TSelect = defineComponent({
  name: "TSelect", props: {
    modelValue: String, options: {
      type: Array as PropType<readonly SelectOption[]>, default: () => [],
    },
  }, emits: {
    "update:modelValue": (_value: string) => true,
  }, setup: (p, { emit }) => () => h("select", {
    class: "t-select", value: p.modelValue, onChange: (e: Event) => { emit("update:modelValue", (e.target as HTMLSelectElement).value) },
  }, p.options.map(o => h("option", {
    key: o.value, value: o.value, selected: o.value === p.modelValue, disabled: o.disabled,
  }, o.label))),
})
