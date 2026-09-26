import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { DoctorFinding } from "../contracts/index.ts"
import { TBadge } from "../atoms/TBadge.ts"
import { TDisclosure } from "../molecules/TDisclosure.ts"
import { TCodeBlock } from "../molecules/TCodeBlock.ts"
import { TEmptyState } from "../molecules/TEmptyState.ts"

export const DoctorReport = defineComponent({
  name: "DoctorReport", props: {
    findings: {
      type: Array as PropType<readonly DoctorFinding[]>, required: true,
    },
  }, setup: p => () => p.findings.length ? h("div", p.findings.map((f, i) => h("article", {
    key: i, class: "t-finding",
  }, [
    h("div", [
      h(TBadge, {
        value: f.severity,
      }),
    ]), h("div", [
      h("h3", f.subject), h("p", f.detail), f.fix ? h(TDisclosure, {
        title: "Suggested fix",
      }, () => h(TCodeBlock, {
        code: f.fix!, language: "text",
      })) : null,
    ]),
  ]))) : h(TEmptyState, {
    title: "No doctor findings recorded",
  }),
})
