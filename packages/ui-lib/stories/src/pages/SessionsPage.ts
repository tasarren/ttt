import { defineComponent, h, ref, computed, watch } from "vue"
import { SessionTree, PaneViewport, PaneTable, PaneInspector, TButton, TDisclosure, TSourceViewer, TInspector, TSurface, TBadge } from "@ttt/ui"
import { pageProps, pageEmits, shell, heading, inspector } from "../shared.ts"

export const SessionsPage = defineComponent({
  name: "SessionsPage", props: pageProps, emits: pageEmits, setup(p, { emit }) {
    const initialSelection = () => p.entityId || p.snapshot.sessions.find(s => s.name === p.boardName)?.windows[0]?.panes[0]?.pane || p.snapshot.sessions[0]?.windows[0]?.panes[0]?.pane || ""
    const selection = ref(initialSelection())
    watch(() => [
      p.boardName, p.entityId,
    ], () => {
      selection.value = initialSelection()
    })
    const active = computed(() => {
      const preferred = p.snapshot.sessions.find(s => s.name === p.boardName) || p.snapshot.sessions[0]
      for (const session of p.snapshot.sessions)
        for (const window of session.windows) {
          const pane = window.panes.find(x => x.pane === selection.value)
          if (pane)
            return {
              session, window, pane,
            }
          if (window.id === selection.value)
            return {
              session, window, pane: window.panes[0],
            }
        }
      const session = p.snapshot.sessions.find(s => s.id === selection.value) || preferred
      const window = session?.windows[0]
      return {
        session, window, pane: window?.panes[0],
      }
    })
    return () => {
      const { session, window, pane } = active.value
      if (!session || !pane || !window)
        return shell(p, emit, "sessions", heading("No panes recorded"), null)
      return shell(p, emit, "sessions", h("div", {
        class: "stack",
      }, [
        heading(`${session.name} / ${window.name}`, `${session.windows.length} windows · ${window.panes.length} panes`, () => h("div", {
          class: "row",
        }, [
          h(TButton, {
            onClick: () => { emit("navigate", "/boards/" + session.name) },
          }, () => "Open board"), h(TButton, {
            intent: "primary", onClick: () => { emit("navigate", "/layouts") },
          }, () => "Edit saved layout"),
        ])), h(PaneViewport, {
          panes: window.panes, selected: pane.pane, geometry: p.snapshot.geometry[window.id], captures: p.snapshot.captures, onSelect: (id: string) => {
            selection.value = id
          },
        }), h(TSurface, {
          title: "Window panes", padded: false,
        }, () => h(PaneTable, {
          panes: window.panes, selected: pane.pane, onSelect: (id: string) => {
            selection.value = id
          },
        })), h(TDisclosure, {
          title: "Window and session source",
        }, () => h(TSourceViewer, {
          value: {
            session: {
              ...session, windows: undefined,
            }, window: {
              ...window, panes: undefined,
            }, sessionRecord: p.snapshot.sessionRecords.find(s => s.session === session.name), panesView: p.snapshot.panesViews.find(v => v.id === window.id),
          },
        })),
      ]), inspector(`Pane ${pane.pane}`, [
        h(TBadge, {
          value: pane.agent || "Helper pane", tone: pane.agent ? "sage" : "lavender",
        }), h(PaneInspector, {
          pane,
        }), h("p", {
          class: "small dim",
        }, "Terminal output shown here is a demo capture. Runtime control needs a host adapter; this viewer does not execute commands."),
      ]), h("div", [
        h("h2", "Sessions"), h(SessionTree, {
          sessions: p.snapshot.sessions, selected: pane.pane, onSelect: (id: string) => {
            selection.value = id
          },
        }), h("div", {
          class: "t-sidebar-group",
        }, "Selected session"), h(TInspector, {
          items: [
            {
              label: "id", value: session.id,
            }, {
              label: "attached", value: session.attached,
            }, {
              label: "group", value: session.group,
            },
          ],
        }),
      ]))
    }
  },
})
