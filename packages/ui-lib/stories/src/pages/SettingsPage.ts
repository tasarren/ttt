import { defineComponent, h, ref } from "vue"
import type { SettingsFile } from "@ttt/ui"
import { parseJsonc, validateSettings, SettingsForm, TButton, TNotice, TInspector, TDisclosure, TSourceViewer  } from "@ttt/ui"
import { pageProps, pageEmits, shell, heading, inspector, download, readUpload } from "../shared.ts"

export const SettingsPage = defineComponent({
  name: "SettingsPage", props: pageProps, emits: pageEmits, setup(p, { emit }) {
    const local = ref<SettingsFile>()
    const error = ref("")
    const file = ref<HTMLInputElement>()
    async function upload(e: Event) {
      try {
        const result = await readUpload(e)
        if (!result)
          return
        const parsed = parseJsonc<SettingsFile>(result.text)
        const errors = [
          ...parsed.errors, ...validateSettings(parsed.value),
        ]
        if (errors.length)
          error.value = errors.join(" · ")
        else {
          local.value = parsed.value
          error.value = ""
        }
      }
      catch(e) {
        error.value = (e as Error).message
      }
    }
    return () => {
      const value = local.value || p.snapshot.settings
      return shell(p, emit, "settings", h("div", {
        class: "stack",
      }, [
        heading("Configuration", "TTT settings · local draft", () => h("div", {
          class: "row",
        }, [
          h(TButton, {
            onClick: () => file.value?.click(),
          }, () => "Import"), h(TButton, {
            onClick: () => { download("settings.json", JSON.stringify(value, null, 2)) },
          }, () => "Export saved settings"),
        ])), h("input", {
          ref: file, type: "file", accept: ".json,.jsonc", hidden: true, onChange: upload,
        }), error.value ? h(TNotice, {
          tone: "coral",
        }, () => error.value) : null, h(SettingsForm, {
          modelValue: value, onSave: (v: SettingsFile) => {
            local.value = v
            emit("saveSettings", v)
          },
        }),
      ]), inspector("Configuration semantics", [
        h(TInspector, {
          items: [
            {
              label: "source", value: "~/.ttt/settings.jsonc",
            }, {
              label: "required keys", value: 0,
            }, {
              label: "unknown keys", value: "rejected",
            }, {
              label: "defaults", value: "displayed, not injected",
            },
          ],
        }), h("p", {
          class: "small muted",
        }, "Explicit values are distinct from inherited defaults. Zero is preserved where the contract permits it. Disable an override to remove the key."), h("p", {
          class: "small dim",
        }, "These controls configure TTT records, not accounts or permissions. Saving in this demo changes local storage only."), h(TDisclosure, {
          title: "Saved SettingsFile",
        }, () => h(TSourceViewer, {
          value,
        })),
      ]))
    }
  },
})
