import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { BoardMessage } from "../contracts/index.ts"
import { TInspector } from "../molecules/TInspector.ts"
import { TDisclosure } from "../molecules/TDisclosure.ts"
import { TSourceViewer } from "../molecules/TSourceViewer.ts"

const fields = [
  "boardVersion", "messageId", "threadId", "kind", "timestamp", "from", "recipients", "replyExpected", "priority", "subject", "inReplyTo", "replaceKey", "expiresAt",
] as const
export const MessageInspector = defineComponent({
  name: "MessageInspector", props: {
    message: {
      type: Object as PropType<BoardMessage>, required: true,
    },
  }, setup: p => () => h("div", {
    class: "stack",
  }, [
    h(TInspector, {
      items: fields.map(key => ({
        label: key, value: p.message[key],
      })),
    }), h(TDisclosure, {
      title: "Complete source record",
    }, () => h(TSourceViewer, {
      value: p.message,
    })),
  ]),
})
