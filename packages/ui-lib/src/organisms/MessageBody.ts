import { defineComponent, h } from "vue"
import { TCodeBlock } from "../molecules/TCodeBlock.ts"
/** Deliberately safe text/fenced-code rendering; no HTML or script interpretation. */
export const MessageBody = defineComponent({
  name: "MessageBody", props: {
    body: {
      type: String, required: true,
    },
  }, setup: p => () => h("div", {
    class: "t-message-body",
  }, p.body.split(/(```[\s\S]*?```)/g).filter(Boolean).map((chunk, i) => chunk.startsWith("```") ? h(TCodeBlock, {
    key: i, language: chunk.slice(3).split("\n")[0] || "text", code: chunk.slice(chunk.indexOf("\n") + 1, -3).trimEnd(),
  }) : h("p", {
    key: i,
  }, chunk))),
})
