import { defineComponent, h, ref } from "vue"
import { summarizeReceipts, TSearch, TButton, TBadge, TSurface, TInspector, TDisclosure, MailboxSummary, WaitingPresence, NotificationBatch, ReadResultView  } from "@ttt/ui"
import { pageProps, pageEmits, boardFor, shell, heading, inspector, goMessage } from "../shared.ts"

export const AgentsPage = defineComponent({
  name: "AgentsPage", props: pageProps, emits: pageEmits, setup(p, { emit }) {
    const query = ref("")
    return () => {
      const board = boardFor(p)
      if (!board)
        return shell(p, emit, "agents", heading("No board data"), null)
      const agents = [
        ...new Set(board.messages.flatMap(m => [
          m.from, ...m.recipients,
        ])),
      ].sort()
      const selected = p.entityId || "reviewer"
      const receipts = board.receipts.filter(r => r.recipient === selected)
      return shell(p, emit, "agents", h("div", {
        class: "stack",
      }, [
        heading("Agents", `Mailbox scope: ${board.name}`), h(TSearch, {
          modelValue: query.value, label: "Search agents", "onUpdate:modelValue": (v: string) => {
            query.value = v
          },
        }), h(TSurface, {
          padded: false,
        }, () => h("div", {
          class: "t-table-wrap", tabindex: 0,
        }, [
          h("table", {
            class: "t-table",
          }, [
            h("thead", [
              h("tr", [
                "Agent", "Unread", "Read", "Acked", "Superseded", "Cancelled", "Waiting record",
              ].map(s => h("th", {
                scope: "col",
              }, s))),
            ]), h("tbody", agents.filter(a => a.includes(query.value)).map(agent => {
              const counts = summarizeReceipts(board.receipts.filter(r => r.recipient === agent))
              return h("tr", {
                "data-selected": selected === agent,
              }, [
                h("td", h(TButton, {
                  intent: "ghost", size: "sm", onClick: () => { emit("navigate", `/agents/${board.name}/${agent}`) },
                }, () => agent)), ...Object.values(counts).map(n => h("td", {
                  class: "mono muted",
                }, String(n))), h("td", h(TBadge, {
                  value: board.presences[agent] ? "waiting" : "not recorded", tone: board.presences[agent] ? "amber" : "neutral",
                })),
              ])
            })),
          ]),
        ])), h("h2", `${selected} · mailbox records`), h("div", {
          class: "t-surface",
        }, receipts.slice(0, 12).map(r => h("div", {
          class: "row between", style: {
            padding: "12px 16px", borderBottom: "1px solid var(--ttt-border)",
          },
        }, [
          h(TButton, {
            intent: "ghost", size: "sm", onClick: () => { emit("navigate", goMessage(board.name, r.messageId)) },
          }, () => board.messages.find(m => m.messageId === r.messageId)?.subject || "Reply · " + r.messageId.slice(-8)), h(TBadge, {
            value: r.state,
          }),
        ]))),
      ]), inspector(selected, [
        h(WaitingPresence, {
          presence: board.presences[selected], streak: board.streaks[selected],
        }), h("h3", "Inbox summary"), h(MailboxSummary, {
          summary: summarizeReceipts(receipts),
        }), h(TInspector, {
          items: [
            {
              label: "UnreadCounter.count", value: board.counters[selected]?.count,
            }, {
              label: "SequenceCounter.next", value: board.sequenceCounters[selected]?.next,
            },
          ],
        }), h(TDisclosure, {
          title: "Notification records",
        }, () => h(NotificationBatch, {
          marker: board.notifications[selected], summary: board.notificationSummaries[selected],
        })), board.readResults[selected] ? h(TDisclosure, {
          title: "ReadResult specimen",
        }, () => h(ReadResultView, {
          result: board.readResults[selected]!,
        })) : null,
      ]))
    }
  },
})
