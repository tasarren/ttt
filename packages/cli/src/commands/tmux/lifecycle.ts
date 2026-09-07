import { SplitDirection } from "@ttt/tmux"
import { assertName } from "@ttt/board"

import { boundedInt, parseCommandArgs, splitAtTerminator } from "../../args.ts"
import { CliError, usageError } from "../../cli-error.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { requireSession, resolveAgentTarget } from "./target.ts"

const OPEN_OPTIONS = { cwd: { type: "string" }, harness: { type: "string" } } as const

/** `ttt tmux open NAME [--cwd DIR] [--harness H] [-- COMMAND]`: a stamped agent window. */
export const open: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, OPEN_OPTIONS)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux open NAME [--cwd DIR] [--harness NAME] [-- COMMAND]")
  checkName(name)
  const session = requireSession(ctx)
  if (await ctx.tmux.windows.find(session, name)) throw new CliError(`tmux window already exists: ${session}:${name}`)
  const command = body?.join(" ")
  const opened = await ctx.tmux.windows.open({ session, name, ...(values.cwd !== undefined ? { cwd: values.cwd } : {}), ...(command ? { command } : {}) })
  await ctx.tmux.panes.stamp(opened.paneId, await ctx.tmux.inventory.listAllPanes(), {
    agent: name,
    ...(values.harness !== undefined ? { harness: values.harness } : {}),
    ...(command ? { command } : {}),
  })
  process.stdout.write(`opened ${name} ${opened.windowId} pane ${opened.paneId}\n`)
}

/** `ttt tmux close NAME`: kills the whole window; the mailbox on disk is untouched. */
export const close: TmuxVerb = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux close NAME")
  const target = await resolveAgentTarget(ctx, name)
  if (ctx.self?.windowId === target.window.id) throw new CliError("refusing to close the window this command runs in")
  await ctx.tmux.windows.close(target.window.id)
  process.stdout.write(`closed ${name} ${target.window.id}\n`)
}

const SPLIT_OPTIONS = { horizontal: { type: "boolean", default: false }, size: { type: "string" }, cwd: { type: "string" } } as const

/** `ttt tmux split NAME [--horizontal] [--size PCT] [-- COMMAND]`: a helper pane next to the agent; never the agent pane. */
export const split: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { values, positionals } = parseCommandArgs(head, SPLIT_OPTIONS)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux split NAME [--horizontal] [--size PERCENT] [--cwd DIR] [-- COMMAND]")
  const target = await resolveAgentTarget(ctx, name)
  const command = body?.join(" ")
  const paneId = await ctx.tmux.panes.split({
    target: target.paneId,
    direction: values.horizontal ? SplitDirection.Horizontal : SplitDirection.Vertical,
    ...(values.size !== undefined ? { sizePercent: boundedInt(values.size, "--size", 50, 99) } : {}),
    ...(values.cwd !== undefined ? { cwd: values.cwd } : {}),
    ...(command ? { command } : {}),
  })
  if (command) await ctx.tmux.panes.stamp(paneId, await ctx.tmux.inventory.listAllPanes(), { command })
  process.stdout.write(`split ${name}: pane ${paneId}\n`)
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

function checkName(name: string): void {
  try {
    assertName(name, "window name")
  } catch(error) {
    throw usageError(error instanceof Error ? error.message : String(error))
  }
}
