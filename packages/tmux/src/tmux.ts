import { execFile } from "node:child_process"
import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/** Runs one tmux command and returns its stdout. Injectable so tests never need a tmux server. */
export type TmuxRunner = (args: string[]) => Promise<string>

export const runTmux: TmuxRunner = async(args) => (await execFileAsync("tmux", args)).stdout

/** Returns our own ancestor PIDs. Injectable so unit tests never read the real process tree. */
export type AncestorResolver = () => Promise<number[]>

/** Walks `/proc` from our own PID up; missing entries end the chain, never throw. */
export async function procAncestors(): Promise<number[]> {
  const chain: number[] = []
  let pid = process.pid
  for (;;) {
    let stat: string
    try {
      stat = await readFile(`/proc/${pid}/stat`, "utf8")
    } catch {
      return chain
    }
    const ppid = Number(stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/)[1])
    if (!Number.isInteger(ppid) || ppid <= 0) return chain
    chain.push(ppid)
    if (ppid === 1) return chain
    pid = ppid
  }
}

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

/** One live pane: identity plus the process id the pane started from. */
export interface LivePane {
  session: string
  window: string
  windowId: string
  pane: string
  /** Positional index within the window; 0 is the original pane. */
  index: number
  pid: number
}

/** Minimal pane binding: what the board remembers per window. Structural on
 * purpose — `@ttt/tmux` never imports `@ttt/board`. */
export interface PaneTarget {
  paneId: string
  windowId: string
}

/**
 * One pane truth for notify and capture: the registered pane when it is still
 * that window's live pane, else the window's lowest-index pane (the agent's
 * original pane — never the active pane, which is whoever touched it last),
 * else the window id when nothing live is known. Pure: unit-tests run on fake
 * arrays, no tmux server needed.
 */
export function resolveAgentPane(live: LivePane[], windowId: string, binding: PaneTarget | undefined): string {
  if (binding) {
    const hit = live.find((pane) => pane.pane === binding.paneId)
    if (hit && hit.windowId === binding.windowId) return binding.paneId
  }
  const first = live.filter((pane) => pane.windowId === windowId).sort((a, b) => a.index - b.index)[0]
  return first ? first.pane : windowId
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

/** Lowest id wins per window name; duplicate names share one mailbox. */
export function winnersByName(windows: TmuxWindow[]): Map<string, TmuxWindow> {
  const winners = new Map<string, TmuxWindow>()
  for (const window of windows) {
    const current = winners.get(window.name)
    if (!current || compareWindowIds(window.id, current.id) < 0) winners.set(window.name, window)
  }
  return winners
}

export interface TmuxContext {
  session: string
  windowName: string
  windowId: string
  paneId: string
  /** Which link of the resolution chain identified us; never the active window. */
  via: DetectionSource
}

export const DetectionSource = {
  PidWalk: "pid-walk",
  PaneEnv: "pane-env",
} as const
export type DetectionSource = (typeof DetectionSource)[keyof typeof DetectionSource]

const CONTEXT_FORMAT = "#{session_name}\t#{window_name}\t#{window_id}\t#{pane_id}"

export class Tmux {
  private readonly options: TmuxOptions
  private readonly run: TmuxRunner
  private readonly ancestors: AncestorResolver

  constructor(options: TmuxOptions, run: TmuxRunner = runTmux, ancestors: AncestorResolver = procAncestors) {
    this.options = options
    this.run = run
    this.ancestors = ancestors
  }

  /**
   * The session/window/pane this process runs in, resolved without ever trusting
   * the tmux active window (a human switching panes must not reassign identity):
   * first our own PID ancestry matched against live panes, then the `$TMUX_PANE`
   * hint, else a hard error naming the explicit override flags.
   */
  async detectContext(pane: string | undefined): Promise<TmuxContext> {
    const chain: number[] = await this.ancestors().catch(() => [])
    if (chain.length > 0) {
      const live: LivePane[] = await this.listAllPanes().catch(() => [])
      const hit = live.find((candidate) => chain.includes(candidate.pid))
      if (hit) {
        return { session: hit.session, windowName: hit.window, windowId: hit.windowId, paneId: hit.pane, via: DetectionSource.PidWalk }
      }
    }
    if (pane !== undefined) {
      const line = (await this.run(["display-message", "-p", "-t", pane, CONTEXT_FORMAT])).trim()
      const [session, windowName, windowId, paneId] = line.split("\t")
      if (!session || !windowName || !windowId || !paneId) {
        throw new Error(`unexpected tmux context: ${JSON.stringify(line)}`)
      }
      return { session, windowName, windowId, paneId, via: DetectionSource.PaneEnv }
    }
    throw new Error("ttt cannot tell which tmux pane you are in (no pane ancestry, no TMUX_PANE); pass --session SESSION --from WINDOW")
  }

  /** Every live pane on this server, with the process id each pane started from. */
  async listAllPanes(): Promise<LivePane[]> {
    const stdout = await this.run(["list-panes", "-a", "-F", "#{session_name}\t#{window_name}\t#{window_id}\t#{pane_id}\t#{pane_index}\t#{pane_pid}"])
    const panes: LivePane[] = []
    for (const line of stdout.split("\n")) {
      const [session, window, windowId, pane, rawIndex, rawPid] = line.split("\t")
      const pid = Number(rawPid)
      const index = Number(rawIndex)
      if (!session || !window || !windowId || !pane || !Number.isInteger(pid) || !Number.isInteger(index)) continue
      panes.push({ session, window, windowId, pane, index, pid })
    }
    return panes
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
    return winnersByName(await this.listWindows(session)).get(name)
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

  /** Last `lines` lines of the resolved target (a pane id, else a window id
   * which tmux reads as its active pane). `joinWrapped` re-joins lines tmux
   * wrapped at the pane width. */
  async capture(target: string, lines: number, joinWrapped: boolean): Promise<string> {
    const args = ["capture-pane", "-p", "-t", target, "-S", `-${lines}`]
    if (joinWrapped) args.push("-J")
    return this.run(args)
  }
}
