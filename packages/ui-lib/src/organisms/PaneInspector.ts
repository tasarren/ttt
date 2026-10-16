import { defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { TreePane } from "../contracts/index.ts"
import { TInspector } from "../molecules/TInspector.ts"
import { TDisclosure } from "../molecules/TDisclosure.ts"
import { TSourceViewer } from "../molecules/TSourceViewer.ts"

const fields = [
  "session", "window", "windowId", "pane", "index", "pid", "agent", "active", "dead", "cwd", "command", "title", "harness", "startCommand", "historyLimit", "paneTitle",
] as const
export const PaneInspector = defineComponent({
  name: "PaneInspector", props: {
    pane: {
      type: Object as PropType<TreePane>, required: true,
    },
  }, setup: p => () => h("div", {
    class: "stack",
  }, [
    h(TInspector, {
      items: fields.map(key => ({
        label: key, value: p.pane[key],
      })),
    }), h("p", {
      class: "small dim",
    }, "active is tmux focus. Selecting this inspector does not focus or modify the pane."), h(TDisclosure, {
      title: "Source JSON",
    }, () => h(TSourceViewer, {
      value: p.pane,
    })),
  ]),
})
