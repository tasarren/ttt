import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { SchemaLedger } from "../contracts/index.ts"
import { TInspector } from "../molecules/TInspector.ts"

export const SchemaLedgerView = defineComponent({
  name: "SchemaLedgerView", props: {
    ledger: Object as PropType<SchemaLedger | undefined>,
  }, setup: p => () => h("div", {
    class: "stack",
  }, [
    h(TInspector, {
      items: [
        {
          label: "SchemaLedger.version", value: p.ledger?.version,
        }, {
          label: "BoardMessage writer", value: 7,
        }, {
          label: "MessageReceipt", value: 1,
        }, {
          label: "SessionRecord", value: 1,
        }, {
          label: "LayoutFile", value: 1,
        },
      ],
    }), h("p", {
      class: "small dim",
    }, p.ledger ? "Recorded board version. No migration history is inferred." : "Old boards may have no ledger. Absence is not version zero."),
  ]),
})
