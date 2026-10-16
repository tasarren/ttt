import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { InboxSummary } from "../contracts/index.ts"
import { receiptStates } from "../contracts/index.ts"
import { TBadge } from "../atoms/TBadge.ts"
import { TCount } from "../atoms/TCount.ts"

export const MailboxSummary = defineComponent({
  name: "MailboxSummary", props: {
    summary: {
      type: Object as PropType<InboxSummary>, required: true,
    },
  }, setup: p => () => h("div", receiptStates.map(state => h("div", {
    key: state, class: "t-mailbox-count",
  }, [
    h(TBadge, {
      value: state,
    }), h(TCount, {
      value: p.summary[state], label: state,
    }),
  ]))),
})
