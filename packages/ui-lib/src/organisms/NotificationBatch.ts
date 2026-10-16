import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { NotificationMarker, NotificationSummary } from "../contracts/index.ts"
import { TInspector } from "../molecules/TInspector.ts"
import { TDisclosure } from "../molecules/TDisclosure.ts"

export const NotificationBatch = defineComponent({
  name: "NotificationBatch", props: {
    marker: Object as PropType<NotificationMarker | undefined>, summary: Object as PropType<NotificationSummary | undefined>,
  }, setup: p => () => h("div", {
    class: "stack",
  }, [
    h("h3", "Notification batch"), h(TInspector, {
      items: [
        "target", "createdAt", "delaySeconds", "token",
      ].map(key => ({
        label: key, value: p.marker?.[key as keyof NotificationMarker],
      })),
    }), h(TDisclosure, {
      title: "Delivery callback payload",
    }, () => h(TInspector, {
      items: [
        "target", "newCount", "unreadTotal", "senders",
      ].map(key => ({
        label: key, value: p.summary?.[key as keyof NotificationSummary],
      })),
    })),
  ]),
})
