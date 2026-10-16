import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { ReadResult } from "../contracts/index.ts"
import { TInspector } from "../molecules/TInspector.ts"
import { TSourceViewer } from "../molecules/TSourceViewer.ts"
import { TDisclosure } from "../molecules/TDisclosure.ts"

export const ReadResultView = defineComponent({
  name: "ReadResultView", props: {
    result: {
      type: Object as PropType<ReadResult>, required: true,
    },
  }, setup: p => () => h("div", {
    class: "stack",
  }, [
    h(TInspector, {
      items: [
        {
          label: "messages", value: p.result.messages.length,
        }, {
          label: "remaining", value: p.result.remaining,
        }, {
          label: "cancelled", value: p.result.cancelled,
        },
      ],
    }), h("p", {
      class: "small dim",
    }, "Inspection only. The UI does not call Board.read, including peek, because expiry settlement can mutate receipts."), h(TDisclosure, {
      title: "ReadResult source",
    }, () => h(TSourceViewer, {
      value: p.result,
    })),
  ]),
})
