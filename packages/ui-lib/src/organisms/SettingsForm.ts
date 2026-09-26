import { cloneData, parseJsonc, validateContract, validateSettings  } from "../contracts/index.ts"
import { defineComponent, h, ref, computed, watch } from "vue"
import type { PropType } from "vue"
import { applyEdits, modify } from "jsonc-parser"
import type { SettingsFile, HarnessEntry } from "../contracts/index.ts"
import { TButton } from "../atoms/TButton.ts"
import { TInput } from "../atoms/TInput.ts"
import { TTextarea } from "../atoms/TTextarea.ts"
import { TCheckbox } from "../atoms/TCheckbox.ts"
import { TSwitch } from "../atoms/TSwitch.ts"
import { TTabs } from "../molecules/TTabs.ts"
import { TNotice } from "../molecules/TNotice.ts"
import { TSurface } from "../atoms/TSurface.ts"
import { TField } from "../molecules/TField.ts"
import { HarnessEditor } from "./HarnessEditor.ts"

export const settingGroups = [
  {
    name: "Mailbox and notification", fields: [
      [
        "notifySeconds", 20, 0, "seconds",
      ], [
        "readMax", 10, 1, "messages",
      ],
    ],
  },
  {
    name: "Wait", fields: [
      [
        "wait.seconds", 120, 1, "seconds",
      ], [
        "wait.maxSeconds", 300, 1, "seconds",
      ], [
        "wait.maxIdle", 5, 1, "empty waits",
      ],
    ],
  },
  {
    name: "Capture", fields: [
      [
        "capture.lines", 40, 1, "lines",
      ], [
        "capture.maxLines", 500, 1, "lines",
      ],
    ],
  },
  {
    name: "Lock", fields: [
      [
        "lock.timeoutMs", 10000, 0, "ms",
      ], [
        "lock.staleMs", 60000, 0, "ms",
      ],
    ],
  },
  {
    name: "Tmux", fields: [
      [
        "tmux.inputSettleMs", 800, 0, "ms",
      ], [
        "tmux.postPasteMs", 500, 0, "ms",
      ], [
        "tmux.enterPresses", 3, 0, "presses",
      ], [
        "tmux.postSendMs", 300, 0, "ms",
      ],
    ],
  },
] as const
function at(object: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, object)
}
export const SettingsForm = defineComponent({
  name: "SettingsForm", props: {
    modelValue: {
      type: Object as PropType<SettingsFile>, required: true,
    }, shippedHarnesses: {
      type: Array as PropType<readonly string[]>,
    },
  }, emits: {
    "update:modelValue": (_v: SettingsFile) => true, save: (_v: SettingsFile) => true,
  }, setup(p, { emit }) {
    const source = ref(JSON.stringify(p.modelValue, null, 2))
    const tab = ref("fields")
    const message = ref("")
    const numberDrafts = ref<Record<string, string>>({})
    const numberErrors = ref<Record<string, string>>({})
    watch(() => p.modelValue, v => {
      source.value = JSON.stringify(v, null, 2)
      numberDrafts.value = {}
      numberErrors.value = {}
    })
    const parsed = computed(() => parseJsonc<SettingsFile>(source.value))
    const structure = computed(() => parsed.value.errors.length ? parsed.value.errors : validateContract("SettingsFile", parsed.value.value))
    const draft = computed(() => structure.value.length ? undefined : parsed.value.value)
    const errors = computed(() => [
      ...(structure.value.length ? structure.value : validateSettings(draft.value, p.shippedHarnesses)), ...Object.values(numberErrors.value),
    ])
    function patch(path: string, value: unknown) {
      source.value = applyEdits(source.value, modify(source.value, path.split("."), value, {
        formattingOptions: {
          insertSpaces: true, tabSize: 2,
        },
      }))
      message.value = ""
    }
    function editNumber(key: string, value: string, min: number) {
      numberDrafts.value[key] = value
      const number = Number(value)
      if (!value.trim() || !Number.isSafeInteger(number) || number < min) {
        numberErrors.value[key] = `${key}: enter an integer of at least ${min}.`
        return
      }
      Reflect.deleteProperty(numberErrors.value, key)
      patch(key, number)
    }
    function overrideNumber(key: string, enabled: boolean, fallback: number) {
      Reflect.deleteProperty(numberDrafts.value, key)
      Reflect.deleteProperty(numberErrors.value, key)
      patch(key, enabled ? fallback : undefined)
    }
    function save() {
      if (!draft.value || errors.value.length)
        return
      emit("update:modelValue", cloneData(draft.value))
      emit("save", cloneData(draft.value))
      message.value = "Settings saved by the host adapter."
    }
    return () => h("div", {
      class: "stack",
    }, [
      h("div", {
        class: "row between",
      }, [
        h(TTabs, {
          modelValue: tab.value, tabs: [
            {
              value: "fields", label: "Fields",
            }, {
              value: "harnesses", label: "Harnesses",
            }, {
              value: "source", label: "JSONC",
            },
          ], "onUpdate:modelValue": (v: string) => {
            tab.value = v
          },
        }), h(TButton, {
          intent: "primary", onClick: save, disabled: errors.value.length > 0,
        }, () => "Save settings"),
      ]), errors.value.length ? h(TNotice, {
        tone: "coral",
      }, () => errors.value.slice(0, 8).map(e => h("p", e))) : null, message.value ? h(TNotice, {
        tone: "mint",
      }, () => message.value) : null,
      tab.value === "source" ? h(TField, {
        label: "Settings JSONC",
      }, {
        default: (attrs: Record<string, unknown>) => h(TTextarea, {
          ...attrs, class: "t-source-editor", modelValue: source.value, spellcheck: false, "onUpdate:modelValue": (v: string) => {
            source.value = v
            numberDrafts.value = {}
            numberErrors.value = {}
          },
        }),
      }) : !draft.value ? h(TNotice, {
        tone: "amber",
      }, () => "Repair the JSONC structure before editing fields.") : tab.value === "harnesses" ? h(HarnessEditor, {
        ...(draft.value.harnesses === undefined ? {} : { modelValue: draft.value.harnesses }), "onUpdate:modelValue": (v: Record<string, HarnessEntry> | undefined) => { patch("harnesses", v) },
      }) : h("div", {
        class: "stack",
      }, [
        h(TSurface, {
          title: "Storage",
        }, () => h(TField, {
          label: "boardRoot", hint: "Absent uses <TTT_HOME>/boards. Path expansion belongs to the backend.",
        }, {
          default: (attrs: Record<string, unknown>) => h(TInput, {
            ...attrs, modelValue: draft.value?.boardRoot || "", placeholder: "<TTT_HOME>/boards", "onUpdate:modelValue": (v: string) => { patch("boardRoot", v || undefined) },
          }),
        })),
        ...settingGroups.map(group => h(TSurface, {
          title: group.name, key: group.name,
        }, () => group.fields.map(([key, fallback, min, unit]) => {
          const value = at(draft.value, key)
          return h("div", {
            class: "t-setting-row", key,
          }, [
            h("label", {
              for: "setting-" + key,
            }, [
              key, h("span", {
                class: "dim small",
              }, ` (${unit})`),
            ]), h(TInput, {
              id: "setting-" + key, type: "number", min, step: 1, disabled: value === undefined, modelValue: numberDrafts.value[key] ?? (value === undefined ? fallback : Number(value)), "aria-invalid": !!numberErrors.value[key], "onUpdate:modelValue": (v: string) => { editNumber(key, v, min) },
            }), h(TCheckbox, {
              label: "Explicit", modelValue: value !== undefined, "onUpdate:modelValue": (v: boolean) => { overrideNumber(key, v, fallback) },
            }),
          ])
        }))),
        h(TSurface, {
          title: "Tmux badges",
        }, () => h("div", {
          class: "row between",
        }, [
          h(TSwitch, {
            label: "Show tmux badges", modelValue: draft.value?.tmux?.badges ?? true, disabled: draft.value?.tmux?.badges === undefined, "onUpdate:modelValue": (v: boolean) => { patch("tmux.badges", v) },
          }), h(TCheckbox, {
            label: "Explicit", modelValue: draft.value?.tmux?.badges !== undefined, "onUpdate:modelValue": (v: boolean) => { patch("tmux.badges", v ? true : undefined) },
          }),
        ])),
        h(TSurface, {
          title: "Notification overrides",
        }, () => h(TField, {
          label: "notifyOverrides (agent name → seconds)", hint: "Edit the complete map in JSONC to add or remove agent overrides.",
        }, {
          default: (attrs: Record<string, unknown>) => h(TTextarea, {
            ...attrs, modelValue: JSON.stringify(draft.value?.notifyOverrides || {}, null, 2), onChange: (e: Event) => {
              const result = parseJsonc((e.target as HTMLTextAreaElement).value)
              if (result.errors.length)
                message.value = result.errors.join(" · ")
              else
                patch("notifyOverrides", result.value)
            },
          }),
        })),
      ]),
    ])
  },
})
