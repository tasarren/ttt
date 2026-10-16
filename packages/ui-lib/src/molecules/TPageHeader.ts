import { defineComponent, h } from "vue"
import type { PropType } from "vue"

export const TPageHeader = defineComponent({
  name: "TPageHeader", props: {
    title: {
      type: String, required: true,
    }, subtitle: String as PropType<string | undefined>,
  }, setup: (p, { slots }) => () => h("header", {
    class: "t-page-head",
  }, [
    h("div", {
      class: "stack", style: {
        gap: "8px",
      },
    }, [
      slots["breadcrumb"]?.(), h("h1", p.title), p.subtitle ? h("p", {
        class: "small muted",
      }, p.subtitle) : null,
    ]), h("div", {
      class: "t-toolbar",
    }, slots["actions"]?.()),
  ]),
})
