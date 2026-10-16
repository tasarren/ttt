import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { TreePane } from "../contracts/index.ts"
import { TBadge } from "../atoms/TBadge.ts"
import { TButton } from "../atoms/TButton.ts"

export const PaneTable = defineComponent({
  name: "PaneTable", props: {
    panes: {
      type: Array as PropType<readonly TreePane[]>, required: true,
    }, selected: String,
  }, emits: {
    select: (_id: string) => true,
  }, setup: (p, { emit }) => () => h("div", {
    class: "t-table-wrap", tabindex: 0, role: "region", "aria-label": "Window panes",
  }, [
    h("table", {
      class: "t-table",
    }, [
      h("caption", {
        class: "sr-only",
      }, "Panes"), h("thead", [
        h("tr", [
          "Pane", "Agent / helper", "Command", "Working directory", "Focus", "Process",
        ].map(x => h("th", {
          scope: "col",
        }, x))),
      ]), h("tbody", p.panes.map(pane => h("tr", {
        key: pane.pane, "data-selected": p.selected === pane.pane,
      }, [
        h("td", h(TButton, {
          size: "sm", intent: "ghost", onClick: () => { emit("select", pane.pane) },
        }, () => pane.pane)), h("td", {
          class: "mono",
        }, pane.agent || "Helper"), h("td", {
          class: "mono",
        }, pane.command), h("td", {
          class: "mono small muted",
        }, pane.cwd), h("td", h(TBadge, {
          value: pane.active ? "active" : "not active", tone: pane.active ? "sage" : "neutral",
        })), h("td", h(TBadge, {
          value: pane.dead ? "dead" : "running", tone: pane.dead ? "coral" : "neutral",
        })),
      ]))),
    ]),
  ]),
})
