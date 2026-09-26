import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { MessageStatus, MessageReceipt } from "../contracts/index.ts"
import { receiptRows } from "../contracts/index.ts"
import { TBadge } from "../atoms/TBadge.ts"
import { TButton } from "../atoms/TButton.ts"
import { TTimestamp } from "../atoms/TTimestamp.ts"

export const ReceiptTable = defineComponent({
  name: "ReceiptTable", props: {
    status: {
      type: Object as PropType<MessageStatus>, required: true,
    },
  }, emits: {
    inspect: (_receipt: MessageReceipt) => true,
  }, setup: (p, { emit }) => () => h("div", {
    class: "t-table-wrap", tabindex: 0, role: "region", "aria-label": "Recipient receipts",
  }, [
    h("table", {
      class: "t-table",
    }, [
      h("caption", {
        class: "sr-only",
      }, "Independent recipient delivery records"), h("thead", [
        h("tr", [
          "Recipient", "State", "Enqueued", "Read", "Acked", "Sequence", "",
        ].map(x => h("th", {
          scope: "col",
        }, x))),
      ]), h("tbody", receiptRows(p.status).map(({ recipient, receipt: r }) => h("tr", {
        key: recipient,
      }, [
        h("td", {
          class: "mono",
        }, recipient), h("td", r ? h(TBadge, {
          value: r.state,
        }) : h("span", {
          class: "small dim",
        }, "Not recorded")), h("td", r ? h(TTimestamp, {
          value: r.enqueuedAt,
        }) : "—"), h("td", r?.readAt ? h(TTimestamp, {
          value: r.readAt,
        }) : "—"), h("td", r?.ackedAt ? h(TTimestamp, {
          value: r.ackedAt,
        }) : "—"), h("td", {
          class: "mono muted",
        }, r?.seq === undefined ? "—" : String(r.seq)), h("td", r ? h(TButton, {
          size: "sm", intent: "ghost", onClick: () => { emit("inspect", r) }, "aria-label": `Inspect receipt for ${recipient}`,
        }, () => "Details") : undefined),
      ]))),
    ]),
  ]),
})
