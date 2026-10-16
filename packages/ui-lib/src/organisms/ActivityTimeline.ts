import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { TimelineEntry } from "../contracts/index.ts"
import { TTimestamp } from "../atoms/TTimestamp.ts"
import { TButton } from "../atoms/TButton.ts"
import { TBadge, stateTones } from "../atoms/TBadge.ts"
import { TEmptyState } from "../molecules/TEmptyState.ts"

export const ActivityTimeline = defineComponent({
  name: "ActivityTimeline", props: {
    entries: {
      type: Array as PropType<readonly TimelineEntry[]>, required: true,
    }, compact: Boolean,
  }, emits: {
    inspect: (_id: string) => true,
  }, setup: (p, { emit }) => () => p.entries.length ? h("div", {
    class: "t-timeline", role: "list", "aria-label": "Recorded activity",
  }, p.entries.map(e => h("div", {
    class: "t-event", role: "listitem", key: e.id,
  }, [
    h("span", {
      class: "t-dot", "data-tone": stateTones[e.type] || "mint", "aria-hidden": "true",
    }), h(TTimestamp, {
      value: e.timestamp,
    }), h("div", [
      h("div", {
        class: "row wrap between",
      }, [
        h("strong", {
          class: "small mono",
        }, e.actor), h(TBadge, {
          value: e.type,
        }),
      ]), e.detail ? h("p", e.detail) : null, !p.compact ? h(TButton, {
        size: "sm", intent: "ghost", onClick: () => { emit("inspect", e.messageId) },
      }, () => "Open message") : null,
    ]),
  ]))) : h(TEmptyState, {
    title: "No recorded activity",
  }),
})
