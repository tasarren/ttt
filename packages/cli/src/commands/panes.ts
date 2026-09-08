import { resolveAgent, winnersByName } from "@ttt/tmux"
import type { TreePane, TreeWindow } from "@ttt/tmux"

import { parseCommandArgs } from "../args.ts"
import { CliError, usageError } from "../cli-error.ts"
import type { Handler } from "../context.ts"

const PANES_OPTIONS = { window: { type: "string" }, json: { type: "boolean", default: false } } as const

/** One row of `ttt panes`: what an agent needs to pick a target inside a window. */
interface PaneRow {
  index: number
  pane: string
  /** The agent seated here, or undefined for a helper pane. */
  agent: string | undefined
  /** True for the pane a message to the window lands in. */
  seat: boolean
  /** Whether `agent` is a stamp (false: the first pane standing in for an unregistered window). */
  registered: boolean
  /** What runs here: the harness, else the helper title, else the foreground process. */
  runs: string
  dead: boolean
}

/**
 * `ttt panes [--window NAME]`: the panes of one window (default: the caller's), one per line:
 * `INDEX  %id  AGENT|-  RUNS`, with `(seat)` on the pane messages to the window land in and
 * `(unregistered)` when that is only because nothing there has run ttt yet. `ttt windows` stays
 * one line per window; the whole session at once is `ttt tmux tree`.
 */
export const panes: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, PANES_OPTIONS)
  if (positionals.length > 0) throw usageError("usage: ttt panes [--window NAME] [--json]")
  const name = values.window ?? ctx.windowName
  const tree = await ctx.tmux.inventory.tree(ctx.session)
  const window = winnersByName(tree.windows).get(name)
  if (!window) throw new CliError(`tmux window does not exist: ${ctx.session}:${name}`)
  const rows = paneRows(window)
  if (values.json) {
    process.stdout.write(`${JSON.stringify({ window: name, id: window.id, panes: rows }, null, 2)}\n`)
    return
  }
  process.stdout.write(`${rows.map(formatRow).join("\n")}\n`)
}

export function paneRows(window: TreeWindow): PaneRow[] {
  const seat = resolveAgent(window.panes, window, window.name)
  return window.panes.map((pane) => ({
    index: pane.index,
    pane: pane.pane,
    agent: pane.agent ?? (seat?.paneId === pane.pane ? window.name : undefined),
    seat: seat?.paneId === pane.pane,
    registered: pane.agent !== undefined,
    runs: runsIn(pane),
    dead: pane.dead,
  }))
}

function runsIn(pane: TreePane): string {
  return pane.harness ?? pane.paneTitle ?? pane.command
}

function formatRow(row: PaneRow): string {
  const tags = [
    ...(row.seat ? ["(seat)"] : []),
    ...(row.agent !== undefined && !row.registered ? ["(unregistered)"] : []),
    ...(row.dead ? ["(dead)"] : []),
  ]
  return `${row.index}\t${row.pane}\t${row.agent ?? "-"}\t${row.runs}${tags.length > 0 ? `\t${tags.join(" ")}` : ""}`
}
