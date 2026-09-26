import { defineComponent, h } from "vue"
import type { PropType } from "vue"

export const TButton = defineComponent({
  name: "TButton",
  props: {
    intent: {
      type: String as PropType<"primary" | "secondary" | "ghost" | "danger">, default: "secondary",
    },
    size: {
      type: String as PropType<"sm" | "md" | "lg">, default: "md",
    },
    disabled: Boolean, loading: Boolean,
    type: {
      type: String as PropType<"button" | "submit" | "reset">, default: "button",
    },
  },
  setup(p, { slots }) {
    return () => h("button", {
      type: p.type, class: "t-button", "data-intent": p.intent, "data-size": p.size, disabled: p.disabled || p.loading, "aria-busy": p.loading || undefined,
    }, p.loading ? "Saving…" : slots["default"]?.())
  },
})
