import { defineComponent, h, ref } from "vue"
import { ThreadList, TSearch, TCheckbox, TInspector, TBadge, TButton, TDisclosure, TSourceViewer, SchemaLedgerView } from "@ttt/ui"
import { pageProps, pageEmits, boardFor, shell, heading, inspector, goThread } from "../shared.ts"

export const BoardsPage = defineComponent({
  name: "BoardsPage", props: pageProps, emits: pageEmits, setup(p, { emit }) {
    const query = ref("")
    const urgent = ref(false)
    return () => {
      const board = boardFor(p)
      if (!board)
        return shell(p, emit, "boards", heading("No board data"), null)
      const agents = [
        ...new Set(board.messages.flatMap(m => [
          m.from, ...m.recipients,
        ])),
      ]
      return shell(p, emit, "boards", h("div", {
        class: "stack",
      }, [
        heading(board.name, "Threads and messages", () => h(TButton, {
          onClick: () => { emit("step") }, intent: "primary",
        }, () => "Simulate agent reply")), h("div", {
          class: "t-filterbar", style: {
            marginBottom: "6px",
          },
        }, [
          h(TSearch, {
            class: "grow", modelValue: query.value, label: "Search threads or agents", "onUpdate:modelValue": (v: string) => {
              query.value = v
            },
          }), h(TCheckbox, {
            label: "Urgent only", modelValue: urgent.value, "onUpdate:modelValue": (v: boolean) => {
              urgent.value = v
            },
          }),
        ]), h(ThreadList, {
          messages: board.messages, threads: board.threads, query: query.value, urgent: urgent.value, onSelect: (id: string) => { emit("navigate", goThread(board.name, id)) },
        }),
      ]), inspector("Board context", [
        h(TInspector, {
          items: [
            {
              label: "session", value: board.name,
            }, {
              label: "threads", value: Object.keys(board.threads).length,
            }, {
              label: "messages", value: board.messages.length,
            }, {
              label: "recipients", value: agents.length,
            },
          ],
        }), h("h3", "Participants"), h("div", {
          class: "row wrap",
        }, agents.map(agent => h(TButton, {
          size: "sm", intent: "ghost", onClick: () => { emit("navigate", `/agents/${board.name}/${agent}`) },
        }, () => agent))), h("h3", "Board schema"), h(SchemaLedgerView, {
          ledger: board.ledger,
        }), h(TDisclosure, {
          title: "Thread index records",
        }, () => h(TSourceViewer, {
          value: board.threads,
        })), h(TBadge, {
          value: "Read-only messages", tone: "mint",
        }),
      ]))
    }
  },
})
