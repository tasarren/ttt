import { cloneData, makeLayout, receiptStates, summarizeReceipts, timeline  } from "@ttt/ui"
import { defineComponent, h, ref, computed } from "vue"
import * as UI from "@ttt/ui"
import type { LayoutNode, LayoutFile, SettingsFile, HarnessEntry, MessageReceipt } from "@ttt/ui"
import type { ViewerSnapshot } from "./types.ts"
import seed from "../../fixtures/snapshot.json"
import { navigation } from "./shared.ts"

export const Showcase = defineComponent({
  name: "Showcase", props: {
    name: {
      type: String, required: true,
    }, variant: {
      type: String, default: "default",
    },
  }, setup(p) {
    const value = ref("research")
    const checked = ref(true)
    const active = ref("visual")
    const dialog = ref(false)
    const selected = ref("%0")
    const event = ref("")
    const sample = seed as ViewerSnapshot
    const sampleWindow = sample.sessions[0]!.windows[0]!
    const board = sample.boards[0]!
    const message = board.messages[0]!
    const receipt = ref(board.receipts[0]!)
    const layout = ref<LayoutFile>(cloneData(sample.layouts["research"]!))
    const tree = ref<LayoutNode>(makeLayout(3))
    const settings = ref<SettingsFile>(cloneData(sample.settings))
    const harnesses = ref<Record<string, HarnessEntry> | undefined>({
      local: {
        bin: "node", ready: "ready", default: true,
      },
    })
    const edge = computed(() => p.variant === "edge")
    function content() {
      const n = p.name
      if (n === "TButton")
        return h("div", {
          class: "row wrap",
        }, [
          "primary", "secondary", "ghost", "danger",
        ].map(intent => h(UI.TButton, {
          intent: intent as "primary", disabled: edge.value, onClick: () => {
            event.value = intent + " clicked"
          },
        }, () => intent === "primary" ? "Save layout" : intent === "danger" ? "Remove" : intent === "ghost" ? "Copy ID" : "Inspect")))
      if (n === "TBadge")
        return h("div", {
          class: "row wrap",
        }, receiptStates.map(state => h(UI.TBadge, {
          value: state,
        })))
      if (n === "TBrand")
        return h(UI.TBrand)
      if (n === "TCheckbox" || n === "TSwitch")
        return h(UI[n], {
          label: "Follow latest messages", modelValue: checked.value, disabled: edge.value, "onUpdate:modelValue": (v: boolean) => {
            checked.value = v
          },
        })
      if (n === "TInput" || n === "TTextarea")
        return h(UI.TField, {
          label: "Layout name", error: edge.value ? "Use letters, digits, underscores or hyphens." : undefined,
        }, {
          default: (attrs: Record<string, unknown>) => h(UI[n], {
            ...attrs, modelValue: value.value, "onUpdate:modelValue": (v: string) => {
              value.value = v
            },
          }),
        })
      if (n === "TSelect")
        return h(UI.TField, {
          label: "Message priority",
        }, {
          default: (attrs: Record<string, unknown>) => h(UI.TSelect, {
            ...attrs, modelValue: active.value, options: [
              {
                value: "visual", label: "normal",
              }, {
                value: "source", label: "urgent",
              },
            ], "onUpdate:modelValue": (v: string) => {
              active.value = v
            },
          }),
        })
      if (n === "TCount")
        return h("div", {
          class: "row",
        }, [
          h(UI.TCount, {
            value: 0, label: "Recorded zero",
          }), h(UI.TCount, {
            value: 12,
          }), h(UI.TCount),
        ])
      if (n === "TDivider")
        return h("div", [
          h("p", "Message"), h(UI.TDivider), h("p", "Recipient receipt"),
        ])
      if (n === "TIdentifier")
        return h(UI.TIdentifier, {
          value: edge.value ? undefined : message.messageId,
        })
      if (n === "TKbd")
        return h("div", {
          class: "row",
        }, [
          h(UI.TKbd, () => "Ctrl"), h(UI.TKbd, () => "K"),
        ])
      if (n === "TSkeleton")
        return h(UI.TSkeleton, {
          lines: 4,
        })
      if (n === "TSurface")
        return h(UI.TSurface, {
          title: "Board context",
        }, () => h("p", "One shared message, independent recipient receipts."))
      if (n === "TTimestamp")
        return h(UI.TTimestamp, {
          value: edge.value ? undefined : message.timestamp, full: true,
        })
      if (n === "TBreadcrumb")
        return h(UI.TBreadcrumb, {
          items: [
            {
              label: "alpha", href: "#alpha",
            }, {
              label: "main",
            }, {
              label: "%0",
            },
          ],
        })
      if (n === "TCodeBlock")
        return h(UI.TCodeBlock, {
          language: "json", code: JSON.stringify({
            agent: true, command: "node planner.mjs",
          }, null, 2),
        })
      if (n === "TContextMenu")
        return h(UI.TContextMenu, {
          items: [
            {
              id: "thread", label: "Open thread",
            }, {
              id: "copy", label: "Copy message ID",
            }, {
              id: "json", label: "View source JSON",
            },
          ], onSelect: (id: string) => {
            event.value = id
          },
        })
      if (n === "TDataTable")
        return h(UI.TDataTable, {
          caption: "Example pane table", columns: [
            {
              key: "id", label: "Pane",
            }, {
              key: "command", label: "Command",
            }, {
              key: "active", label: "Active",
            },
          ], rows: edge.value ? [] : [
            {
              id: "%0", command: "node", active: false,
            }, {
              id: "%1", command: "nvim", active: true,
            },
          ],
        })
      if (n === "TDialog")
        return h("div", [
          h(UI.TButton, {
            onClick: () => {
              dialog.value = true
            },
          }, () => "Open source dialog"), h(UI.TDialog, {
            title: "Message source", modelValue: dialog.value, "onUpdate:modelValue": (v: boolean) => {
              dialog.value = v
            },
          }, () => h(UI.TSourceViewer, {
            value: message,
          })),
        ])
      if (n === "TDisclosure")
        return h(UI.TDisclosure, {
          title: "Optional metadata", open: edge.value,
        }, () => h(UI.TInspector, {
          items: [
            {
              label: "replaceKey", value: message.replaceKey,
            }, {
              label: "expiresAt", value: message.expiresAt,
            },
          ],
        }))
      if (n === "TEmptyState")
        return h(UI.TEmptyState, {
          title: "No matching threads", detail: "Change the search or clear the priority filter.",
        })
      if (n === "TEntityTree")
        return h(UI.TEntityTree, {
          nodes: [
            {
              id: "alpha", label: "alpha", children: [
                {
                  id: "main", label: "main", count: 2, children: [
                    {
                      id: "%0", label: "%0 planner",
                    }, {
                      id: "%1", label: "%1 helper",
                    },
                  ],
                },
              ],
            },
          ], selected: selected.value, onSelect: (id: string) => {
            selected.value = id
          },
        })
      if (n === "TField")
        return h(UI.TField, {
          label: "Agent name", error: edge.value ? "Spaces are not allowed." : undefined, hint: "Name, not an account.",
        }, {
          default: (attrs: Record<string, unknown>) => h(UI.TInput, {
            ...attrs, modelValue: value.value, "onUpdate:modelValue": (v: string) => {
              value.value = v
            },
          }),
        })
      if (n === "TInspector")
        return h(UI.TInspector, {
          items: [
            {
              label: "pane", value: "%0",
            }, {
              label: "active", value: false,
            }, {
              label: "counter", value: 0,
            }, {
              label: "harness", value: undefined,
            }, {
              label: "command", value: null,
            },
          ],
        })
      if (n === "TLiveStatus")
        return h("div", {
          class: "row wrap",
        }, ([
          "live", "connecting", "reconnecting", "disconnected", "paused",
        ] as const).map(state => h(UI.TLiveStatus, {
          state,
        })))
      if (n === "TNotice")
        return h(UI.TNotice, {
          tone: edge.value ? "coral" : "amber",
        }, () => "One intended recipient does not have a receipt record yet.")
      if (n === "TPageHeader")
        return h(UI.TPageHeader, {
          title: "alpha / main", subtitle: "3 panes",
        }, {
          actions: () => h(UI.TButton, () => "Inspect"),
        })
      if (n === "TSearch")
        return h(UI.TSearch, {
          modelValue: value.value, label: "Search threads", "onUpdate:modelValue": (v: string) => {
            value.value = v
          },
        })
      if (n === "TSourceViewer")
        return h(UI.TSourceViewer, {
          value: message, source: JSON.stringify(message, null, 2),
        })
      if (n === "TTabs")
        return h(UI.TTabs, {
          modelValue: active.value, tabs: [
            {
              value: "visual", label: "Visual editor",
            }, {
              value: "source", label: "JSONC source",
            },
          ], "onUpdate:modelValue": (v: string) => {
            active.value = v
          },
        })
      if (n === "ActivityTimeline")
        return h(UI.ActivityTimeline, {
          entries: edge.value ? [] : timeline(board.messages.slice(0, 1), board.receipts.slice(0, 2)), onInspect: (id: string) => {
            event.value = id
          },
        })
      if (n === "DoctorReport")
        return h(UI.DoctorReport, {
          findings: edge.value ? [] : sample.findings,
        })
      if (n === "HarnessEditor")
        return h(UI.HarnessEditor, {
          modelValue: harnesses.value, "onUpdate:modelValue": (v: Record<string, HarnessEntry> | undefined) => {
            harnesses.value = v
          },
        })
      if (n === "LayoutCanvas")
        return h(UI.LayoutCanvas, {
          modelValue: tree.value, editable: true, selected: Number(selected.value.replace("%", "")), tiles: [
            {
              id: 0, label: "planner", agent: "planner", command: "node planner.mjs", content: "Main window agent",
            }, {
              id: 1, label: "reviewer", agent: "reviewer", command: "node reviewer.mjs", content: "Named agent",
            }, {
              id: 2, label: "notes", command: "nvim", content: "Helper pane",
            },
          ], "onUpdate:modelValue": (v: LayoutNode) => {
            tree.value = v
          }, onSelect: (i: number) => {
            selected.value = `%${i}`
          },
        })
      if (n === "LayoutEditor")
        return h(UI.LayoutEditor, {
          modelValue: layout.value, onSave: (v: LayoutFile) => {
            layout.value = v
            event.value = "Saved"
          },
        })
      if (n === "MailboxSummary")
        return h(UI.MailboxSummary, {
          summary: summarizeReceipts(edge.value ? [] : board.receipts),
        })
      if (n === "MessageBody")
        return h(UI.MessageBody, {
          body: edge.value ? "<img src=x onerror=alert(1)>\n<script>alert('not executed')</script>" : board.messages[2]!.body,
        })
      if (n === "MessageCard")
        return h(UI.MessageCard, {
          message, onInspect: (id: string) => {
            event.value = id
          },
        })
      if (n === "MessageInspector")
        return h(UI.MessageInspector, {
          message,
        })
      if (n === "NotificationBatch")
        return h(UI.NotificationBatch, {
          marker: edge.value ? undefined : board.notifications["reviewer"], summary: board.notificationSummaries["reviewer"],
        })
      if (n === "PaneInspector")
        return h(UI.PaneInspector, {
          pane: sampleWindow.panes[edge.value ? 1 : 0]!,
        })
      if (n === "PaneTable")
        return h(UI.PaneTable, {
          panes: sampleWindow.panes, selected: selected.value, onSelect: (id: string) => {
            selected.value = id
          },
        })
      if (n === "PaneViewport")
        return h(UI.PaneViewport, {
          panes: sampleWindow.panes, selected: selected.value, geometry: sample.geometry["@0"], captures: edge.value ? {} : sample.captures, onSelect: (id: string) => {
            selected.value = id
          },
        })
      if (n === "ReadResultView")
        return h(UI.ReadResultView, {
          result: board.readResults["reviewer"]!,
        })
      if (n === "ReceiptInspector")
        return h(UI.ReceiptInspector, {
          receipt: edge.value ? board.receipts[4]! : receipt.value,
        })
      if (n === "ReceiptTable")
        return h(UI.ReceiptTable, {
          status: {
            message, receipts: edge.value ? [] : board.receipts.filter(r => r.messageId === message.messageId),
          }, onInspect: (r: MessageReceipt) => {
            receipt.value = r
            event.value = r.recipient
          },
        })
      if (n === "SchemaLedgerView")
        return h(UI.SchemaLedgerView, {
          ledger: edge.value ? undefined : board.ledger,
        })
      if (n === "SessionTree")
        return h(UI.SessionTree, {
          sessions: sample.sessions, selected: selected.value, onSelect: (id: string) => {
            selected.value = id
          },
        })
      if (n === "SettingsForm")
        return h(UI.SettingsForm, {
          modelValue: settings.value, onSave: (v: SettingsFile) => {
            settings.value = v
            event.value = "Saved"
          },
        })
      if (n === "TTopBar")
        return h(UI.TTopBar, {
          items: navigation, active: "boards", onNavigate: (path: string) => {
            event.value = path
          },
        })
      if (n === "ThreadList")
        return h(UI.ThreadList, {
          messages: edge.value ? [] : board.messages, threads: edge.value ? {} : board.threads, onSelect: (id: string) => {
            event.value = id
          },
        })
      if (n === "ThreadReader")
        return h(UI.ThreadReader, {
          messages: board.messages, index: board.threads[message.threadId] ?? [], onInspect: (id: string) => {
            event.value = id
          },
        })
      if (n === "WaitingPresence")
        return h(UI.WaitingPresence, {
          presence: edge.value ? undefined : board.presences["reviewer"], streak: board.streaks["reviewer"],
        })
      if (n === "AppShell")
        return h(UI.AppShell, {
          compact: p.variant === "compact",
        }, {
          topbar: () => h(UI.TTopBar, {
            items: navigation, active: "boards", onNavigate: (path: string) => {
              event.value = path
            },
          }), sidebar: () => h(UI.TEntityTree, {
            nodes: sample.boards.map(b => ({
              id: b.name, label: b.name, count: Object.keys(b.threads).length,
            })),
          }), default: () => h(UI.ThreadList, {
            messages: board.messages, threads: board.threads,
          }), inspector: () => h(UI.MessageInspector, {
            message,
          }),
        })
      return h(UI.TNotice, {
        tone: "coral",
      }, () => `Missing specimen for ${n}`)
    }
    return () => h("div", {
      class: "ttt t-story", "data-density": p.variant === "compact" ? "compact" : "comfortable",
    }, [
      content(), event.value ? h("p", {
        class: "mono small muted", role: "status", style: {
          marginTop: "20px",
        },
      }, "Event: " + event.value) : null,
    ])
  },
})
