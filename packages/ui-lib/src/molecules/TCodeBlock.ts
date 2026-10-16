import { defineComponent, h, ref } from "vue"

export const TCodeBlock = defineComponent({
  name: "TCodeBlock", props: {
    code: {
      type: String, required: true,
    }, language: {
      type: String, default: "text",
    },
  }, setup(p) {
    const status = ref("Copy")
    async function copy() {
      try {
        await navigator.clipboard.writeText(p.code)
        status.value = "Copied"
      }
      catch {
        status.value = "Copy unavailable"
      }
    }
    return () => h("div", {
      class: "t-code",
    }, [
      h("header", [
        h("span", {
          class: "mono",
        }, p.language), h("button", {
          class: "t-copy", onClick: copy,
        }, status.value),
      ]), h("pre", [
        h("code", p.code),
      ]),
    ])
  },
})
