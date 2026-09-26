import { defineComponent, h, ref } from "vue"
import { TButton } from "../atoms/TButton.ts"

export const AppShell = defineComponent({
  name: "AppShell", props: {
    compact: Boolean,
  }, setup(p, { slots }) {
    const contextOpen = ref(false)
    return () => h("div", {
      class: "ttt t-shell", "data-density": p.compact ? "compact" : "comfortable",
    }, [
      h("a", {
        href: "#ttt-main", class: "sr-only", onFocus: (e: FocusEvent) => { (e.target as HTMLElement).classList.remove("sr-only") }, onBlur: (e: FocusEvent) => { (e.target as HTMLElement).classList.add("sr-only") },
      }, "Skip to content"), slots["topbar"]?.(), h(TButton, {
        class: "t-mobile-toggle", intent: "ghost", "aria-expanded": contextOpen.value, onClick: () => {
          contextOpen.value = !contextOpen.value
        },
      }, () => contextOpen.value ? "Hide navigation" : "Show navigation"), h("div", {
        class: "t-shell-grid",
      }, [
        h("aside", {
          class: [
            "t-sidebar", contextOpen.value && "is-open",
          ], "aria-label": "Context navigation",
        }, slots["sidebar"]?.()), h("main", {
          id: "ttt-main", class: "t-main", tabindex: -1,
        }, slots["default"]?.()), h("aside", {
          class: "t-right", "aria-label": "Context inspector",
        }, slots["inspector"]?.()),
      ]),
    ])
  },
})
