import { join } from "node:path"

import { Board, assertName } from "@ttt/board"
import type { Actor } from "@ttt/board"
import { Tmux, resolveAgent, winnersByName } from "@ttt/tmux"
import type { AgentSeat, DetectionSource, LivePane, TmuxWindow } from "@ttt/tmux"

import { CliError, usageError } from "./cli-error.ts"
import { generateSeatName, mailboxNames } from "./commands/tmux/names.ts"
import { resolveSettings } from "./settings.ts"
import type { Settings } from "./settings.ts"

/** Everything a command needs, wired once per invocation. */
export interface Context {
  settings: Settings
  session: string
  /** The agent name messages are sent as, and the mailbox that is read. */
  senderName: string
  /** The current tmux window name; equals senderName for a window's main agent. */
  windowName: string
  /** The current tmux window id, or "" when the identity was overridden with `--from`. */
  senderId: string
  /** The exact pane this invocation runs in, or "" when overridden or undetectable. */
  senderPane: string
  /** Which link of the resolution chain identified us; `override` for explicit flags. */
  via: DetectionSource | "override"
  /** Detected performer for receipt audit; undefined when undetectable (detached). */
  actor: Actor | undefined
  /** True when this invocation stamped its own pane: the agent registered its seat just now. */
  claimed: boolean
  tmux: Tmux
  board: Board
  /** Path of this executable, used to spawn the detached notifier. */
  binPath: string
}

export type Handler = (argv: string[], ctx: Context) => Promise<void>

export interface GlobalOverrides {
  session?: string
  from?: string
}

/** Sender name used by the detached notifier process. */
export const NOTIFIER_NAME = "ttt"

export async function createContext(overrides: GlobalOverrides, binPath: string): Promise<Context> {
  const settings = await resolveSettings()
  const tmux = new Tmux(settings.tmux)

  let session: string
  let senderName: string
  let windowName: string
  let senderId = ""
  let senderPane = ""
  let via: Context["via"]
  let actor: Actor | undefined
  let claimed = false
  if (overrides.session !== undefined) {
    if (overrides.from === undefined) throw usageError("--session needs --from NAME")
    session = overrides.session
    senderName = overrides.from
    windowName = overrides.from
    via = "override"
    // The override picks the mailbox, but detection still feeds receipt audit.
    // Detached processes (the notifier) detect nothing; fields stay absent.
    try {
      const actual = await tmux.identity.detect(settings.currentPane)
      actor = { window: actual.windowName, session: actual.session }
    } catch {
      actor = undefined
    }
  } else {
    let detected
    try {
      detected = await tmux.identity.detect(settings.currentPane)
    } catch(error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new CliError(`ttt must run inside tmux, or pass --session SESSION --from NAME (${reason})`)
    }
    session = detected.session
    windowName = detected.windowName
    senderName = overrides.from ?? detected.windowName
    if (overrides.from === undefined) {
      senderId = detected.windowId
      senderPane = detected.paneId
    }
    via = overrides.from === undefined ? detected.via : "override"
    actor = { window: detected.windowName, session: detected.session }
    // Running ttt from a pane registers it as the seat of an agent: the window's main agent when
    // no other pane holds that name, else a second agent named WINDOW-N. Both detection sources
    // name the exact pane (the env hint is `$TMUX_PANE` of this process's shell, never the
    // active pane). Awaited so a short command cannot exit before the stamp lands; best-effort
    // so a failed stamp never fails the command.
    if (overrides.from === undefined) {
      try {
        const seat = await registerSeat(tmux, settings.boardRoot, detected.session, detected.windowName, detected.paneId)
        senderName = seat.name
        claimed = seat.claimed
      } catch {
        // tmux refused the option write; identity falls back to the window name for this run
        claimed = false
      }
    }
  }

  try {
    assertName(session, "tmux session name")
    assertName(senderName, "sender name")
  } catch(error) {
    throw new CliError(error instanceof Error ? error.message : String(error), 2)
  }

  const board = new Board({
    sessionRoot: join(settings.boardRoot, session),
    notifySeconds: settings.notifySeconds,
    notifyOverrides: settings.notifyOverrides,
    lock: settings.lock,
  })
  void board.sweepTempFiles()
  return { settings, session, senderName, windowName, senderId, senderPane, via, actor, claimed, tmux, board, binPath }
}

/**
 * The name this pane answers to: its own stamp when it has one; else the window name when no
 * pane carries it yet and this is the window's first pane (the seat an unregistered window
 * already answers from); else `WINDOW-N`, N lowest such that no window, stamp, or mailbox in
 * the session uses it (an old mailbox would be inherited silently).
 */
async function registerSeat(tmux: Tmux, boardRoot: string, session: string, windowName: string, paneId: string): Promise<{ name: string; claimed: boolean }> {
  const live = await tmux.inventory.listAllPanes()
  const me = live.find((pane) => pane.pane === paneId)
  if (me?.agent !== undefined) return { name: me.agent, claimed: false }
  const inSession = live.filter((pane) => pane.session === session)
  const main = resolveAgent(inSession, me ? { id: me.windowId, name: windowName } : undefined, windowName)
  let name = windowName
  if (main?.paneId !== paneId) {
    const taken = new Set<string>([
      ...inSession.map((pane) => pane.window),
      ...inSession.flatMap((pane) => (pane.agent === undefined ? [] : [pane.agent])),
      ...await mailboxNames(boardRoot, session),
    ])
    name = generateSeatName(windowName, taken)
  }
  await tmux.panes.stamp(paneId, live, { agent: name })
  return { name, claimed: true }
}

/** An agent's seat plus the window it sits in; every window name resolves, registered or not. */
export interface Agent {
  window: TmuxWindow
  seat: AgentSeat
}

/**
 * NAME is a stamped pane anywhere in the session, else the lowest pane of the window called
 * NAME (a teammate that has not run ttt yet is still reachable), else an error.
 */
export async function requireAgent(ctx: Context, name: string): Promise<Agent> {
  const live = await ctx.tmux.inventory.listAllPanes()
  const winners = winnersByName(await ctx.tmux.inventory.listWindows(ctx.session))
  return agentIn(ctx, live, winners, name)
}

export function agentIn(ctx: Context, live: LivePane[], winners: Map<string, TmuxWindow>, name: string): Agent {
  const inSession = live.filter((pane) => pane.session === ctx.session)
  const seat = resolveAgent(inSession, winners.get(name), name)
  if (!seat) throw new CliError(`tmux window does not exist: ${ctx.session}:${name}`)
  return { window: { id: seat.windowId, name: seat.windowName }, seat }
}

/** Names, not window ids: a secondary agent may message the main agent of its own window. */
export function isSelf(ctx: Context, name: string): boolean {
  return name === ctx.senderName
}
