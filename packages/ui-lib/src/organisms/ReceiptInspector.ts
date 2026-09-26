import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { MessageReceipt } from "../contracts/index.ts"
import { TInspector } from "../molecules/TInspector.ts"
import { TBadge } from "../atoms/TBadge.ts"
import { TDisclosure } from "../molecules/TDisclosure.ts"
import { TSourceViewer } from "../molecules/TSourceViewer.ts"

const fields = [
  "receiptVersion", "messageId", "recipient", "seq", "enqueuedAt", "notifiedAt", "readAt", "ackedAt", "ackNote", "supersededAt", "supersededBy", "cancelledAt", "cancelledBy", "readBy", "ackedBy",
] as const
export const ReceiptInspector = defineComponent({
  name: "ReceiptInspector", props: {
    receipt: {
      type: Object as PropType<MessageReceipt>, required: true,
    },
  }, setup: p => () => h("div", {
    class: "stack",
  }, [
    h(TBadge, {
      value: p.receipt.state,
    }), h(TInspector, {
      items: fields.map(k => ({
        label: k, value: p.receipt[k],
      })),
    }), h(TDisclosure, {
      title: "Source JSON",
    }, () => h(TSourceViewer, {
      value: p.receipt,
    })),
  ]),
})
