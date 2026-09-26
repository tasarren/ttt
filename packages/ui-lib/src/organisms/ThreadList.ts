import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { BoardMessage } from "../contracts/index.ts"
import { threadSummaries } from "../contracts/index.ts"
import { TBadge } from "../atoms/TBadge.ts"
import { TTimestamp } from "../atoms/TTimestamp.ts"
import { TEmptyState } from "../molecules/TEmptyState.ts"

export const ThreadList = defineComponent({
  name: "ThreadList", props: {
    messages: {
      type: Array as PropType<readonly BoardMessage[]>, required: true,
    }, threads: {
      type: Object as PropType<Record<string, string[]>>, required: true,
    }, query: {
      type: String, default: "",
    }, urgent: Boolean, selected: String,
  }, emits: {
    select: (_id: string) => true,
  }, setup: (p, { emit }) => () => {
    const rows = threadSummaries(p.messages, p.threads).filter(t => (!p.urgent || t.root?.priority === "urgent") && `${t.root?.subject || ""} ${t.root?.body || ""} ${t.participants.join(" ")}`.toLowerCase().includes(p.query.toLowerCase()))
    return rows.length ? h("div", {
      class: "t-surface", role: "list", "aria-label": "Threads",
    }, rows.map(t => h("div", {
      role: "listitem", key: t.id,
    }, [
      h("button", {
        type: "button", class: "t-thread-row", "data-selected": p.selected === t.id, onClick: () => { emit("select", t.id) },
      }, [
        h("div", {
          class: "row between",
        }, [
          h("h3", t.root ? t.root.subject || "Untitled thread" : "Root message not recorded"), t.root?.priority === "urgent" ? h(TBadge, {
            value: "urgent",
          }) : null,
        ]), h("p", t.root?.body.slice(0, 140) || "Available replies can still be inspected."), h("div", {
          class: "t-thread-meta",
        }, [
          h("span", `${t.root?.from || "Unknown sender"} → ${t.root?.recipients.join(", ") || ""}`), h("span", {
            class: "row", style: {
              gap: "14px",
            },
          }, [
            h("span", `${t.count} messages`), t.missing.length ? h(TBadge, {
              tone: "amber", value: `${t.missing.length} not recorded`,
            }) : null, t.last ? h(TTimestamp, {
              value: t.last.timestamp,
            }) : null,
          ]),
        ]),
      ]),
    ]))) : h(TEmptyState, {
      title: "No matching threads", detail: "Change the search or priority filter.",
    })
  },
})
