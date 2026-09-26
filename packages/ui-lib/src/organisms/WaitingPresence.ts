import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { Presence, WaitStreak } from "../contracts/index.ts"
import { TInspector } from "../molecules/TInspector.ts"
import { TBadge } from "../atoms/TBadge.ts"

export const WaitingPresence = defineComponent({
  name: "WaitingPresence", props: {
    presence: Object as PropType<Presence | undefined>, streak: Object as PropType<WaitStreak | undefined>,
  }, setup: p => () => h("div", {
    class: "stack",
  }, [
    h("div", [
      h(TBadge, {
        tone: p.presence ? "amber" : "neutral", value: p.presence ? "Waiting for a message" : "No waiting record",
      }),
    ]), h(TInspector, {
      items: [
        {
          label: "pid", value: p.presence?.pid,
        }, {
          label: "since", value: p.presence?.since,
        }, {
          label: "expect", value: p.presence?.expect,
        }, {
          label: "emptyStreak", value: p.streak?.emptyStreak,
        }, {
          label: "updatedAt", value: p.streak?.updatedAt,
        },
      ],
    }), h("p", {
      class: "small dim",
    }, "A waiting record describes a process blocked in --wait, not online presence."),
  ]),
})
