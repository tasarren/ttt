import { execFile } from "node:child_process"
import { basename } from "node:path"
import { promisify } from "node:util"

import type { TreePane, TreeWindow } from "@ttt/tmux"

import { parseCommandArgs } from "../../args.ts"
import { usageError } from "../../cli-error.ts"
import { writeLayout } from "../../layout.ts"
import type { Layout, LayoutPane, LayoutWindow } from "../../layout.ts"
import { readSessionRecord } from "../../session-record.ts"
import type { HarnessSettings } from "../../harnesses.ts"
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
  const processes = await readProcessTable().catch(() => undefined)
  const layout: Layout = {
    version: 1,
    session: ctx.session,
    profile: record?.profile ?? "agents",
    windows: [],
  }
  const windows: LayoutWindow[] = []
  let guessed = 0
  for (const window of tree.windows) {
    const geometry = await ctx.tmux.windows.layout(window.id)
    const panes = await Promise.all(window.panes.map(async(pane) => {
      const saved = await savePane(pane, window, ctx.settings.harnesses, processes)
      if (saved.source !== undefined) guessed += 1
      return saved
    }))
    windows.push({ name: window.name, ...(panes.length > 1 ? { layout: geometry } : {}), panes })
  }
  const path = await writeLayout(ctx.settings.home, name, { ...layout, windows }, { force: values.force })
  process.stdout.write(`saved ${windows.length} window${windows.length === 1 ? "" : "s"} to ${path}\n`)
  if (guessed > 0) process.stdout.write(`ttt: ${guessed} pane${guessed === 1 ? "" : "s"} had no @ttt_command; saved the process name with "source": "process", check them before restoring.\n`)
}

/** `@ttt_command` when ttt started the pane; else the launch line from the process tree; a bare shell is null. */
async function savePane(pane: TreePane, window: TreeWindow, harnesses: HarnessSettings, processes: PsRow[] | undefined): Promise<LayoutPane> {
  const agent = pane.agent === undefined ? {} : { agent: pane.agent === window.name ? true : pane.agent }
  const title = pane.paneTitle !== undefined ? { title: pane.paneTitle } : {}
  const harness = pane.harness !== undefined ? { harness: pane.harness } : {}
  const cwd = pane.cwd !== "" ? { cwd: pane.cwd } : {}
  if (pane.startCommand !== undefined) {
    return {
      command: pane.startCommand,
      ...agent,
      ...title,
      ...(pane.harness !== undefined ? { harness: pane.harness } : {}),
      ...cwd,
    }
  }
  if (processes !== undefined) {
    const detected = descendantCommand(processes, pane.pid, process.pid, harnesses)
    if (detected !== undefined) {
      return { command: detected, source: "tree", ...agent, ...title, ...harnessLabel(detected, harnesses), ...cwd }
    }
    if (!SHELLS.has(pane.command) && pane.command !== "") {
      return { command: pane.command, source: "process", ...agent, ...title, ...harness, ...cwd }
    }
    return { command: null, ...agent, ...title, ...harness, ...cwd }
  }
  if (SHELLS.has(pane.command) || pane.command === "") return { command: null, ...agent, ...title, ...harness, ...cwd }
  return { command: pane.command, source: "process", ...agent, ...title, ...harness, ...cwd }
}

/** One `ps` row: pid, its parent, and the full command line. */
export interface PsRow {
  pid: number
  ppid: number
  args: string
}

const execFileAsync = promisify(execFile)

/** The live process table; undefined when `ps` is missing (Linux-only, best effort). `-e` matters: bare `ps` shows only the caller's session, and saves run detached. */
async function readProcessTable(): Promise<PsRow[] | undefined> {
  const { stdout } = await execFileAsync("ps", ["-e", "-o", "pid=,ppid=,args="])
  const rows: PsRow[] = []
  for (const line of stdout.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\S.*)?$/.exec(line)
    if (!match) continue
    rows.push({ pid: Number(match[1]), ppid: Number(match[2]), args: (match[3] ?? "").trim() })
  }
  return rows
}

/** argv fragments identifying this ttt invocation; the saver's subtree is never recorded. */
const SELF_ARGV = ["ttt.ts", "ttt.mjs", "@tasarren/ttt"]

/**
 * The launch line behind a pane: among `panePid`'s direct children (minus the saver's own
 * subtree) prefer one running a declared harness, else the longest command line. A pane
 * whose shell runs nothing (or only this save) yields undefined: a bare shell.
 */
export function descendantCommand(rows: PsRow[], panePid: number, selfPid: number, harnesses: HarnessSettings): string | undefined {
  const children = new Map<number, PsRow[]>()
  for (const row of rows) {
    const list = children.get(row.ppid) ?? []
    list.push(row)
    children.set(row.ppid, list)
  }
  const tainted = new Set<number>([selfPid])
  const taint = (pid: number): void => {
    if (tainted.has(pid)) return
    tainted.add(pid)
    for (const child of children.get(pid) ?? []) taint(child.pid)
  }
  for (const row of rows) {
    if (SELF_ARGV.some((fragment) => row.args.includes(fragment))) taint(row.pid)
  }
  const candidates = (children.get(panePid) ?? []).filter((row) => !tainted.has(row.pid) && row.args !== "")
  const harnessed = candidates.filter((row) => harnessName(row.args, harnesses) !== undefined)
  const picked = (harnessed.length > 0 ? harnessed : candidates).toSorted((a, b) => b.args.length - a.args.length).at(0)
  return picked?.args
}

/**
 * The declared harness `args` runs, if any: any non-flag token's basename against the harness
 * name or its resolved `bin` basename, case-insensitive, prefix-tolerant (`claudex` →
 * `claude`). Humans launch through wrapper scripts (`bash .../bin/codex ...`), so argv[0]
 * alone is the shell. A wrong label only re-stamps `@ttt_harness` (the relaunch is always
 * the verbatim line, reviewable via `source: "tree"`).
 */
export function harnessName(args: string, harnesses: HarnessSettings): string | undefined {
  const bases = args.split(/\s+/).filter((token) => token !== "" && !token.startsWith("-")).map((token) =>
    basename(token).toLowerCase().replace(/\.[a-z0-9]+$/, ""),
  )
  if (bases.length === 0) return undefined
  for (const [name, resolved] of Object.entries(harnesses.declared)) {
    const candidates = [name.toLowerCase(), basename(resolved.bin).toLowerCase().replace(/\.[a-z0-9]+$/, "")]
    if (candidates.some((candidate) => candidate !== "" && bases.some((base) => base === candidate || base.startsWith(candidate)))) return name
  }
  return undefined
}

/** `{ harness: name }` when the launch line runs a declared harness. */
function harnessLabel(detected: string, harnesses: HarnessSettings): { harness?: string } {
  const name = harnessName(detected, harnesses)
  return name === undefined ? {} : { harness: name }
}
