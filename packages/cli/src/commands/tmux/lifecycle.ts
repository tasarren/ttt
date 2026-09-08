import { SplitDirection, WaitOutcome } from "@ttt/tmux"
import type { LivePane } from "@ttt/tmux"

import { boundedInt, parseCommandArgs, splitAtTerminator } from "../../args.ts"
import type { Parsed } from "../../args.ts"
import { CliError, usageError } from "../../cli-error.ts"
import type { HarnessSettings, ResolvedHarness } from "../../harnesses.ts"
import type { TmuxVerb, TmuxVerbContext } from "../../tmux-context.ts"
import { checkWindowName, generateSeatName, generateWindowName, mailboxNames } from "./names.ts"
import { FURNITURE_STEM } from "./normalize-window.ts"
import { requireSession, resolveAgentTarget } from "./target.ts"

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
  "usage: ttt tmux open --window NAME|auto [--harness [NAME]] [--ready REGEX|none] [--ready-timeout SECONDS] [--cwd DIR] [-- COMMAND]",
  "       ttt tmux open --pane [TITLE|AGENT] [--harness [NAME]] [--ready REGEX|none] [--ready-timeout SECONDS] [--in WINDOW] [--horizontal] [--size PERCENT] [--cwd DIR] [-- COMMAND]",
].join("\n")

/**
 * `ttt tmux open`: a window (`--window`: its main agent is named like it) or a pane in an existing
 * window (`--pane`: a titled helper, or with `--harness` a second agent registered under the given
 * name or `WINDOW-N`). The flag is required so the caller chooses on purpose. Either container
 * may run a harness (`--harness [NAME]`; bare means the settings' default), a command, or a shell.
 */
export const open: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(withBareValues(head), OPEN_OPTIONS)
  if (positionals.length > 0) throw usageError(OPEN_USAGE)
  const wantsWindow = values.window !== undefined
  const wantsPane = values.pane !== undefined
  if (wantsWindow === wantsPane) throw usageError(`open needs exactly one of --window or --pane\n${OPEN_USAGE}`)
  const program = resolveProgram(ctx, values, body?.join(" ") || undefined)
  if (wantsWindow) {
    for (const flag of ["in", "horizontal", "size"] as const) {
      if (values[flag] !== undefined && values[flag] !== false) throw usageError(`--${flag} applies to --pane only`)
    }
    await openWindow(ctx, values, program)
    return
  }
  await openPane(ctx, values, program)
}

const BARE_FLAGS = new Set(["--harness", "--pane"])

/**
 * `parseArgs` has no optional-valued string option, so a bare `--harness` or `--pane` (followed
 * by another flag or nothing) is spelled `--harness=` / `--pane=` before parsing; the empty
 * value means "the default harness" / "no name".
 */
export function withBareValues(argv: string[]): string[] {
  return argv.map((arg, index) => {
    if (!BARE_FLAGS.has(arg)) return arg
    const next = argv[index + 1]
    return next === undefined || next.startsWith("-") ? `${arg}=` : arg
  })
}

type OpenValues = Parsed<typeof OPEN_OPTIONS>["values"]

/** What a new pane runs and what "ready" means for it: a declared harness, or a shell/command. */
interface Program {
  command: string | undefined
  harness: ResolvedHarness | undefined
  ready: RegExp | undefined
}

function resolveProgram(ctx: TmuxVerbContext, values: OpenValues, commandArg: string | undefined): Program {
  const harness = values.harness === undefined ? undefined : pickHarness(ctx.settings.harnesses, values.harness)
  const command = commandArg ?? harness?.bin
  return { command, harness, ready: readinessOf(values, harness, command) }
}

/** Empty name = the settings' default; any other name must be declared (or shipped, without a section). */
function pickHarness(settings: HarnessSettings, requested: string): ResolvedHarness {
  const declared = Object.keys(settings.declared).join(", ")
  const where = settings.source === "shipped" ? `shipped: ${declared}` : `declared in ${settings.source}: ${declared}`
  if (requested === "") {
    if (settings.defaultName === undefined) throw usageError(`no default harness; set harnesses.NAME.default to true in ${settings.source === "shipped" ? "~/.ttt/settings.jsonc" : settings.source} (${where})`)
    return settings.declared[settings.defaultName]!
  }
  const found = Object.hasOwn(settings.declared, requested) ? settings.declared[requested] : undefined
  if (!found) throw usageError(`unknown harness ${JSON.stringify(requested)}; ${where}`)
  return found
}

/** `--ready REGEX` wins, `--ready none` opts out, else the harness's regex, else nothing to wait for. */
function readinessOf(values: OpenValues, harness: ResolvedHarness | undefined, command: string | undefined): RegExp | undefined {
  if (values.ready === "none") return undefined
  if (values.ready !== undefined) {
    if (command === undefined) throw usageError("--ready needs something to wait for: pass --harness or -- COMMAND")
    try {
      return new RegExp(values.ready)
    } catch(error) {
      throw usageError(`--ready is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return harness?.ready
}

async function openWindow(ctx: TmuxVerbContext, values: OpenValues, program: Program): Promise<void> {
  const session = requireSession(ctx)
  const picked = await pickWindow(ctx, session, values.window!, program.harness?.name)
  let windowId: string
  let paneId: string
  if (picked.adopt) {
    // An unregistered one-pane window is adopted: its pane is restarted with the command, then stamped.
    windowId = picked.adopt.windowId
    paneId = picked.adopt.paneId
    await ctx.tmux.panes.respawn(paneId, program.command, values.cwd)
  } else {
    const opened = await ctx.tmux.windows.open({ session, name: picked.name, ...(values.cwd !== undefined ? { cwd: values.cwd } : {}), ...(program.command ? { command: program.command } : {}) })
    windowId = opened.windowId
    paneId = opened.paneId
  }
  const name = picked.name
  // A window running a harness or a command has its main agent seated from the start. A plain
  // shell is left unregistered: its first pane receives until something there runs ttt.
  if (program.command !== undefined) {
    await ctx.tmux.panes.stamp(paneId, await ctx.tmux.inventory.listAllPanes(), {
      agent: name,
      ...(program.harness ? { harness: program.harness.name } : {}),
      command: program.command,
    })
  }
  const verb = picked.adopt ? "adopted" : "opened"
  const head = `${verb} ${name} ${windowId} pane ${paneId}`
  const waited = await awaitReady(ctx, values, program, paneId, `${name} did not become ready`, `the window ${windowId} stays open`)
  process.stdout.write(`${head}${waited === undefined ? "" : ` (${[program.harness?.name, waited].filter(Boolean).join(", ")})`}\n`)
}

/**
 * Blocks until the harness's ready line shows (visible screen only: history may hold the previous
 * process's prompt). Returns the `ready after N.Ns` note, or undefined when there was nothing to wait for.
 */
async function awaitReady(ctx: TmuxVerbContext, values: OpenValues, program: Program, paneId: string, failure: string, kept: string): Promise<string | undefined> {
  if (program.ready === undefined) return undefined
  const seconds = boundedInt(values["ready-timeout"], "--ready-timeout", ctx.settings.wait.seconds, ctx.settings.wait.maxSeconds)
  const started = Date.now()
  const result = await ctx.tmux.screen.waitFor({ target: paneId, pattern: program.ready, timeoutMs: seconds * 1_000, lines: 0 })
  if (result.outcome !== WaitOutcome.Matched) {
    throw new CliError(`${failure} (/${program.ready.source}/) within ${seconds}s; ${kept}${program.harness?.note ? ` (${program.harness.note})` : ""}`)
  }
  return `ready after ${((Date.now() - started) / 1_000).toFixed(1)}s`
}

interface PickedWindow {
  name: string
  /** Set when an existing window with that name is unregistered: it gets adopted instead of refused. */
  adopt?: { windowId: string; paneId: string }
}

/**
 * `auto` generates `HARNESS-N`, or `W-N` for a shell. A given name must be valid and not be a
 * live stamp anywhere; if a window already carries it, it is adopted when unregistered with one
 * pane, and refused when its agent is seated.
 */
async function pickWindow(ctx: TmuxVerbContext, session: string, requested: string, harness: string | undefined): Promise<PickedWindow> {
  const live = (await ctx.tmux.inventory.listAllPanes()).filter((pane) => pane.session === session)
  if (requested === "auto") return { name: generateWindowName(harness ?? FURNITURE_STEM, await takenNames(ctx, session, live)) }
  checkWindowName(requested)
  const existing = await ctx.tmux.windows.find(session, requested)
  const stamped = live.find((pane) => pane.agent === requested)
  if (stamped && stamped.windowId !== existing?.id) throw new CliError(`agent ${requested} already exists in ${session}: pane ${stamped.pane} of ${stamped.window}; pick another name or --window auto`)
  if (!existing) return { name: requested }
  const panes = live.filter((pane) => pane.windowId === existing.id)
  if (stamped) throw new CliError(`tmux window already exists: ${session}:${requested} (its agent is seated in ${stamped.pane}; pick another name or --window auto)`)
  if (panes.length !== 1) throw new CliError(`window ${requested} has ${panes.length} panes and no registered agent; adopting needs exactly one pane (close the others, or pick another name)`)
  return { name: requested, adopt: { windowId: existing.id, paneId: panes[0]!.pane } }
}

/** Every name a new agent must avoid: live windows, live stamps, mailboxes on disk. */
async function takenNames(ctx: TmuxVerbContext, session: string, live: LivePane[]): Promise<Set<string>> {
  return new Set([
    ...(await ctx.tmux.inventory.listWindows(session)).map((window) => window.name),
    ...live.flatMap((pane) => (pane.agent === undefined ? [] : [pane.agent])),
    ...await mailboxNames(ctx.settings.boardRoot, session),
  ])
}

/**
 * With a harness the pane is a second agent in the window: registered as the given name, or
 * `WINDOW-N` when none is given, never as the window's own name. Without one it is a helper
 * (optionally titled) that becomes `WINDOW-N` the day something in it runs ttt.
 */
async function openPane(ctx: TmuxVerbContext, values: OpenValues, program: Program): Promise<void> {
  const given = values.pane === "" ? undefined : values.pane
  const windowName = values.in ?? ctx.self?.windowName
  if (windowName === undefined) throw usageError("--pane needs --in WINDOW when not run from inside an agent window")
  const target = await resolveAgentTarget(ctx, windowName)
  let agent: string | undefined
  if (program.harness) {
    agent = given ?? generateSeatName(target.window.name, await takenNames(ctx, target.session, target.live))
    if (given !== undefined) {
      checkWindowName(given)
      const stamped = target.live.find((pane) => pane.agent === given)
      if (stamped) throw new CliError(`agent ${given} already exists in ${target.session}: pane ${stamped.pane} of ${stamped.window}`)
      if (await ctx.tmux.windows.find(target.session, given)) throw new CliError(`agent ${given} already exists in ${target.session}: window ${given}`)
    }
  }
  const paneId = await ctx.tmux.panes.split({
    target: target.paneId,
    direction: values.horizontal ? SplitDirection.Horizontal : SplitDirection.Vertical,
    ...(values.size !== undefined ? { sizePercent: boundedInt(values.size, "--size", 50, 99) } : {}),
    ...(values.cwd !== undefined ? { cwd: values.cwd } : {}),
    ...(program.command ? { command: program.command } : {}),
  })
  const title = agent === undefined ? given : undefined
  if (program.command || title !== undefined || agent !== undefined) {
    await ctx.tmux.panes.stamp(paneId, await ctx.tmux.inventory.listAllPanes(), {
      ...(agent !== undefined ? { agent } : {}),
      ...(program.command ? { command: program.command } : {}),
      ...(program.harness ? { harness: program.harness.name } : {}),
      ...(title !== undefined ? { title } : {}),
    })
  }
  const waited = await awaitReady(ctx, values, program, paneId, `pane ${paneId} in ${windowName} did not become ready`, "the pane stays open")
  const notes = [agent !== undefined ? `agent ${agent}` : title, program.harness?.name, waited].filter((note) => note !== undefined)
  process.stdout.write(`opened pane ${paneId} in ${windowName}${notes.length > 0 ? ` (${notes.join(", ")})` : ""}\n`)
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
 * `ttt tmux rename OLD NEW`: renames a window and moves its main agent's stamp with it; second
 * agents (`OLD-N`, given names) keep theirs. Refused once OLD has a mailbox on disk: the name is
 * the mailbox key, and a rename would orphan queued messages and split the thread history.
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
  const mailboxes = await mailboxNames(ctx.settings.boardRoot, session)
  if (mailboxes.includes(from)) throw new CliError(`${from} has a mailbox; renaming would orphan it. Close ${from} and open ${to} instead`)
  if (mailboxes.includes(to)) throw new CliError(`${to} has an old mailbox that ${from} would inherit; pick another name`)
  const live = (await ctx.tmux.inventory.listAllPanes()).filter((pane) => pane.session === session)
  const stamped = live.find((pane) => pane.agent === to)
  if (stamped) throw new CliError(`agent ${to} already exists in ${session}: pane ${stamped.pane} of ${stamped.window}`)
  const agentPane = live.find((pane) => pane.windowId === window.id && pane.agent === from)?.pane
  await ctx.tmux.windows.rename(window.id, to)
  if (agentPane !== undefined) await ctx.tmux.panes.stamp(agentPane, live, { agent: to })
  process.stdout.write(`renamed ${from} to ${to} ${window.id}${agentPane !== undefined ? ` (agent pane ${agentPane} follows)` : ""}\n`)
}

/** `ttt tmux respawn NAME [-- COMMAND]`: restarts NAME's seat (default: its recorded `@ttt_command`) and re-stamps it. */
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
