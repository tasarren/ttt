import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { BoardMessage } from "../contracts/index.ts"
import { TBadge } from "../atoms/TBadge.ts"
import { TTimestamp } from "../atoms/TTimestamp.ts"
import { TButton } from "../atoms/TButton.ts"
import { MessageBody } from "./MessageBody.ts"

export const MessageCard = defineComponent({
  name: "MessageCard", props: {
    message: {
      type: Object as PropType<BoardMessage>, required: true,
    }, ordinal: Number,
  }, emits: {
    inspect: (_id: string) => true, parent: (_id: string) => true,
  }, setup: (p, { emit, slots }) => () => h("article", {
    class: "t-message", "data-message-id": p.message.messageId,
  }, [
    h("header", {
      class: "t-message-head",
    }, [
      h("div", {
        class: "stack", style: {
          gap: "6px",
        },
      }, [
        h("div", {
          class: "row wrap",
        }, [
          h("strong", p.message.from), h("span", {
            class: "small muted",
          }, "→ " + p.message.recipients.join(", ")),
        ]), h("div", {
          class: "row wrap", style: {
            gap: "7px",
          },
        }, [
          h(TBadge, {
            value: p.message.kind,
          }), p.message.priority === "urgent" ? h(TBadge, {
            value: "urgent",
          }) : null, p.message.replyExpected ? h(TBadge, {
            tone: "amber", value: "reply expected",
          }) : null,
        ]),
      ]), h("div", {
        class: "row",
      }, [
        p.ordinal ? h("span", {
          class: "small dim mono",
        }, `#${p.ordinal}`) : null, h(TTimestamp, {
          value: p.message.timestamp,
        }),
      ]),
    ]), h(MessageBody, {
      body: p.message.body,
    }), h("footer", {
      class: "t-message-foot",
    }, [
      p.message.inReplyTo ? h(TButton, {
        intent: "ghost", size: "sm", onClick: () => { emit("parent", p.message.inReplyTo!) },
      }, () => "↑ In reply to " + p.message.inReplyTo!.slice(-8)) : h("span", {
        class: "small dim",
      }, "Thread root"), h("div", {
        class: "grow",
      }), slots["receipts"]?.(), h(TButton, {
        intent: "ghost", size: "sm", onClick: () => { emit("inspect", p.message.messageId) },
      }, () => "Inspect message"),
    ]),
  ]),
})
