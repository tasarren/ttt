import { HARNESS_PRESETS, SplitDirection, WaitOutcome, harnessPreset, resolveAgentPane } from "@ttt/tmux"
import type { HarnessPreset } from "@ttt/tmux"

import { boundedInt, parseCommandArgs, splitAtTerminator } from "../../args.ts"
import type { Parsed } from "../../args.ts"
import { CliError, usageError } from "../../cli-error.ts"
import type { TmuxVerb, TmuxVerbContext } from "../../tmux-context.ts"
import { checkWindowName, generateWindowName, mailboxNames } from "./names.ts"
import { requireSession, resolveAgentTarget, resolvePaneTarget } from "./target.ts"

const OPEN_OPTIONS = {
  window: { type: "string" },
  pane: { type: "string" },
  in: { type: "string" },
  harness: { type: "string" },
  ready: { type: "string" },
  "ready-timeout": { type: "string" },
  horizontal: { type: "boolean", default: false },
  size: { type: "string" },
  cwd: { type: "string" },
} as const

const OPEN_USAGE = [
  "usage: ttt tmux open --window NAME|auto [--harness NAME] [--ready REGEX|none] [--ready-timeout SECONDS] [--cwd DIR] [-- COMMAND]",
  "       ttt tmux open --pane [TITLE] [--in WINDOW] [--horizontal] [--size PERCENT] [--cwd DIR] [-- COMMAND]",
].join("\n")

/**
 * `ttt tmux open`: a teammate (`--window`: named, stamped, with a mailbox) or a helper pane next
 * to one (`--pane`: no identity). The flag is required so the caller chooses on purpose.
 */
export const open: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, OPEN_OPTIONS)
  if (positionals.length > 0) throw usageError(OPEN_USAGE)
  const wantsWindow = values.window !== undefined
  const wantsPane = values.pane !== undefined
  if (wantsWindow === wantsPane) throw usageError(`open needs exactly one of --window or --pane\n${OPEN_USAGE}`)
  const command = body?.join(" ") || undefined
  if (wantsWindow) {
    for (const flag of ["in", "horizontal", "size"] as const) {
      if (values[flag] !== undefined && values[flag] !== false) throw usageError(`--${flag} applies to --pane only`)
    }
    await openWindow(ctx, values, command)
    return
  }
  for (const flag of ["harness", "ready", "ready-timeout"] as const) {
    if (values[flag] !== undefined) throw usageError(`--${flag} applies to --window only`)
  }
  await openPane(ctx, values, command)
}

type OpenValues = Parsed<typeof OPEN_OPTIONS>["values"]

async function openWindow(ctx: TmuxVerbContext, values: OpenValues, commandArg: string | undefined): Promise<void> {
  const session = requireSession(ctx)
  const preset = values.harness !== undefined ? harnessPreset(values.harness) : undefined
  const ready = readinessOf(values, preset)
  const command = commandArg ?? preset?.command
  const picked = await pickWindow(ctx, session, values.window!, values.harness)
  let windowId: string
  let paneId: string
  if (picked.adopt) {
    // Furniture becomes a teammate: its first pane is restarted with the command, then stamped.
    windowId = picked.adopt.windowId
    paneId = picked.adopt.paneId
    await ctx.tmux.panes.respawn(paneId, command, values.cwd)
  } else {
    const opened = await ctx.tmux.windows.open({ session, name: picked.name, ...(values.cwd !== undefined ? { cwd: values.cwd } : {}), ...(command ? { command } : {}) })
    windowId = opened.windowId
    paneId = opened.paneId
  }
  const name = picked.name
  await ctx.tmux.panes.stamp(paneId, await ctx.tmux.inventory.listAllPanes(), {
    agent: name,
    ...(values.harness !== undefined ? { harness: values.harness } : {}),
    ...(command ? { command } : {}),
  })
  const verb = picked.adopt ? "adopted" : "opened"
  if (ready === undefined) {
    process.stdout.write(`${verb} ${name} ${windowId} pane ${paneId}\n`)
    return
  }
  const seconds = boundedInt(values["ready-timeout"], "--ready-timeout", ctx.settings.wait.seconds, ctx.settings.wait.maxSeconds)
  const started = Date.now()
  // Only the visible screen counts: history may hold the previous process's prompt.
  const result = await ctx.tmux.screen.waitFor({ target: paneId, pattern: ready, timeoutMs: seconds * 1_000, lines: 0 })
  if (result.outcome !== WaitOutcome.Matched) {
    throw new CliError(`${name} did not become ready (/${ready.source}/) within ${seconds}s; the window ${windowId} stays open${preset?.note ? ` (${preset.note})` : ""}`)
  }
  process.stdout.write(`${verb} ${name} ${windowId} pane ${paneId} (ready after ${((Date.now() - started) / 1_000).toFixed(1)}s)\n`)
}

/** `--ready REGEX` wins, `--ready none` opts out, else the harness preset, else nothing to wait for. */
function readinessOf(values: OpenValues, preset: HarnessPreset | undefined): RegExp | undefined {
  if (values.ready === "none") return undefined
  if (values.ready !== undefined) {
    try {
      return new RegExp(values.ready)
    } catch(error) {
      throw usageError(`--ready is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (preset) return preset.ready
  if (values.harness !== undefined) {
    throw usageError(`no readiness preset for harness ${JSON.stringify(values.harness)} (known: ${Object.keys(HARNESS_PRESETS).join(", ")}); pass --ready REGEX or --ready none`)
  }
  return undefined
}

interface PickedWindow {
  name: string
  /** Set when an existing window with that name has no agent: it gets adopted instead of refused. */
  adopt?: { windowId: string; paneId: string }
}

/**
 * `auto` generates `HARNESS-N`. A given name must be valid; if a window already carries it, it is
 * adopted when it is furniture (no stamped pane, one pane) and refused when a teammate lives there.
 */
async function pickWindow(ctx: TmuxVerbContext, session: string, requested: string, harness: string | undefined): Promise<PickedWindow> {
  const windows = await ctx.tmux.inventory.listWindows(session)
  const live = windows.map((window) => window.name)
  if (requested === "auto") {
    const taken = new Set([...live, ...await mailboxNames(ctx.settings.boardRoot, session)])
    return { name: generateWindowName(harness, taken) }
  }
  checkWindowName(requested)
  const existing = await ctx.tmux.windows.find(session, requested)
  if (!existing) return { name: requested }
  const panes = (await ctx.tmux.inventory.listAllPanes()).filter((pane) => pane.windowId === existing.id)
  if (panes.some((pane) => pane.agent === requested)) throw new CliError(`tmux window already exists: ${session}:${requested} (a teammate lives there; pick another name or --window auto)`)
  if (panes.length !== 1) throw new CliError(`window ${requested} has ${panes.length} panes and no agent; adopting needs exactly one pane (close the others, or pick another name)`)
  return { name: requested, adopt: { windowId: existing.id, paneId: panes[0]!.pane } }
}

async function openPane(ctx: TmuxVerbContext, values: OpenValues, command: string | undefined): Promise<void> {
  const title = values.pane === "" ? undefined : values.pane
  const windowName = values.in ?? ctx.self?.windowName
  if (windowName === undefined) throw usageError("--pane needs --in WINDOW when not run from inside an agent window")
  const target = await resolvePaneTarget(ctx, windowName)
  const paneId = await ctx.tmux.panes.split({
    target: target.paneId,
    direction: values.horizontal ? SplitDirection.Horizontal : SplitDirection.Vertical,
    ...(values.size !== undefined ? { sizePercent: boundedInt(values.size, "--size", 50, 99) } : {}),
    ...(values.cwd !== undefined ? { cwd: values.cwd } : {}),
    ...(command ? { command } : {}),
  })
  if (command || title !== undefined) {
    await ctx.tmux.panes.stamp(paneId, await ctx.tmux.inventory.listAllPanes(), { ...(command ? { command } : {}), ...(title !== undefined ? { title } : {}) })
  }
  process.stdout.write(`opened pane ${paneId} in ${windowName}${title !== undefined ? ` (${title})` : ""}\n`)
}

/** `ttt tmux split NAME ...`: the pre-`--pane` spelling, kept one release. */
export const split: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, SPLIT_OPTIONS)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux split NAME [--horizontal] [--size PERCENT] [--cwd DIR] [-- COMMAND] (alias of: ttt tmux open --pane --in NAME ...)")
  process.stderr.write("ttt: `split` is now `ttt tmux open --pane --in NAME`; the alias goes away in the next release.\n")
  const forwarded = ["--pane", "", "--in", name, ...(values.horizontal ? ["--horizontal"] : []), ...(values.size !== undefined ? ["--size", values.size] : []), ...(values.cwd !== undefined ? ["--cwd", values.cwd] : []), ...(body ? ["--", ...body] : [])]
  await open(forwarded, ctx)
}

const SPLIT_OPTIONS = { horizontal: { type: "boolean", default: false }, size: { type: "string" }, cwd: { type: "string" } } as const

/** `ttt tmux close NAME`: kills the whole window, teammate or furniture; the mailbox on disk is untouched. */
export const close: TmuxVerb = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux close NAME")
  const session = requireSession(ctx)
  const window = await ctx.tmux.windows.find(session, name)
  if (!window) throw new CliError(`tmux window does not exist: ${session}:${name}`)
  if (ctx.self?.windowId === window.id) throw new CliError("refusing to close the window this command runs in")
  await ctx.tmux.windows.close(window.id)
  process.stdout.write(`closed ${name} ${window.id}\n`)
}

/**
 * `ttt tmux rename OLD NEW`: renames furniture. A teammate's name is its identity and mailbox key,
 * so a stamped window is refused; close it and open a new one instead.
 */
export const rename: TmuxVerb = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [from, to, ...extra] = positionals
  if (from === undefined || to === undefined || extra.length > 0) throw usageError("usage: ttt tmux rename OLD NEW")
  checkWindowName(to)
  const session = requireSession(ctx)
  const window = await ctx.tmux.windows.find(session, from)
  if (!window) throw new CliError(`tmux window does not exist: ${session}:${from}`)
  if (await ctx.tmux.windows.find(session, to)) throw new CliError(`tmux window already exists: ${session}:${to}`)
  const live = await ctx.tmux.inventory.listAllPanes()
  if (resolveAgentPane(live, window.id, window.name) !== undefined) throw new CliError(`${from} is a teammate; its name is its identity and mailbox. Close it and open ${to} instead`)
  await ctx.tmux.windows.rename(window.id, to)
  process.stdout.write(`renamed ${from} to ${to} ${window.id}\n`)
}

/** `ttt tmux respawn NAME [-- COMMAND]`: restarts the agent pane (default: its recorded `@ttt_command`) and re-stamps it. */
export const respawn: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { positionals } = parseCommandArgs(head, {} as const)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux respawn NAME [-- COMMAND]")
  const target = await resolveAgentTarget(ctx, name)
  const tree = await ctx.tmux.inventory.tree(target.session)
  const recorded = tree.windows.find((window) => window.id === target.window.id)?.panes.find((pane) => pane.pane === target.paneId)
  const command = body?.join(" ") || recorded?.startCommand
  await ctx.tmux.panes.respawn(target.paneId, command)
  await ctx.tmux.panes.stamp(target.paneId, await ctx.tmux.inventory.listAllPanes(), {
    agent: name,
    ...(recorded?.harness !== undefined ? { harness: recorded.harness } : {}),
    ...(command !== undefined ? { command } : {}),
  })
  process.stdout.write(`respawned ${name} pane ${target.paneId}${command !== undefined ? ` with: ${command}` : ""}\n`)
}
