import { execFile } from "node:child_process"
import { randomBytes } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/** Runs one tmux command and returns its stdout. Injectable so tests never need a tmux server. */
export type TmuxRunner = (args: string[]) => Promise<string>

export const runTmux: TmuxRunner = async(args) => (await execFileAsync("tmux", args)).stdout

export interface TmuxOptions {
  /** Pause after clearing the target's input line, before pasting. */
  inputSettleMs: number
  /** Pause after the paste and between Enter presses. */
  postPasteMs: number
  /** How many times Enter is pressed after the paste; slow TUIs may swallow the first ones. */
  enterPresses: number
  /** Pause after the last Enter before returning. */
  postSendMs: number
}

export const DEFAULT_TMUX_OPTIONS: TmuxOptions = {
  inputSettleMs: 800,
  postPasteMs: 500,
  enterPresses: 3,
  postSendMs: 300,
}

export interface TmuxWindow {
  name: string
  id: string
}

/** Numeric part of a tmux window id (`@10` -> 10); undefined when the id has no numeric form. */
function windowIdNumber(id: string): number | undefined {
  const match = /^@(\d+)$/.exec(id)
  return match ? Number(match[1]) : undefined
}

/**
 * Ordering for duplicate window names: the lowest window id wins (`@1` beats `@2`, `@2` beats `@10`).
 * Non-numeric ids fall back to string order so the choice stays deterministic.
 */
export function compareWindowIds(a: string, b: string): number {
  const left = windowIdNumber(a)
  const right = windowIdNumber(b)
  if (left !== undefined && right !== undefined) return left - right
  return a.localeCompare(b)
}

export interface TmuxContext {
  session: string
  windowName: string
  windowId: string
  paneId: string
}

const CONTEXT_FORMAT = "#{session_name}\t#{window_name}\t#{window_id}\t#{pane_id}"

export class Tmux {
  private readonly options: TmuxOptions
  private readonly run: TmuxRunner

  constructor(options: TmuxOptions, run: TmuxRunner = runTmux) {
    this.options = options
    this.run = run
  }

  /**
   * The session/window/pane this process runs in. Pass `$TMUX_PANE`: an unattached client (no tty, as when
   * spawned by an agent) is otherwise resolved to the session's active window, not the caller's.
   */
  async detectContext(pane: string | undefined): Promise<TmuxContext> {
    const target = pane ? ["-t", pane] : []
    const line = (await this.run(["display-message", "-p", ...target, CONTEXT_FORMAT])).trim()
    const [session, windowName, windowId, paneId] = line.split("\t")
    if (!session || !windowName || !windowId || !paneId) {
      throw new Error(`unexpected tmux context: ${JSON.stringify(line)}`)
    }
    return { session, windowName, windowId, paneId }
  }

  async listWindows(session: string): Promise<TmuxWindow[]> {
    const stdout = await this.run(["list-windows", "-t", session, "-F", "#{window_name}\t#{window_id}"])
    return stdout
      .split("\n")
      .map((line) => line.split("\t"))
      .filter((parts): parts is [string, string] => parts.length === 2 && parts[0] !== "" && parts[1] !== "")
      .map(([name, id]) => ({ name, id }))
  }

  async findWindow(session: string, name: string): Promise<TmuxWindow | undefined> {
    let winner: TmuxWindow | undefined
    for (const window of await this.listWindows(session)) {
      if (window.name !== name) continue
      if (!winner || compareWindowIds(window.id, winner.id) < 0) winner = window
    }
    return winner
  }

  /** Clears the target's input line, pastes `text` through a private buffer, then presses Enter. */
  async sendText(windowId: string, text: string): Promise<void> {
    const { inputSettleMs, postPasteMs, enterPresses, postSendMs } = this.options
    const buffer = `ttt-${process.pid}-${randomBytes(4).toString("hex")}`

    await this.run(["send-keys", "-t", windowId, "C-u"])
    if (inputSettleMs > 0) await sleep(inputSettleMs)
    await this.run(["set-buffer", "-b", buffer, "--", text])
    try {
      await this.run(["paste-buffer", "-b", buffer, "-d", "-t", windowId])
      if (postPasteMs > 0) await sleep(postPasteMs)
      for (let press = 0; press < enterPresses; press += 1) {
        await this.run(["send-keys", "-t", windowId, "Enter"])
        if (postPasteMs > 0 && press + 1 < enterPresses) await sleep(postPasteMs)
      }
      if (postSendMs > 0) await sleep(postSendMs)
    } finally {
      // paste-buffer -d already deleted it on success; this only matters when the paste failed.
      await this.run(["delete-buffer", "-b", buffer]).catch(() => undefined)
    }
  }

  /** Last `lines` lines of the target pane. `joinWrapped` re-joins lines tmux wrapped at the pane width. */
  async capture(windowId: string, lines: number, joinWrapped: boolean): Promise<string> {
    const args = ["capture-pane", "-p", "-t", windowId, "-S", `-${lines}`]
    if (joinWrapped) args.push("-J")
    return this.run(args)
  }
}
