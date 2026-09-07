import type { TreePane, TreeWindow } from "@ttt/tmux"

import { parseCommandArgs } from "../../args.ts"
import { usageError } from "../../cli-error.ts"
import { writeLayout } from "../../layout.ts"
import type { Layout, LayoutPane, LayoutWindow } from "../../layout.ts"
import { readSessionRecord } from "../../session-record.ts"
import type { TmuxVerb } from "../../tmux-context.ts"

const SAVE_OPTIONS = { force: { type: "boolean", default: false } } as const

/** Foreground process names that mean "a shell is idle here": saved as `command: null`. */
const SHELLS = new Set(["sh", "bash", "zsh", "fish", "dash", "ksh", "tcsh", "csh"])

/** `ttt tmux save NAME [--force]`: the live session as a layout file, verbatim geometry included. */
export const save: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, SAVE_OPTIONS)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux save NAME [--force] (use --session S before the command when outside tmux)")
  if (ctx.session === undefined) throw usageError("not inside tmux; pass --session NAME before the command")
  const tree = await ctx.tmux.inventory.tree(ctx.session)
  const record = await readSessionRecord(ctx.settings.home, ctx.session)
  const layout: Layout = {
    version: 1,
    profile: record?.profile ?? "agents",
    windows: [],
  }
  const windows: LayoutWindow[] = []
  let guessed = 0
  for (const window of tree.windows) {
    const geometry = await ctx.tmux.windows.layout(window.id)
    const panes = window.panes.map((pane) => {
      const saved = savePane(pane, window)
      if (saved.source === "process") guessed += 1
      return saved
    })
    const harness = window.panes.find((pane) => pane.agent === window.name)?.harness
    windows.push({ name: window.name, ...(harness !== undefined ? { harness } : {}), ...(panes.length > 1 ? { layout: geometry } : {}), panes })
  }
  const path = await writeLayout(ctx.settings.home, name, { ...layout, windows }, { force: values.force })
  process.stdout.write(`saved ${windows.length} window${windows.length === 1 ? "" : "s"} to ${path}\n`)
  if (guessed > 0) process.stdout.write(`ttt: ${guessed} pane${guessed === 1 ? "" : "s"} had no @ttt_command; saved the process name with "source": "process", check them before restoring.\n`)
}

/** `@ttt_command` when ttt started the pane; else the process name, flagged; a bare shell is null. */
function savePane(pane: TreePane, window: TreeWindow): LayoutPane {
  const agent = pane.agent === window.name ? { agent: true } : {}
  const cwd = pane.cwd !== "" ? { cwd: pane.cwd } : {}
  if (pane.startCommand !== undefined) return { command: pane.startCommand, ...agent, ...cwd }
  if (SHELLS.has(pane.command) || pane.command === "") return { command: null, ...agent, ...cwd }
  return { command: pane.command, source: "process", ...agent, ...cwd }
}
