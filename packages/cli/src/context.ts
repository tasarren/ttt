import { join } from "node:path"

import { Board, assertName } from "@ttt/board"
import { Tmux } from "@ttt/tmux"
import type { TmuxWindow } from "@ttt/tmux"

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
  if (overrides.session !== undefined) {
    if (overrides.from === undefined) throw usageError("--session needs --from NAME")
    session = overrides.session
    senderName = overrides.from
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
    if (overrides.from === undefined) senderId = detected.windowId
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
    lock: settings.lock,
  })
  void board.sweepTempFiles()
  return { settings, session, senderName, senderId, tmux, board, binPath }
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
