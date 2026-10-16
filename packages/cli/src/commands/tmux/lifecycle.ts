import { SplitDirection, WaitOutcome } from "@ttt/tmux"
import type { LivePane } from "@ttt/tmux"

import { boundedInt, parseCommandArgs, splitAtTerminator } from "../../args.ts"
import type { Parsed } from "../../args.ts"
import { CliError, usageError } from "../../cli-error.ts"
import type { HarnessSettings, ResolvedHarness } from "../../harnesses.ts"
import type { TmuxVerb, TmuxVerbContext } from "../../tmux-context.ts"
import { checkWindowName, generateSeatName, generateWindowName, mailboxNames } from "./names.ts"
import { requireSession, resolveAgentTarget, resolvePaneTarget } from "./target.ts"

const CREATE_OPTIONS = {
  window: { type: "string" },
  pane: { type: "string" },
  in: { type: "string" },
  harness: { type: "string" },
  shell: { type: "boolean", default: false },
  ready: { type: "string" },
  "ready-timeout": { type: "string" },
  horizontal: { type: "boolean", default: false },
  size: { type: "string" },
  cwd: { type: "string" },
} as const

export const CREATE_USAGE = `ttt create — create a registered teammate window or pane

Identity is automatic inside tmux. Omit global --session and --from.

usage:
  ttt create --window NAME|auto [--shell | --harness [NAME]] [--cwd DIR] [-- COMMAND]
  ttt create --pane [NAME] [--in WINDOW] [--shell | --harness [NAME]] [--horizontal] [--size PERCENT] [--cwd DIR] [-- COMMAND]

No program option starts the session's default shell; --shell makes that choice explicit.
--harness starts the configured default harness; --harness NAME selects a declared harness.
-- COMMAND starts a custom command. Shell, harness, and custom command choices are exclusive.
Every creation registers its teammate name immediately. No whoami step is needed.
auto names windows HARNESS-N or SHELL-N; a nameless pane becomes WINDOW-N.
--in defaults to your own window. Existing window or agent names are refused.
Harnesses wait for their ready prompt. Custom commands may use --ready REGEX|none.
--ready-timeout SECONDS changes the readiness timeout; shells do not wait.
Outside tmux, put --session NAME before create. --from does not apply.

examples:
  ttt create --window REVIEWER --shell
  ttt create --pane TESTER --in REVIEWER
  ttt create --window CODER --harness
  ttt create --pane TESTS -- pnpm test --watch`

/**
 * Creates a registered teammate, running a shell, a harness, or a custom command.
 */
export const create: TmuxVerb = async(argv, ctx) => {
  try {
    const { head, body } = splitAtTerminator(argv)
    const { values, positionals } = parseCommandArgs(withBareValues(head), CREATE_OPTIONS)
    if (positionals.length > 0) throw usageError("create takes names through --window or --pane")
    const wantsWindow = values.window !== undefined
    const wantsPane = values.pane !== undefined
    if (wantsWindow === wantsPane) throw usageError("create needs exactly one of --window or --pane")
    if (body !== undefined && !body.join(" ").trim()) throw usageError("custom command must not be empty")
    const program = resolveProgram(ctx, values, body?.join(" "))
    if (wantsWindow) {
      for (const flag of ["in", "horizontal", "size"] as const) {
        if (values[flag] !== undefined && values[flag] !== false) throw usageError(`--${flag} applies to --pane only`)
      }
      await createWindow(ctx, values, program)
      return
    }
    await createPane(ctx, values, program)
  } catch(error) {
    if (error instanceof CliError && error.exitCode === 2) throw new CliError(error.message.replace("(see: ttt --help)", "(see: ttt create --help)"), 2)
    throw error
  }
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

type CreateValues = Parsed<typeof CREATE_OPTIONS>["values"]

/** What a new pane runs and what "ready" means for it: a declared harness, or a shell/command. */
interface Program {
  command: string | undefined
  harness: ResolvedHarness | undefined
  ready: RegExp | undefined
}

function resolveProgram(ctx: TmuxVerbContext, values: CreateValues, commandArg: string | undefined): Program {
  if (values.shell && (values.harness !== undefined || commandArg !== undefined)) throw usageError("--shell cannot be combined with --harness or -- COMMAND")
  if (values.harness !== undefined && commandArg !== undefined) throw usageError("--harness cannot be combined with -- COMMAND")
  if (values.harness === undefined && commandArg === undefined && (values.ready !== undefined || values["ready-timeout"] !== undefined)) throw usageError("shells do not wait; readiness options need --harness or -- COMMAND")
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
function readinessOf(values: CreateValues, harness: ResolvedHarness | undefined, command: string | undefined): RegExp | undefined {
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

async function createWindow(ctx: TmuxVerbContext, values: CreateValues, program: Program): Promise<void> {
  const session = requireSession(ctx)
  const name = await pickWindow(ctx, session, values.window!, program.harness?.name)
  const { windowId, paneId } = await ctx.tmux.windows.open({ session, name, ...(values.cwd !== undefined ? { cwd: values.cwd } : {}), ...(program.command ? { command: program.command } : {}) })
  await ctx.tmux.panes.stamp(paneId, await ctx.tmux.inventory.listAllPanes(), {
    agent: name,
    ...(program.harness ? { harness: program.harness.name } : {}),
    ...(program.command !== undefined ? { command: program.command } : {}),
  })
  const head = `created ${name} ${windowId} pane ${paneId}`
  const waited = await awaitReady(ctx, values, program, paneId, `${name} did not become ready`, `the window ${windowId} stays open`)
  process.stdout.write(`${head}${waited === undefined ? "" : ` (${[program.harness?.name, waited].filter(Boolean).join(", ")})`}\n`)
}

/**
 * Blocks until the harness's ready line shows (visible screen only: history may hold the previous
 * process's prompt). Returns the `ready after N.Ns` note, or undefined when there was nothing to wait for.
 */
async function awaitReady(ctx: TmuxVerbContext, values: CreateValues, program: Program, paneId: string, failure: string, kept: string): Promise<string | undefined> {
  if (program.ready === undefined) return undefined
  const seconds = boundedInt(values["ready-timeout"], "--ready-timeout", ctx.settings.wait.seconds, ctx.settings.wait.maxSeconds)
  const started = Date.now()
  const result = await ctx.tmux.screen.waitFor({ target: paneId, pattern: program.ready, timeoutMs: seconds * 1_000, lines: 0 })
  if (result.outcome !== WaitOutcome.Matched) {
    throw new CliError(`${failure} (/${program.ready.source}/) within ${seconds}s; ${kept}${program.harness?.note ? ` (${program.harness.note})` : ""}`)
  }
  return `ready after ${((Date.now() - started) / 1_000).toFixed(1)}s`
}

/** A new name avoids live windows and stamps; auto also avoids old mailboxes. */
async function pickWindow(ctx: TmuxVerbContext, session: string, requested: string, harness: string | undefined): Promise<string> {
  const live = (await ctx.tmux.inventory.listAllPanes()).filter((pane) => pane.session === session)
  if (requested === "auto") return generateWindowName(harness ?? "SHELL", await takenNames(ctx, session, live))
  checkWindowName(requested)
  if (await ctx.tmux.windows.find(session, requested)) throw new CliError(`tmux window already exists: ${session}:${requested}; pick another name or --window auto`)
  const stamped = live.find((pane) => pane.agent === requested)
  if (stamped) throw new CliError(`agent ${requested} already exists in ${session}: pane ${stamped.pane} of ${stamped.window}; pick another name or --window auto`)
  return requested
}

/** Every name a new agent must avoid: live windows, live stamps, mailboxes on disk. */
async function takenNames(ctx: TmuxVerbContext, session: string, live: LivePane[]): Promise<Set<string>> {
  return new Set([
    ...(await ctx.tmux.inventory.listWindows(session)).map((window) => window.name),
    ...live.flatMap((pane) => (pane.agent === undefined ? [] : [pane.agent])),
    ...await mailboxNames(ctx.settings.boardRoot, session),
  ])
}

/** Every new pane has its own teammate name, even when it starts a plain shell. */
async function createPane(ctx: TmuxVerbContext, values: CreateValues, program: Program): Promise<void> {
  const given = values.pane === "" ? undefined : values.pane
  const windowName = values.in ?? ctx.self?.windowName
  if (windowName === undefined) throw usageError("--pane needs --in WINDOW when not run from inside an agent window")
  const target = await resolveAgentTarget(ctx, windowName)
  const agent = given ?? generateSeatName(target.window.name, await takenNames(ctx, target.session, target.live))
  if (given !== undefined) {
    checkWindowName(given)
    const stamped = target.live.find((pane) => pane.agent === given)
    if (stamped) throw new CliError(`agent ${given} already exists in ${target.session}: pane ${stamped.pane} of ${stamped.window}`)
    if (await ctx.tmux.windows.find(target.session, given)) throw new CliError(`agent ${given} already exists in ${target.session}: window ${given}`)
  }
  const paneId = await ctx.tmux.panes.split({
    target: target.paneId,
    direction: values.horizontal ? SplitDirection.Horizontal : SplitDirection.Vertical,
    ...(values.size !== undefined ? { sizePercent: boundedInt(values.size, "--size", 50, 99) } : {}),
    ...(values.cwd !== undefined ? { cwd: values.cwd } : {}),
    ...(program.command ? { command: program.command } : {}),
  })
  await ctx.tmux.panes.stamp(paneId, await ctx.tmux.inventory.listAllPanes(), {
    agent,
    ...(program.command !== undefined ? { command: program.command } : {}),
    ...(program.harness ? { harness: program.harness.name } : {}),
  })
  const waited = await awaitReady(ctx, values, program, paneId, `pane ${paneId} in ${windowName} did not become ready`, "the pane stays open")
  const notes = [`agent ${agent}`, program.harness?.name, waited].filter((note) => note !== undefined)
  process.stdout.write(`created pane ${paneId} in ${windowName} (${notes.join(", ")})\n`)
}

/** Close a window or one explicitly targeted pane; the mailbox on disk is untouched. */
export const close: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, { pane: { type: "boolean", default: false } } as const)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux close NAME | close --pane TARGET")
  if (values.pane) {
    const target = await resolvePaneTarget(ctx, name)
    if (ctx.self?.paneId === target.paneId) throw new CliError("refusing to close the pane this command runs in")
    await ctx.tmux.panes.kill(target.paneId)
    process.stdout.write(`closed pane ${target.paneId} in ${target.window.name}\n`)
    return
  }
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
  if (mailboxes.includes(from)) throw new CliError(`${from} has a mailbox; renaming would orphan it. Close ${from} and create ${to} instead`)
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
