import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import { TBrand } from "../atoms/TBrand.ts"
import { TLiveStatus } from "../molecules/TLiveStatus.ts"
import type { ConnectionState } from "../molecules/TLiveStatus.ts"

export interface NavItem {
  id: string
  label: string
  href: string
}
export const TTopBar = defineComponent({
  name: "TTopBar", props: {
    items: {
      type: Array as PropType<readonly NavItem[]>, required: true,
    }, active: String, state: {
      type: String as PropType<ConnectionState>, default: "live",
    }, logoSrc: String,
  }, emits: {
    navigate: (_href: string) => true,
  }, setup: (p, { emit, slots }) => () => h("header", {
    class: "t-topbar",
  }, [
    h(TBrand, {
      ...(p.logoSrc === undefined ? {} : { logoSrc: p.logoSrc }),
    }), h("nav", {
      "aria-label": "Main navigation",
    }, p.items.map(item => h("a", {
      key: item.id, href: item.href, class: "t-nav-link", "aria-current": item.id === p.active ? "page" : undefined, onClick: (event: MouseEvent) => {
        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          event.preventDefault()
          emit("navigate", item.href)
        }
      },
    }, item.label))), h("div", {
      class: "grow",
    }), slots["actions"]?.(), h(TLiveStatus, {
      state: p.state,
    }),
  ]),
})
