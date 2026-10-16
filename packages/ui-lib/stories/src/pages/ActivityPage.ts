import { defineComponent, h, ref, computed } from "vue"
import type { TimelineEntry } from "@ttt/ui"
import { timeline, ActivityTimeline, TSwitch, TButton, TSearch, TInspector, TNotice, TLiveStatus  } from "@ttt/ui"
import { pageProps, pageEmits, boardFor, shell, heading, inspector, goMessage } from "../shared.ts"

export const ActivityPage = defineComponent({
  name: "ActivityPage", props: pageProps, emits: pageEmits, setup(p, { emit }) {
    const paused = ref(false)
    const query = ref("")
    const frozen = ref<TimelineEntry[]>([])
    const all = computed(() => {
      const b = boardFor(p)
      return b ? timeline(b.messages, b.receipts).reverse() : []
    })
    const freezeCount = ref(0)
    function pause(value: boolean) {
      if (value) {
        frozen.value = all.value
        freezeCount.value = all.value.length
      }

      paused.value = value
    }
    return () => {
      const board = boardFor(p)
      const entries = (paused.value ? frozen.value : all.value).filter(e => `${e.actor} ${e.type} ${e.detail}`.toLowerCase().includes(query.value.toLowerCase()))
      return shell(p, emit, "activity", h("div", {
        class: "stack",
      }, [
        heading("Activity", board?.name || "All records", () => h(TButton, {
          intent: "primary", onClick: () => { emit("step") },
        }, () => "Simulate agent reply")), h("div", {
          class: "row wrap",
        }, [
          h(TSearch, {
            class: "grow", modelValue: query.value, label: "Filter by agent, state or message", "onUpdate:modelValue": (v: string) => {
              query.value = v
            },
          }), h(TSwitch, {
            label: "Pause view", modelValue: paused.value, "onUpdate:modelValue": pause,
          }),
        ]), paused.value ? h(TNotice, {
          tone: "lavender",
        }, () => `${Math.max(0, all.value.length - freezeCount.value)} new records while the view is paused. The connection remains live.`) : null, h(ActivityTimeline, {
          entries: entries.slice(0, 250), onInspect: (id: string) => { emit("navigate", goMessage(board?.name || "alpha", id)) },
        }),
      ]), inspector("Live transport", [
        h(TLiveStatus, {
          state: p.connectionState,
        }), h(TInspector, {
          items: [
            {
              label: "transport", value: "EventSource / SSE",
            }, {
              label: "presentation", value: paused.value ? "paused" : "following",
            }, {
              label: "recorded entries", value: all.value.length,
            }, {
              label: "reconnect policy", value: "fresh snapshot",
            }, {
              label: "durable replay", value: "not part of this adapter",
            },
          ],
        }), h("p", {
          class: "small dim",
        }, "This timeline is projected from recorded timestamps. It is not a guaranteed complete audit log. Mailbox sequence values are not SSE cursor IDs."),
      ]))
    }
  },
})
