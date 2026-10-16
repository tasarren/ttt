import { defineComponent, h, useId } from "vue"
import type { PropType } from "vue"

export const TField = defineComponent({
  name: "TField", props: {
    label: {
      type: String, required: true,
    }, id: String, error: String as PropType<string | undefined>, hint: String,
  }, setup(p, { slots }) {
    const generated = useId()
    return () => {
      const id = p.id || generated
      const describedBy = p.error || p.hint ? id + "-hint" : undefined
      return h("div", {
        class: "t-field",
      }, [
        h("label", {
          class: "t-field-label", for: id,
        }, p.label), slots["default"]?.({
          id, "aria-invalid": !!p.error, "aria-describedby": describedBy,
        }), p.error || p.hint ? h("p", {
          id: describedBy, class: p.error ? "t-field-error" : "small dim", role: p.error ? "alert" : undefined,
        }, p.error || p.hint) : null,
      ])
    }
  },
})
