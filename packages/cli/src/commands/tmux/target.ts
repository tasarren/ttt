import { OptionScope, TmuxError, TmuxFailure, resolveAgentPane } from "@ttt/tmux"
import type { LivePane, TmuxWindow } from "@ttt/tmux"

import { CliError, usageError } from "../../cli-error.ts"
import type { TmuxVerbContext } from "../../tmux-context.ts"

export interface AgentTarget {
  session: string
  window: TmuxWindow
  /** The agent's pane (stamped, else lowest index). */
  paneId: string
  live: LivePane[]
}

/** The session these verbs act on: `--session` or the one we run in. */
export function requireSession(ctx: TmuxVerbContext): string {
  if (ctx.session === undefined) throw usageError("not inside tmux; pass --session NAME before the command")
  return ctx.session
}

/** Window name -> the agent pane in it, with the same truth notify and capture use. */
export async function resolveAgentTarget(ctx: TmuxVerbContext, name: string): Promise<AgentTarget> {
  const session = requireSession(ctx)
  const window = await ctx.tmux.windows.find(session, name)
  if (!window) throw new CliError(`tmux window does not exist: ${session}:${name}`)
  const live = await ctx.tmux.inventory.listAllPanes()
  return { session, window, paneId: resolveAgentPane(live, window.id, window.name), live }
}

/**
 * Typing verbs refuse two silent failure modes: `send-keys` into a dead pane succeeds and
 * does nothing, and a synchronized window would deliver the keys to every pane.
 */
export async function requireTypable(ctx: TmuxVerbContext, target: AgentTarget): Promise<void> {
  if (await ctx.tmux.panes.isDead(target.paneId)) {
    throw new TmuxError(TmuxFailure.PaneDead, "send-keys", `pane ${target.paneId} of ${target.window.name} is dead; run: ttt tmux respawn ${target.window.name}`)
  }
  const synchronized = await ctx.tmux.options.getEffective({ scope: OptionScope.Window, target: target.window.id, key: "synchronize-panes" })
  if (synchronized === "on") throw new CliError(`window ${target.window.name} has synchronize-panes on; keys would reach every pane`)
}
