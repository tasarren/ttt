import { defineComponent, h, ref, watch, nextTick } from "vue"
import type { PropType } from "vue"
import type { BoardMessage } from "../contracts/index.ts"
import { orderedMessages } from "../contracts/index.ts"
import { MessageCard } from "./MessageCard.ts"
import { TNotice } from "../molecules/TNotice.ts"
import { TEmptyState } from "../molecules/TEmptyState.ts"

export const ThreadReader = defineComponent({
  name: "ThreadReader", props: {
    messages: {
      type: Array as PropType<readonly BoardMessage[]>, required: true,
    }, index: {
      type: Array as PropType<readonly string[]>, required: true,
    },
  }, emits: {
    inspect: (_id: string) => true,
  }, setup(p, { emit }) {
    const viewport = ref<HTMLElement>()
    const pending = ref(0)
    const atBottom = ref(true)
    function scroll() {
      const e = viewport.value
      if (e)
        atBottom.value = e.scrollHeight - e.scrollTop - e.clientHeight < 60
      if (atBottom.value)
        pending.value = 0
    }
    async function latest() {
      await nextTick()
      if (viewport.value)
        viewport.value.scrollTop = viewport.value.scrollHeight
      pending.value = 0
      atBottom.value = true
    }
    watch(() => p.index.length, async(n, old) => {
      if (n < old) {
        pending.value = 0
        return
      }
      if (atBottom.value)
        await latest()
      else
        pending.value += n - old
    })
    function parent(id: string) {
      const element = viewport.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`)
      element?.scrollIntoView({
        block: "center",
      })
    }
    return () => {
      const ordered = orderedMessages(p.index, p.messages)
      const missing = p.index.length - ordered.length
      return h("div", {
        class: "stack",
      }, [
        missing ? h(TNotice, {
          tone: "amber",
        }, () => `${missing} message records are not available. Thread order is preserved.`) : null, h("div", {
          ref: viewport, onScroll: scroll, class: "stack", style: {
            maxHeight: "calc(100vh - 240px)", overflowY: "auto", padding: "3px",
          }, tabindex: 0, role: "region", "aria-label": "Thread conversation",
        }, ordered.length ? ordered.map(m => h(MessageCard, {
          key: m.messageId, message: m, ordinal: p.index.indexOf(m.messageId) + 1, onInspect: (id: string) => { emit("inspect", id) }, onParent: parent,
        })) : [
          h(TEmptyState, {
            title: "No messages recorded",
          }),
        ]), pending.value ? h("button", {
          class: "t-live-insert", onClick: latest, type: "button",
        }, `${pending.value} new messages · Show latest`) : null,
      ])
    }
  },
})
