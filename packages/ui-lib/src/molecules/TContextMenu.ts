import { defineComponent, h, ref, onMounted, onBeforeUnmount, nextTick } from "vue"
import type { PropType } from "vue"
import { TButton } from "../atoms/TButton.ts"

export interface MenuItem {
  id: string
  label: string
  disabled?: boolean
}
export const TContextMenu = defineComponent({
  name: "TContextMenu", props: {
    items: {
      type: Array as PropType<readonly MenuItem[]>, required: true,
    }, label: {
      type: String, default: "More",
    },
  }, emits: {
    select: (_id: string) => true,
  }, setup(p, { emit }) {
    const open = ref(false)
    const root = ref<HTMLElement>()
    function close(e: Event) {
      if (!root.value?.contains(e.target as Node))
        open.value = false
    }
    onMounted(() => { document.addEventListener("pointerdown", close) })
    onBeforeUnmount(() => { document.removeEventListener("pointerdown", close) })
    async function toggle() {
      open.value = !open.value
      if (open.value) {
        await nextTick()
        root.value?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus()
      }
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        open.value = false
        root.value?.querySelector<HTMLButtonElement>("button")?.focus()
      }
      if (![
        "ArrowDown", "ArrowUp", "Home", "End",
      ].includes(e.key))
        return
      const items = [
        ...root.value!.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)"),
      ]
      if (!items.length)
        return
      e.preventDefault()
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
    }
    return () => h("div", {
      ref: root, class: "t-menu", onKeydown: key,
    }, [
      h(TButton, {
        size: "sm", "aria-haspopup": "menu", "aria-expanded": open.value, onClick: toggle,
      }, () => p.label), open.value ? h("div", {
        class: "t-menu-list", role: "menu", "aria-label": p.label,
      }, p.items.map(item => h("button", {
        type: "button", role: "menuitem", disabled: item.disabled, onClick: () => {
          emit("select", item.id)
          open.value = false
          root.value?.querySelector<HTMLButtonElement>("button")?.focus()
        },
      }, item.label))) : null,
    ])
  },
})
