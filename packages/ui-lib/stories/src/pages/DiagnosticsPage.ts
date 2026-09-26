import { defineComponent, h, ref } from "vue"
import { DoctorReport, SchemaLedgerView, TSelect, TSurface, TInspector, TDisclosure, TSourceViewer, TButton, TNotice } from "@ttt/ui"
import { pageProps, pageEmits, shell, heading, inspector, boardFor } from "../shared.ts"

export const DiagnosticsPage = defineComponent({
  name: "DiagnosticsPage", props: pageProps, emits: pageEmits, setup(p, { emit }) {
    const severity = ref("")
    return () => shell(p, emit, "diagnostics", h("div", {
      class: "stack",
    }, [
      heading("Diagnostics", "Recorded doctor findings", () => h(TSelect, {
        "aria-label": "Filter severity", modelValue: severity.value, options: [
          {
            value: "", label: "All findings",
          }, {
            value: "ok", label: "OK",
          }, {
            value: "warn", label: "Warnings",
          }, {
            value: "fail", label: "Failures",
          },
        ], "onUpdate:modelValue": (v: string) => {
          severity.value = v
        },
      })), h(TSurface, {
        title: "Doctor report",
      }, () => h(DoctorReport, {
        findings: p.snapshot.findings.filter(f => !severity.value || f.severity === severity.value),
      })), h(TNotice, {
        tone: "lavender",
      }, () => "The demo displays supplied findings. Suggested fixes are text, not commands executed by the browser."), h(TDisclosure, {
        title: "DoctorFindings JSON",
      }, () => h(TSourceViewer, {
        value: p.snapshot.findings,
      })),
    ]), inspector("Schema ledger", [
      h(SchemaLedgerView, {
        ledger: boardFor(p)?.ledger,
      }), h(TInspector, {
        items: [
          {
            label: "source", value: "ttt tmux doctor --json",
          }, {
            label: "states", value: [
              "ok", "warn", "fail",
            ],
          }, {
            label: "findings", value: p.snapshot.findings.length,
          },
        ],
      }), h(TButton, {
        onClick: () => { emit("navigate", "/layouts") },
      }, () => "Inspect saved layouts"),
    ]))
  },
})
