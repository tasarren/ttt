import { defineComponent, h, ref } from "vue"
import type { PropType } from "vue"
import { TTabs } from "./TTabs.ts"
import { TCodeBlock } from "./TCodeBlock.ts"

export const TSourceViewer = defineComponent({
  name: "TSourceViewer", props: {
    value: null, source: String as PropType<string | undefined>,
  }, setup(p) {
    const tab = ref("json")
    return () => h("div", {
      class: "stack",
    }, [
      p.source ? h(TTabs, {
        modelValue: tab.value, tabs: [
          {
            value: "json", label: "Parsed JSON",
          }, {
            value: "source", label: "Source JSONC",
          },
        ], "onUpdate:modelValue": (v: string) => {
          tab.value = v
        },
      }) : null, h(TCodeBlock, {
        language: tab.value === "source" ? "jsonc" : "json", code: tab.value === "source" && p.source ? p.source : JSON.stringify(p.value, null, 2) || "Not recorded",
      }),
    ])
  },
})
