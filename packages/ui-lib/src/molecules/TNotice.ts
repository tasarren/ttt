import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { Tone } from "../atoms/TBadge.ts"

export const TNotice = defineComponent({
  name: "TNotice", props: {
    tone: {
      type: String as PropType<Tone>, default: "amber",
    }, title: String,
  }, setup: (p, { slots }) => () => h("div", {
    class: "t-notice", "data-tone": p.tone, role: p.tone === "coral" ? "alert" : "status",
  }, [
    p.title ? h("strong", p.title) : null, slots["default"]?.(),
  ]),
})
