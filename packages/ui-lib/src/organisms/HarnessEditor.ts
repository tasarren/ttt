import { defineComponent, h, ref } from "vue"
import type { PropType } from "vue"
import type { HarnessEntry } from "../contracts/index.ts"
import { TButton } from "../atoms/TButton.ts"
import { TInput } from "../atoms/TInput.ts"
import { TCheckbox } from "../atoms/TCheckbox.ts"
import { TField } from "../molecules/TField.ts"
import { TSurface } from "../atoms/TSurface.ts"

export const HarnessEditor = defineComponent({
  name: "HarnessEditor", props: {
    modelValue: Object as PropType<Record<string, HarnessEntry> | undefined>,
  }, emits: {
    "update:modelValue": (_v: Record<string, HarnessEntry> | undefined) => true,
  }, setup(p, { emit }) {
    const name = ref("")
    const error = ref("")
    function patch(key: string, entry: HarnessEntry) {
      emit("update:modelValue", {
        ...p.modelValue, [key]: entry,
      })
    }
    function add() {
      if (!/^[A-Za-z0-9_-]+$/.test(name.value) || Object.hasOwn(p.modelValue || {}, name.value)) {
        error.value = "Choose a unique name using letters, digits, hyphens or underscores."
        return
      }
      patch(name.value, {
        bin: "node", ready: "ready", default: !p.modelValue || Object.keys(p.modelValue).length === 0,
      })
      name.value = ""
      error.value = ""
    }
    return () => h("div", {
      class: "stack",
    }, [
      h("p", {
        class: "small muted",
      }, p.modelValue ? "Only these harnesses are allowed. Exactly one must be the default." : "No harness override. Shipped presets are allowed; no default is selected."), ...Object.entries(p.modelValue || {}).map(([key, entry]) => h(TSurface, {
        title: key, key,
      }, {
        actions: () => h(TButton, {
          size: "sm", intent: "danger", onClick: () => {
            const next = {
              ...p.modelValue,
            }
            Reflect.deleteProperty(next, key)
            emit("update:modelValue", Object.keys(next).length ? next : undefined)
          },
        }, () => "Remove"), default: () => h("div", {
          class: "stack",
        }, [
          h("div", {
            class: "t-form-grid",
          }, ([
            "bin", "ready", "limited",
          ] as const).map(field => h(TField, {
            label: field === "limited" ? "limited (parsed, not matched)" : field,
          }, {
            default: (attrs: Record<string, unknown>) => h(TInput, {
              ...attrs, modelValue: entry[field] || "", "onUpdate:modelValue": (v: string) => {
                const next = {
                  ...entry,
                }
                if (v)
                  next[field] = v
                else
                  Reflect.deleteProperty(next, field)
                patch(key, next)
              },
            }),
          }))), h(TCheckbox, {
            label: "Default harness", modelValue: entry.default === true, "onUpdate:modelValue": (v: boolean) => {
              const map = {
                ...p.modelValue,
              }
              for (const name of Object.keys(map))
                map[name] = {
                  ...map[name], default: name === key ? v : false,
                }
              emit("update:modelValue", map)
            },
          }),
        ]),
      })), h("div", {
        class: "row",
      }, [
        h(TField, {
          label: "New harness name", error: error.value, class: "grow",
        }, {
          default: (attrs: Record<string, unknown>) => h(TInput, {
            ...attrs, modelValue: name.value, "onUpdate:modelValue": (v: string) => {
              name.value = v
            },
          }),
        }), h(TButton, {
          onClick: add,
        }, () => "Add harness"),
      ]),
    ])
  },
})
