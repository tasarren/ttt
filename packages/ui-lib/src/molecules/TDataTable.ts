import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import { displayValue } from "../contracts/index.ts"
import { TEmptyState } from "./TEmptyState.ts"

export interface TableColumn {
  key: string
  label: string
  mono?: boolean
}
export const TDataTable = defineComponent({
  name: "TDataTable",
  props: {
    columns: {
      type: Array as PropType<readonly TableColumn[]>, required: true,
    },
    rows: {
      type: Array as PropType<readonly Record<string, unknown>[]>, required: true,
    },
    caption: {
      type: String, required: true,
    },
    selected: [
      String, Number,
    ],
    rowKey: {
      type: String, default: "id",
    },
  },
  setup(p, { slots }) {
    return () => {
      if (!p.rows.length)
        return h(TEmptyState, {
          title: "No records", detail: "No data matches this view.",
        })
      const header = h("thead", [
        h("tr", p.columns.map(c => h("th", {
          key: c.key, scope: "col",
        }, c.label))),
      ])
      const body = h("tbody", p.rows.map((row, i) => h("tr", {
        key: displayValue(row[p.rowKey] ?? i),
        "data-selected": row[p.rowKey] === p.selected,
      }, p.columns.map(c => h("td", {
        key: c.key, class: c.mono ? "mono" : undefined,
      }, slots["cell"]?.({
        row, column: c, value: row[c.key],
      }) || displayValue(row[c.key]))))))
      return h("div", {
        class: "t-table-wrap", tabindex: 0, role: "region", "aria-label": p.caption,
      }, [
        h("table", {
          class: "t-table",
        }, [
          h("caption", {
            class: "sr-only",
          }, p.caption), header, body,
        ]),
      ])
    }
  },
})
