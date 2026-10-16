import { readFile } from "node:fs/promises"

import type { Inventory } from "./inventory.ts"
import type { TmuxRunner } from "./runner.ts"

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

export const DetectionSource = {
  PidWalk: "pid-walk",
  PaneEnv: "pane-env",
} as const
export type DetectionSource = (typeof DetectionSource)[keyof typeof DetectionSource]

export interface TmuxContext {
  session: string
  windowName: string
  windowId: string
  paneId: string
  /** Which link of the resolution chain identified us; never the active window. */
  via: DetectionSource
}

const CONTEXT_FORMAT = "#{session_name}\t#{window_name}\t#{window_id}\t#{pane_id}"

/**
 * Who we are: the session/window/pane this process runs in, resolved without ever
 * trusting the tmux active window (a human switching panes must not reassign identity).
 */
export class Identity {
  private readonly run: TmuxRunner
  private readonly inventory: Inventory
  private readonly ancestors: AncestorResolver

  constructor(run: TmuxRunner, inventory: Inventory, ancestors: AncestorResolver = procAncestors) {
    this.run = run
    this.inventory = inventory
    this.ancestors = ancestors
  }

  /**
   * First our own PID ancestry matched against live panes, then the `$TMUX_PANE` hint,
   * else a hard error naming the explicit override flags. An unattached tmux client
   * resolves bare targets to the *active* window, so the hint is always passed with `-t`.
   */
  async detect(pane: string | undefined): Promise<TmuxContext> {
    const chain: number[] = await this.ancestors().catch(() => [])
    if (chain.length > 0) {
      const live = await this.inventory.listAllPanes().catch(() => [])
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
}
