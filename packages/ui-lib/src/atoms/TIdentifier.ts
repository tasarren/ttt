import { defineComponent, h, ref } from "vue"
import type { PropType } from "vue"

export const TIdentifier = defineComponent({
  name: "TIdentifier", props: {
    value: String as PropType<string | undefined>, short: Boolean, copy: {
      type: Boolean, default: true,
    },
  }, setup(p) {
    const result = ref("")
    async function copy() {
      try {
        await navigator.clipboard.writeText(p.value || "")
        result.value = "Copied"
      }
      catch {
        result.value = "Copy unavailable"
      }
    }
    return () => h("span", {
      class: "t-id",
    }, [
      h("span", {
        title: p.value,
      }, p.value ? p.short && p.value.length > 20 ? "…" + p.value.slice(-16) : p.value : "Not recorded"), p.copy && p.value ? h("button", {
        class: "t-copy", onClick: copy, "aria-label": "Copy identifier",
      }, "Copy") : null, h("span", {
        class: "sr-only", role: "status",
      }, result.value),
    ])
  },
})
