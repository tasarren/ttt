import { defineComponent, h } from "vue"
import type { PropType } from "vue"

export type Tone = "mint" | "sage" | "pink" | "lavender" | "amber" | "coral" | "neutral"
export const stateTones: Record<string, Tone> = {
  unread: "pink", read: "lavender", acked: "sage", superseded: "lavender", cancelled: "coral", urgent: "coral", normal: "neutral", message: "neutral", reply: "lavender", broadcast: "amber", ok: "sage", warn: "amber", fail: "coral",
}
export const TBadge = defineComponent({
  name: "TBadge", props: {
    value: String, tone: String as PropType<Tone>, dot: Boolean,
  }, setup: (p, { slots }) => () => h("span", {
    class: "t-badge", "data-tone": p.tone || stateTones[p.value || ""] || "neutral",
  }, [
    p.dot ? h("span", {
      class: "t-dot", "aria-hidden": "true",
    }) : null, slots["default"]?.() || p.value,
  ]),
})
