import { defineComponent, h } from "vue"
import { ThreadReader, TButton, TInspector, TIdentifier, TBadge, TEmptyState, orderedMessages  } from "@ttt/ui"
import { pageProps, pageEmits, boardFor, shell, heading, inspector, goMessage } from "../shared.ts"

export const ThreadPage = defineComponent({
  name: "ThreadPage", props: pageProps, emits: pageEmits, setup: (p, { emit }) => () => {
    const board = boardFor(p)
    const id = p.entityId || Object.keys(board?.threads || {})[0] || ""
    const index = board?.threads[id] || []
    const messages = orderedMessages(index, board?.messages || [])
    const root = messages.find(m => m.messageId === id)
    if (!board || !index.length)
      return shell(p, emit, "boards", h(TEmptyState, {
        title: "Thread not recorded",
      }), null)
    return shell(p, emit, "boards", h("div", {
      class: "stack",
    }, [
      heading(root ? root.subject || "Untitled thread" : "Thread root not recorded", `${board.name} / ${index.length} messages`, () => h(TButton, {
        size: "sm", onClick: () => { emit("navigate", `/boards/${board.name}`) },
      }, () => "Back to board")), h(ThreadReader, {
        key: id, index, messages: board.messages, onInspect: (mid: string) => { emit("navigate", goMessage(board.name, mid)) },
      }),
    ]), inspector("Thread details", [
      h(TIdentifier, {
        value: id,
      }), h(TInspector, {
        items: [
          {
            label: "root sender", value: root?.from,
          }, {
            label: "recipients", value: root?.recipients,
          }, {
            label: "priority", value: root?.priority,
          }, {
            label: "replyExpected", value: root?.replyExpected,
          }, {
            label: "messages", value: index.length,
          }, {
            label: "not recorded", value: index.length - messages.length,
          },
        ],
      }), h("h3", "Append order"), h("div", {
        class: "stack", style: {
          gap: "6px",
        },
      }, index.map((mid, i) => h(TButton, {
        size: "sm", intent: "ghost", onClick: () => { emit("navigate", goMessage(board.name, mid)) }, style: {
          justifyContent: "start",
        },
      }, () => `${i + 1}. ${board.messages.find(m => m.messageId === mid)?.from || "Not recorded"} · ${mid.slice(-8)}`))), h(TBadge, {
        tone: "mint", value: "Live · preserves reading position",
      }), h("p", {
        class: "small dim",
      }, "ThreadIndex controls order. Receipt state always belongs to a specific recipient, not to this page."),
    ]))
  },
})
