import { defineComponent, h, ref, watch } from "vue"
import type { MessageReceipt } from "@ttt/ui"
import { summarizeReceipts, MessageCard, MessageInspector, ReceiptTable, ReceiptInspector, MailboxSummary, TSurface, TTabs, TButton, TNotice, TEmptyState  } from "@ttt/ui"
import { pageProps, pageEmits, boardFor, shell, heading, inspector, goThread } from "../shared.ts"

export const MessagePage = defineComponent({
  name: "MessagePage", props: pageProps, emits: pageEmits, setup(p, { emit }) {
    const selected = ref<string>()
    const tab = ref("message")
    watch(() => p.entityId, () => {
      selected.value = undefined
      tab.value = "message"
    })
    return () => {
      const board = boardFor(p)
      const message = board?.messages.find(m => m.messageId === p.entityId) || (!p.entityId ? board?.messages[0] : undefined)
      if (!board || !message)
        return shell(p, emit, "boards", h(TEmptyState, {
          title: "Message not recorded", detail: "The source record is unavailable in this snapshot.",
        }), null)
      const receipts = board.receipts.filter(r => r.messageId === message.messageId)
      const receipt = receipts.find(r => r.recipient === selected.value)
      return shell(p, emit, "boards", h("div", {
        class: "stack",
      }, [
        heading(message.subject || "Reply details", board.name, () => h(TButton, {
          onClick: () => { emit("navigate", goThread(board.name, message.threadId)) },
        }, () => "Open thread")), h(MessageCard, {
          message, onInspect: () => {
            tab.value = "message"
          },
        }), h(TSurface, {
          title: "Recipient receipts", padded: false,
        }, () => h(ReceiptTable, {
          status: {
            message, receipts,
          }, onInspect: (r: MessageReceipt) => {
            selected.value = r.recipient
            tab.value = "receipt"
          },
        })), receipts.length < message.recipients.length ? h(TNotice, {
          tone: "amber",
        }, () => `${message.recipients.length - receipts.length} intended recipient receipts are not recorded.`) : null, h(TSurface, {
          title: "Current recipient state",
        }, () => h(MailboxSummary, {
          summary: summarizeReceipts(receipts),
        })),
      ]), inspector("Record inspector", [
        h(TTabs, {
          modelValue: tab.value, tabs: [
            {
              value: "message", label: "Message",
            }, {
              value: "receipt", label: "Receipt", disabled: !receipt,
            },
          ], "onUpdate:modelValue": (v: string) => {
            tab.value = v
          },
        }), tab.value === "receipt" && receipt ? h(ReceiptInspector, {
          receipt,
        }) : h(MessageInspector, {
          message,
        }),
      ]))
    }
  },
})
