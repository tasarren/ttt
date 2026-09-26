import { defineComponent, h } from "vue"
import { groupProjects, TSurface, TButton, TInspector, TBadge, TNotice  } from "@ttt/ui"
import { pageProps, pageEmits, shell, heading, inspector } from "../shared.ts"

export const ProjectsPage = defineComponent({
  name: "ProjectsPage", props: pageProps, emits: pageEmits, setup: (p, { emit }) => () => {
    const groups = groupProjects(p.snapshot.sessions)
    return shell(p, emit, "projects", h("div", {
      class: "stack",
    }, [
      heading("Workspaces", "Project grouping derived from working directories"), h(TNotice, {
        tone: "lavender",
      }, () => "The catalog has no Project record. This view groups existing session panes by cwd; it does not introduce project ownership or lifecycle states."), h("div", {
        class: "t-project-grid",
      }, groups.map(group => h(TSurface, {
        title: group.cwd.split("/").at(-1) || group.cwd, key: group.cwd,
      }, {
        default: () => h("div", {
          class: "stack",
        }, [
          h("p", {
            class: "mono small muted",
          }, group.cwd), h(TInspector, {
            items: [
              {
                label: "sessions", value: group.sessions,
              }, {
                label: "panes", value: group.panes,
              },
            ],
          }), h("h3", "Conversations"), ...group.sessions.map(session => h(TButton, {
            intent: "ghost", onClick: () => { emit("navigate", "/boards/" + session) },
          }, () => session + " board")), h(TButton, {
            intent: "primary", onClick: () => { emit("navigate", "/sessions/" + group.sessions[0]!) },
          }, () => "Inspect sessions"),
        ]),
      }))),
    ]), inspector("Derived context", [
      h(TBadge, {
        value: "UI projection", tone: "lavender",
      }), h(TInspector, {
        items: [
          {
            label: "group key", value: "TreePane.cwd",
          }, {
            label: "members", value: "TreeSession.name",
          }, {
            label: "stored project metadata", value: "none",
          },
        ],
      }), h("p", {
        class: "small muted",
      }, "Connect a project adapter when your backend provides authoritative project records. Existing board and session views do not depend on that extension."),
    ]))
  },
})
