import { OptionScope, TmuxError, TmuxFailure, parsePaneAddress, resolveAgent } from "@ttt/tmux"
import type { LivePane, TmuxWindow } from "@ttt/tmux"

import { CliError, usageError } from "../../cli-error.ts"
import type { TmuxVerbContext } from "../../tmux-context.ts"

export interface PaneTarget {
  session: string
  window: TmuxWindow
  paneId: string
  /** The agent seated in `paneId` (a stamp, or the window's main agent when its first pane stands in); undefined for a plain pane. */
  agent: string | undefined
  live: LivePane[]
}

/** The session these verbs act on: `--session` or the one we run in. */
export function requireSession(ctx: TmuxVerbContext): string {
  if (ctx.session === undefined) throw usageError("not inside tmux; pass --session NAME before the command")
  return ctx.session
}

/**
 * `NAME` -> the seat of that agent (the same truth notify and capture use): a pane stamped NAME
 * anywhere in the session, else the first pane of the window called NAME.
 */
export async function resolveAgentTarget(ctx: TmuxVerbContext, name: string): Promise<PaneTarget> {
  const session = requireSession(ctx)
  const live = (await ctx.tmux.inventory.listAllPanes()).filter((pane) => pane.session === session)
  const seat = resolveAgent(live, await ctx.tmux.windows.find(session, name), name)
  if (!seat) throw new CliError(`tmux window does not exist: ${session}:${name}`)
  return { session, window: { id: seat.windowId, name: seat.windowName }, paneId: seat.paneId, agent: name, live }
}

/** `NAME`, `NAME.N` or `%id` -> one live pane in the session, with the agent seated there if any. */
export async function resolvePaneTarget(ctx: TmuxVerbContext, text: string): Promise<PaneTarget> {
  const session = requireSession(ctx)
  const address = parsePaneAddress(text)
  if (address === undefined) throw usageError(`bad pane target ${JSON.stringify(text)}: use NAME, NAME.N or %id`)
  if (address.kind === "agent") return resolveAgentTarget(ctx, address.window)
  const live = (await ctx.tmux.inventory.listAllPanes()).filter((pane) => pane.session === session)
  const pane = address.kind === "id"
    ? live.find((candidate) => candidate.pane === address.pane)
    : live.find((candidate) => candidate.window === address.window && candidate.index === address.index)
  if (!pane) {
    if (address.kind === "id") throw new CliError(`pane ${address.pane} is not in session ${session}`)
    if (!await ctx.tmux.windows.find(session, address.window)) throw new CliError(`tmux window does not exist: ${session}:${address.window}`)
    throw new CliError(`window ${address.window} has no pane ${address.index}`)
  }
  const window = { id: pane.windowId, name: pane.window }
  return { session, window, paneId: pane.pane, agent: seatedIn(live, window, pane), live }
}

/** Who a pane answers for: its stamp, or the window's main agent when nothing there is stamped and this is the first pane. */
function seatedIn(live: LivePane[], window: TmuxWindow, pane: LivePane): string | undefined {
  if (pane.agent !== undefined) return pane.agent
  return resolveAgent(live, window, window.name)?.paneId === pane.pane ? window.name : undefined
}

/**
 * Typing verbs refuse two silent failure modes: `send-keys` into a dead pane succeeds and
 * does nothing, and a synchronized window would deliver the keys to every pane.
 */
export async function requireTypable(ctx: TmuxVerbContext, target: PaneTarget): Promise<void> {
  if (await ctx.tmux.panes.isDead(target.paneId)) {
    throw new TmuxError(TmuxFailure.PaneDead, "send-keys", `pane ${target.paneId} of ${target.window.name} is dead; run: ttt tmux respawn ${target.window.name}`)
  }
  const synchronized = await ctx.tmux.options.getEffective({ scope: OptionScope.Window, target: target.window.id, key: "synchronize-panes" })
  if (synchronized === "on") throw new CliError(`window ${target.window.name} has synchronize-panes on; keys would reach every pane`)
}
