import { defineComponent, h, ref, useId } from "vue"
import type { PropType } from "vue"

export interface Tab {
  value: string
  label: string
  disabled?: boolean
}
export const TTabs = defineComponent({
  name: "TTabs", props: {
    modelValue: {
      type: String, required: true,
    }, tabs: {
      type: Array as PropType<readonly Tab[]>, required: true,
    }, label: {
      type: String, default: "Views",
    },
  }, emits: {
    "update:modelValue": (_value: string) => true,
  }, setup(p, { emit }) {
    const root = ref<HTMLElement>()
    const id = useId()
    function key(e: KeyboardEvent) {
      const available = p.tabs.filter(t => !t.disabled)
      let index = available.findIndex(t => t.value === p.modelValue)
      if (e.key === "ArrowRight")
        index = (index + 1) % available.length
      else if (e.key === "ArrowLeft")
        index = (index - 1 + available.length) % available.length
      else if (e.key === "Home")
        index = 0
      else if (e.key === "End")
        index = available.length - 1
      else
        return
      e.preventDefault()
      const value = available[index]?.value
      if (value) {
        emit("update:modelValue", value)
        root.value?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(value)}"]`)?.focus()
      }
    }
    return () => h("div", {
      ref: root, class: "t-tabs", role: "tablist", "aria-label": p.label, onKeydown: key,
    }, p.tabs.map(tab => h("button", {
      type: "button", class: "t-tab", id: id + tab.value, role: "tab", "aria-selected": p.modelValue === tab.value, "data-value": tab.value, disabled: tab.disabled, tabindex: p.modelValue === tab.value ? 0 : -1, onClick: () => { emit("update:modelValue", tab.value) },
    }, tab.label)))
  },
})
