import { defineComponent, h, ref } from "vue"
import { TButton } from "../atoms/TButton.ts"

export const AppShell = defineComponent({
  name: "AppShell", props: {
    compact: Boolean,
  }, setup(p, { slots }) {
    const contextOpen = ref(false)
    const detailsOpen = ref(false)
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
        }, [
          h("div", { class: "t-details-bar" }, h(TButton, {
            size: "sm", intent: "ghost", "aria-controls": "ttt-details", "aria-expanded": detailsOpen.value,
            onClick: () => { detailsOpen.value = !detailsOpen.value },
          }, () => "Details")), slots["default"]?.(),
        ]), h("aside", {
          id: "ttt-details", class: ["t-right", detailsOpen.value && "is-open"], "aria-label": "Details",
          "aria-hidden": !detailsOpen.value, inert: !detailsOpen.value,
        }, [
          h(TButton, { size: "sm", intent: "ghost", onClick: () => { detailsOpen.value = false } }, () => "Close details"),
          slots["inspector"]?.(),
        ]),
      ]),
    ])
  },
})
