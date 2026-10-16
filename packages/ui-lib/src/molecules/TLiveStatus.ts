import { defineComponent, h } from "vue"
import type { PropType } from "vue"

export type ConnectionState = "connecting" | "live" | "reconnecting" | "disconnected" | "paused"
export const TLiveStatus = defineComponent({
  name: "TLiveStatus", props: {
    state: {
      type: String as PropType<ConnectionState>, default: "live",
    },
  }, setup: p => () => h("span", {
    class: "t-live", "data-tone": p.state === "live" ? "mint" : p.state === "disconnected" ? "coral" : p.state === "paused" ? "lavender" : "amber", role: "status",
  }, [
    h("span", {
      class: "t-dot", "aria-hidden": "true",
    }), {
      live: "Live", connecting: "Connecting", reconnecting: "Reconnecting", disconnected: "Disconnected", paused: "View paused",
    }[p.state],
  ]),
})
