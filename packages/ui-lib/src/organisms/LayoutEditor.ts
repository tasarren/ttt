import { cloneData, parseJsonc, validateContract, validateLayout, makeLayout, parseLayout, serializeLayout, splitPane, removePane, renumberLayout, leaves  } from "../contracts/index.ts"
import { defineComponent, h, ref, computed, watch } from "vue"
import type { PropType } from "vue"
import { modify, applyEdits } from "jsonc-parser"
import type { LayoutFile, LayoutPane, LayoutWindow, LayoutNode } from "../contracts/index.ts"
import { TButton } from "../atoms/TButton.ts"
import { TInput } from "../atoms/TInput.ts"
import { TSelect } from "../atoms/TSelect.ts"
import { TTextarea } from "../atoms/TTextarea.ts"
import { TField } from "../molecules/TField.ts"
import { TTabs } from "../molecules/TTabs.ts"
import { TNotice } from "../molecules/TNotice.ts"
import { TDisclosure } from "../molecules/TDisclosure.ts"
import { TInspector } from "../molecules/TInspector.ts"
import { LayoutCanvas } from "./LayoutCanvas.ts"

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
/** Keep typed-but-incomplete form values editable. Full contract validation still gates saving. */
function editableShape(value: unknown): value is LayoutFile {
  if (!object(value) || value["version"] !== 1 || !Array.isArray(value["windows"]) || !value["windows"].length)
    return false
  const optionalStrings = (record: Record<string, unknown>, keys: string[]) => keys.every(key => record[key] === undefined || typeof record[key] === "string")
  if (!optionalStrings(value, [
    "cwd", "profile", "session",
  ]))
    return false
  return value["windows"].every(window => object(window) && typeof window["name"] === "string" && optionalStrings(window, [
    "layout",
  ]) &&
    (window["panes"] === undefined || Array.isArray(window["panes"]) && window["panes"].every(pane => object(pane) &&
      optionalStrings(pane, [
        "title", "cwd", "harness", "source",
      ]) &&
      (pane["command"] === undefined || pane["command"] === null || typeof pane["command"] === "string") &&
      (pane["agent"] === undefined || typeof pane["agent"] === "boolean" || typeof pane["agent"] === "string"))))
}
const option = (value: string, label = value) => ({
  value, label,
})
export const LayoutEditor = defineComponent({
  name: "LayoutEditor",
  props: {
    modelValue: {
      type: Object as PropType<LayoutFile>, required: true,
    }, source: String as PropType<string | undefined>, fileName: {
      type: String, default: "research.jsonc",
    },
  },
  emits: {
    "update:modelValue": (_value: LayoutFile) => true, save: (_value: LayoutFile, _source: string) => true, dirty: (_dirty: boolean) => true,
  },
  setup(p, { emit }) {
    const source = ref(p.source || JSON.stringify(p.modelValue, null, 2))
    const original = ref(source.value)
    const tab = ref("visual")
    const windowIndex = ref(0)
    const paneIndex = ref(0)
    const info = ref("")
    const parsed = computed(() => parseJsonc<LayoutFile>(source.value))
    const structureErrors = computed(() => parsed.value.errors.length ? parsed.value.errors : validateContract("LayoutFile", parsed.value.value))
    const draft = computed(() => !parsed.value.errors.length && editableShape(parsed.value.value) ? parsed.value.value : undefined)
    const errors = computed(() => structureErrors.value.length ? structureErrors.value : validateLayout(draft.value))
    const window = computed(() => draft.value?.windows[windowIndex.value])
    const panes = computed(() => window.value?.panes?.length ? window.value.panes : [
      {
        agent: true,
      },
    ])
    const pane = computed<LayoutPane>(() => panes.value[paneIndex.value] || panes.value[0] || {})
    const tree = computed(() => {
      try {
        if (window.value?.layout)
          return renumberLayout(parseLayout(window.value.layout))
      }
      catch { /* Keep draft inspectable while invalid geometry is repaired. */
      }
      return makeLayout(Math.max(1, Math.min(24, panes.value.length)))
    })
    watch(() => p.modelValue, v => {
      source.value = p.source || JSON.stringify(v, null, 2)
      original.value = source.value
      windowIndex.value = 0
      paneIndex.value = 0
    })
    watch(source, v => { emit("dirty", v !== original.value) })
    function patch(path: (string | number)[], value: unknown) {
      try {
        source.value = applyEdits(source.value, modify(source.value, path, value, {
          formattingOptions: {
            insertSpaces: true, tabSize: 2,
          },
        }))
        info.value = ""
      }
      catch(e) {
        info.value = (e as Error).message
      }
    }
    function patchWindow(value: LayoutWindow) {
      patch([
        "windows", windowIndex.value,
      ], value)
    }
    function patchPane(key: keyof LayoutPane, value: unknown) {
      if (!window.value)
        return
      const values = cloneData(panes.value)
      const current: Record<string, unknown> = {
        ...values[paneIndex.value],
      }
      if (value === undefined)
        Reflect.deleteProperty(current, key)
      else
        current[key] = value
      if (key === "agent" && (value === true || typeof value === "string"))
        delete current["title"]
      values[paneIndex.value] = current
      patchWindow({
        ...window.value, panes: values,
      })
    }
    function geometry(value: LayoutNode) {
      if (!window.value)
        return
      const ordered = leaves(value).map(leaf => panes.value[leaf.pane!] || {})
      patchWindow({
        ...window.value, panes: ordered, layout: serializeLayout(renumberLayout(value)),
      })
    }
    function split(direction: "horizontal" | "vertical") {
      try {
        geometry(splitPane(tree.value, paneIndex.value, direction))
        paneIndex.value = Math.min(paneIndex.value, panes.value.length - 1)
      }
      catch(e) {
        info.value = (e as Error).message
      }
    }
    function remove() {
      try {
        geometry(removePane(tree.value, paneIndex.value))
        paneIndex.value = 0
      }
      catch(e) {
        info.value = (e as Error).message
      }
    }
    function addWindow() {
      if (!draft.value)
        return
      let i = draft.value.windows.length + 1
      while (draft.value.windows.some(w => w.name === `window-${i}`))
        i++
      patch([
        "windows",
      ], [
        ...draft.value.windows, {
          name: `window-${i}`,
        },
      ])
      windowIndex.value = draft.value.windows.length - 1
      paneIndex.value = 0
    }
    function save() {
      if (draft.value && errors.value.length === 0) {
        const value = cloneData(draft.value)
        emit("update:modelValue", value)
        emit("save", value, source.value)
        info.value = "Save requested."
      }
    }
    function field(label: string, content: (attrs: Record<string, unknown>) => ReturnType<typeof h>) {
      return h(TField, {
        label,
      }, {
        default: content,
      })
    }
    const changeSource = (v: string) => {
      source.value = v
    }
    return () => h("div", {
      class: "stack",
    }, [
      h("div", {
        class: "row between wrap",
      }, [
        h("div", {
          class: "row",
        }, [
          h("strong", {
            class: "mono",
          }, p.fileName), h("span", {
            class: "small dim",
          }, source.value !== original.value ? "Unsaved changes" : "Saved draft"),
        ]), h("div", {
          class: "t-toolbar",
        }, [
          h(TButton, {
            onClick: () => {
              source.value = original.value
              info.value = ""
            },
          }, () => "Reset draft"), h(TButton, {
            intent: "primary", disabled: errors.value.length > 0, onClick: save,
          }, () => "Save layout"),
        ]),
      ]),
      h(TTabs, {
        modelValue: tab.value, tabs: [
          option("visual", "Visual editor"), option("source", "JSONC source"),
        ], "onUpdate:modelValue": (v: string) => {
          tab.value = v
        },
      }),
      errors.value.length ? h(TNotice, {
        tone: "coral",
      }, () => h("div", errors.value.slice(0, 8).map(error => h("p", error)))) : null,
      info.value ? h(TNotice, {
        tone: info.value.startsWith("Layout saved") ? "mint" : "amber",
      }, () => info.value) : null,
      tab.value === "source" ? field("Layout JSONC", attrs => h(TTextarea, {
        ...attrs, class: "t-source-editor", modelValue: source.value, spellcheck: false, "onUpdate:modelValue": changeSource,
      })) : draft.value && window.value ? h("div", {
        class: "stack",
      }, [
        h("div", {
          class: "row wrap",
        }, [
          h(TSelect, {
            "aria-label": "Layout window", style: {
              width: "200px",
            }, modelValue: String(windowIndex.value), options: draft.value.windows.map((w, i) => option(String(i), w.name)), "onUpdate:modelValue": (v: string) => {
              windowIndex.value = Number(v)
              paneIndex.value = 0
            },
          }), h(TButton, {
            onClick: addWindow,
          }, () => "Add window"), h(TButton, {
            intent: "ghost", disabled: draft.value.windows.length === 1, onClick: () => {
              patch([
                "windows",
              ], draft.value!.windows.filter((_, i) => i !== windowIndex.value))
              windowIndex.value = 0
              paneIndex.value = 0
            },
          }, () => "Remove window"), h("div", {
            class: "grow",
          }), h(TButton, {
            onClick: () => { split("horizontal") }, disabled: panes.value.length >= 24,
          }, () => "Split left / right"), h(TButton, {
            onClick: () => { split("vertical") }, disabled: panes.value.length >= 24,
          }, () => "Split top / bottom"),
        ]),
        h(LayoutCanvas, {
          modelValue: tree.value, selected: paneIndex.value, editable: true, tiles: panes.value.map((item, id) => ({
            id, label: item.agent === true ? window.value!.name : typeof item.agent === "string" ? item.agent : item.title || "Helper", agent: item.agent === true ? window.value!.name : typeof item.agent === "string" ? item.agent : undefined, command: item.command || "Plain shell", cwd: item.cwd || draft.value!.cwd, content: `${item.command ?? "Shell on launch"}\n\n${item.cwd || draft.value!.cwd || "Inherited directory"}`,
          })), onSelect: (i: number) => {
            paneIndex.value = i
          }, "onUpdate:modelValue": geometry, onError: (v: string) => {
            info.value = v
          },
        }),
        h("div", {
          class: "row between",
        }, [
          h("h2", `Pane ${paneIndex.value}`), h(TButton, {
            size: "sm", intent: "danger", disabled: panes.value.length < 2, onClick: remove,
          }, () => "Remove pane"),
        ]),
        h("div", {
          class: "t-form-grid",
        }, [
          field("Agent assignment", attrs => h(TSelect, {
            ...attrs, modelValue: pane.value.agent === true ? "main" : typeof pane.value.agent === "string" ? "named" : pane.value.agent === false ? "helper" : "absent", options: [
              option("main", "Main window agent"), option("named", "Named agent"), option("helper", "Helper (false)"), option("absent", "Unspecified"),
            ], "onUpdate:modelValue": (v: string) => { patchPane("agent", v === "main" ? true : v === "named" ? "reviewer" : v === "helper" ? false : undefined) },
          })),
          typeof pane.value.agent === "string" ? field("Agent name", attrs => h(TInput, {
            ...attrs, modelValue: pane.value.agent as string, "onUpdate:modelValue": (v: string) => { patchPane("agent", v) },
          })) : field("Helper title", attrs => h(TInput, {
            ...attrs, disabled: pane.value.agent === true, modelValue: pane.value.title || "", "onUpdate:modelValue": (v: string) => { patchPane("title", v || undefined) },
          })),
          field("Command mode", attrs => h(TSelect, {
            ...attrs, modelValue: pane.value.command === undefined ? "absent" : pane.value.command === null ? "null" : "command", options: [
              option("absent", "Unspecified → plain shell"), option("null", "Explicit null → plain shell"), option("command", "Launch command"),
            ], "onUpdate:modelValue": (v: string) => { patchPane("command", v === "absent" ? undefined : v === "null" ? null : "node agent.mjs") },
          })),
          field("Launch command", attrs => h(TInput, {
            ...attrs, disabled: typeof pane.value.command !== "string", modelValue: pane.value.command || "", "onUpdate:modelValue": (v: string) => { patchPane("command", v) },
          })),
          ...([
            "cwd", "harness",
          ] as const).map(key => field(key === "cwd" ? "Working directory" : "Harness", attrs => h(TInput, {
            ...attrs, modelValue: pane.value[key] || "", "onUpdate:modelValue": (v: string) => { patchPane(key, v || undefined) },
          }))),
          field("Source", attrs => h(TSelect, {
            ...attrs, modelValue: pane.value.source || "", options: [
              option("", "Not specified"), option("process"), option("tree"),
            ], "onUpdate:modelValue": (v: string) => { patchPane("source", v || undefined) },
          })),
          field("Window name", attrs => h(TInput, {
            ...attrs, modelValue: window.value!.name, "onUpdate:modelValue": (v: string) => { patch([
              "windows", windowIndex.value, "name",
            ], v) },
          })),
        ]),
        h(TDisclosure, {
          title: "Layout root options",
        }, () => h("div", {
          class: "t-form-grid",
        }, ([
          "cwd", "profile", "session",
        ] as const).map(key => field(key === "session" ? "Session (informational only)" : key, attrs => h(TInput, {
          ...attrs, modelValue: draft.value![key] || "", "onUpdate:modelValue": (v: string) => { patch([
            key,
          ], v || undefined) },
        }))))),
        h(TDisclosure, {
          title: "Generated window layout string",
        }, () => h(TInspector, {
          items: [
            {
              label: "layout", value: window.value?.layout,
            }, {
              label: "version", value: draft.value?.version,
            },
          ],
        })),
      ]) : h(TNotice, {
        tone: "amber",
      }, () => "Repair the JSONC structure in Source before using the visual editor."),
    ])
  },
})
