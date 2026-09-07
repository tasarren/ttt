import { OptionScope, TmuxError, TmuxFailure, parsePaneAddress, resolveAgentPane } from "@ttt/tmux"
import type { LivePane, TmuxWindow } from "@ttt/tmux"

import { CliError, usageError } from "../../cli-error.ts"
import type { TmuxVerbContext } from "../../tmux-context.ts"

export interface PaneTarget {
  session: string
  window: TmuxWindow
  paneId: string
  /** True when `paneId` is the window's stamped agent pane. */
  agent: boolean
  live: LivePane[]
}

/** The session these verbs act on: `--session` or the one we run in. */
export function requireSession(ctx: TmuxVerbContext): string {
  if (ctx.session === undefined) throw usageError("not inside tmux; pass --session NAME before the command")
  return ctx.session
}

/**
 * `NAME` -> the agent pane (the same truth notify and capture use). A window with no stamped pane
 * is furniture: it can be driven by pane (`NAME.N`, `%id`) but has no agent to address, and the
 * error says how to give it one.
 */
export async function resolveAgentTarget(ctx: TmuxVerbContext, name: string): Promise<PaneTarget> {
  const target = await resolvePaneTarget(ctx, name)
  if (!target.agent) throw new CliError(furnitureMessage(target.window.name))
  return target
}

/** `NAME`, `NAME.N` or `%id` -> one live pane in the session, with whether it is the agent pane. */
export async function resolvePaneTarget(ctx: TmuxVerbContext, text: string): Promise<PaneTarget> {
  const session = requireSession(ctx)
  const address = parsePaneAddress(text)
  if (address === undefined) throw usageError(`bad pane target ${JSON.stringify(text)}: use NAME, NAME.N or %id`)
  const live = await ctx.tmux.inventory.listAllPanes()
  switch (address.kind) {
    case "id": {
      const pane = live.find((candidate) => candidate.session === session && candidate.pane === address.pane)
      if (!pane) throw new CliError(`pane ${address.pane} is not in session ${session}`)
      const window = await requireWindow(ctx, session, pane.window)
      return { session, window, paneId: pane.pane, agent: pane.agent === window.name, live }
    }
    case "index": {
      const window = await requireWindow(ctx, session, address.window)
      const pane = live.find((candidate) => candidate.windowId === window.id && candidate.index === address.index)
      if (!pane) throw new CliError(`window ${window.name} has no pane ${address.index}`)
      return { session, window, paneId: pane.pane, agent: pane.agent === window.name, live }
    }
    case "agent": {
      const window = await requireWindow(ctx, session, address.window)
      const paneId = resolveAgentPane(live, window.id, window.name)
      if (paneId === undefined) {
        const only = live.filter((candidate) => candidate.windowId === window.id)
        // A one-pane furniture window is unambiguous to drive; messaging it is refused elsewhere.
        if (only.length === 1) return { session, window, paneId: only[0]!.pane, agent: false, live }
        throw new CliError(`${furnitureMessage(window.name)}; to drive one of its ${only.length} panes use ${window.name}.N or %id`)
      }
      return { session, window, paneId, agent: true, live }
    }
  }
}

export function furnitureMessage(windowName: string): string {
  return `window ${windowName} has no agent pane (nothing there runs ttt); start one with: ttt tmux open --window ${windowName} --harness NAME`
}

async function requireWindow(ctx: TmuxVerbContext, session: string, name: string): Promise<TmuxWindow> {
  const window = await ctx.tmux.windows.find(session, name)
  if (!window) throw new CliError(`tmux window does not exist: ${session}:${name}`)
  return window
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
