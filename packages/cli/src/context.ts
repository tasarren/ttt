import { join } from "node:path"

import { Board, assertName } from "@ttt/board"
import type { Actor } from "@ttt/board"
import { Tmux } from "@ttt/tmux"
import type { DetectionSource, TmuxWindow } from "@ttt/tmux"

import { CliError, usageError } from "./cli-error.ts"
import { resolveSettings } from "./settings.ts"
import type { Settings } from "./settings.ts"

/** Everything a command needs, wired once per invocation. */
export interface Context {
  settings: Settings
  session: string
  /** The window name messages are sent as, and the mailbox that is read. */
  senderName: string
  /** The current tmux window id, or "" when the identity was overridden with `--from`. */
  senderId: string
  /** The exact pane this invocation runs in, or "" when overridden or undetectable. */
  senderPane: string
  /** Which link of the resolution chain identified us; `override` for explicit flags. */
  via: DetectionSource | "override"
  /** Detected performer for receipt audit; undefined when undetectable (detached). */
  actor: Actor | undefined
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
  let senderId = ""
  let senderPane = ""
  let via: Context["via"]
  let actor: Actor | undefined
  if (overrides.session !== undefined) {
    if (overrides.from === undefined) throw usageError("--session needs --from NAME")
    session = overrides.session
    senderName = overrides.from
    via = "override"
    // The override picks the mailbox, but detection still feeds receipt audit.
    // Detached processes (the notifier) detect nothing; fields stay absent.
    try {
      const actual = await tmux.detectContext(settings.currentPane)
      actor = { window: actual.windowName, session: actual.session }
    } catch {
      actor = undefined
    }
  } else {
    let detected
    try {
      detected = await tmux.detectContext(settings.currentPane)
    } catch(error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new CliError(`ttt must run inside tmux, or pass --session SESSION --from NAME (${reason})`)
    }
    session = detected.session
    senderName = overrides.from ?? detected.windowName
    if (overrides.from === undefined) {
      senderId = detected.windowId
      senderPane = detected.paneId
    }
    via = overrides.from === undefined ? detected.via : "override"
    actor = { window: detected.windowName, session: detected.session }
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
  return { settings, session, senderName, senderId, senderPane, via, actor, tmux, board, binPath }
}

export async function requireWindow(ctx: Context, name: string): Promise<TmuxWindow> {
  const window = await ctx.tmux.findWindow(ctx.session, name)
  if (!window) throw new CliError(`tmux window does not exist: ${ctx.session}:${name}`)
  return window
}

export function isSelf(ctx: Context, window: TmuxWindow): boolean {
  if (ctx.senderId) {
    // Duplicate names share one mailbox, so a same-named twin counts as self even when the id differs.
    return window.id === ctx.senderId || window.name === ctx.senderName
  }
  return window.name === ctx.senderName
}
