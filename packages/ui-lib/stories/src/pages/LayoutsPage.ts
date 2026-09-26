import { cloneData, parseJsonc, validateLayout , LayoutEditor, TEntityTree, TButton, TInspector, TNotice, TSourceViewer, TDisclosure  } from "@ttt/ui"
import { defineComponent, h, ref } from "vue"
import type { LayoutFile } from "@ttt/ui"
import { pageProps, pageEmits, shell, heading, inspector, download, readUpload } from "../shared.ts"

export const LayoutsPage = defineComponent({
  name: "LayoutsPage", props: pageProps, emits: pageEmits, setup(p, { emit }) {
    const selected = ref(p.entityId || "research")
    const imported = ref<Record<string, LayoutFile>>({})
    const status = ref("")
    const dirty = ref(false)
    const file = ref<HTMLInputElement>()
    const sourceByName = ref<Record<string, string>>({
      ...p.layoutSources,
    })
    function choose(name: string) {
      if (dirty.value && !window.confirm("Discard unsaved layout changes?"))
        return
      selected.value = name
      dirty.value = false
    }
    async function upload(e: Event) {
      try {
        const data = await readUpload(e)
        if (!data)
          return
        const parsed = parseJsonc<LayoutFile>(data.text)
        const errors = [
          ...parsed.errors, ...validateLayout(parsed.value),
        ]
        if (errors.length) {
          status.value = errors.join(" · ")
          return
        }
        const name = data.name.replace(/\.jsonc?$/i, "")
        if (!/^[A-Za-z0-9_-]+$/.test(name)) {
          status.value = "The filename must use letters, digits, underscores or hyphens."
          return
        }
        imported.value = {
          ...imported.value, [name]: parsed.value!,
        }
        sourceByName.value[name] = data.text
        selected.value = name
        status.value = "Imported into a local draft."
      }
      catch(e) {
        status.value = (e as Error).message
      }
    }
    return () => {
      const layouts = {
        ...p.snapshot.layouts, ...imported.value,
      }
      const name = layouts[selected.value] ? selected.value : Object.keys(layouts)[0] ?? ""
      const value = layouts[name]
      if (!value)
        return shell(p, emit, "layouts", heading("No layouts recorded"), null)
      return shell(p, emit, "layouts", h("div", {
        class: "stack",
      }, [
        heading("Layouts", `${name}.jsonc`, () => h("div", {
          class: "t-toolbar",
        }, [
          h(TButton, {
            onClick: () => file.value?.click(),
          }, () => "Import JSONC"), h(TButton, {
            onClick: () => { download(name + ".jsonc", sourceByName.value[name] || JSON.stringify(value, null, 2)) },
          }, () => "Export saved layout"),
        ])), h("input", {
          ref: file, type: "file", accept: ".json,.jsonc", hidden: true, onChange: upload,
        }), status.value ? h(TNotice, {
          tone: status.value.startsWith("Imported") ? "mint" : "amber",
        }, () => status.value) : null, h(LayoutEditor, {
          key: name, modelValue: value, source: sourceByName.value[name], fileName: name + ".jsonc", onDirty: (v: boolean) => {
            dirty.value = v
          }, onSave: (v: LayoutFile, source: string) => {
            imported.value = {
              ...imported.value, [name]: v,
            }
            sourceByName.value[name] = source
            emit("saveLayout", name, v, source)
            dirty.value = false
          },
        }),
      ]), inspector("Layout contract", [
        h(TInspector, {
          items: [
            {
              label: "filename", value: name + ".jsonc",
            }, {
              label: "version", value: value.version,
            }, {
              label: "windows", value: value.windows.length,
            }, {
              label: "profile", value: value.profile,
            }, {
              label: "cwd", value: value.cwd,
            }, {
              label: "session", value: value.session,
            },
          ],
        }), h("p", {
          class: "small dim",
        }, "Saved by the demo adapter to local storage. Export the JSONC for your TTT host. No running session is changed."), h("h3", "Editing rules"), h("p", {
          class: "small muted",
        }, "Drag split boundaries or focus a separator and use arrow keys. Multiple panes require a matching layout string. Helper titles cannot coexist with seated agents."), h(TDisclosure, {
          title: "Saved source",
        }, () => h(TSourceViewer, {
          value, source: sourceByName.value[name],
        })),
      ]), h("div", [
        h("h2", "Saved layouts"), h(TEntityTree, {
          nodes: Object.entries(layouts).map(([id, l]) => ({
            id, label: id, count: l.windows.length,
          })), selected: name, onSelect: choose,
        }), h("div", {
          class: "t-sidebar-group",
        }, "Local drafts"), h(TButton, {
          style: {
            width: "100%",
          }, onClick: () => {
            const key = `layout-${Object.keys(layouts).length + 1}`
            imported.value = {
              ...imported.value, [key]: {
                version: 1, profile: "agents", windows: [
                  {
                    name: "main",
                  },
                ],
              },
            }
            choose(key)
          },
        }, () => "New layout"), h(TButton, {
          intent: "ghost", style: {
            width: "100%", marginTop: "10px",
          }, onClick: () => {
            const key = `${name}-copy-${Object.keys(layouts).length}`
            imported.value = {
              ...imported.value, [key]: cloneData(value),
            }
            choose(key)
          },
        }, () => "Duplicate saved layout"),
      ]))
    }
  },
})
