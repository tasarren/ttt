import type { LivePane } from "./inventory.ts"
import type { TmuxRunner } from "./runner.ts"

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

export const SplitDirection = {
  /** New pane below (`split-window -v`). */
  Vertical: "vertical",
  /** New pane to the right (`split-window -h`). */
  Horizontal: "horizontal",
} as const
export type SplitDirection = (typeof SplitDirection)[keyof typeof SplitDirection]

export interface SplitPaneInput {
  /** Window or pane id the new pane splits from. */
  target: string
  direction: SplitDirection
  /** Percentage of the split target the new pane takes (`30` -> 30%). */
  sizePercent?: number
  cwd?: string
  command?: string
}

/** Pane lifecycle. Every verb takes a pane or window id and returns ids. */
export class Panes {
  private readonly run: TmuxRunner

  constructor(run: TmuxRunner) {
    this.run = run
  }

  async split(input: SplitPaneInput): Promise<string> {
    const args = ["split-window", "-d", "-t", input.target, "-P", "-F", "#{pane_id}"]
    switch (input.direction) {
      case SplitDirection.Vertical:
        args.push("-v")
        break
      case SplitDirection.Horizontal:
        args.push("-h")
        break
    }
    if (input.sizePercent !== undefined) args.push("-l", `${input.sizePercent}%`)
    if (input.cwd !== undefined) args.push("-c", input.cwd)
    if (input.command !== undefined) args.push(input.command)
    const paneId = (await this.run(args)).trim()
    if (!paneId) throw new Error(`tmux split-window returned no pane id for ${input.target}`)
    return paneId
  }

  async kill(paneId: string): Promise<void> {
    await this.run(["kill-pane", "-t", paneId])
  }

  /** Restarts a pane's command; `-k` kills a still-running one first so the verb is idempotent. */
  async respawn(paneId: string, command?: string): Promise<void> {
    const args = ["respawn-pane", "-k", "-t", paneId]
    if (command !== undefined) args.push(command)
    await this.run(args)
  }

  /** `#{pane_dead}` for one pane; `send-keys` to a dead pane succeeds silently, so callers check first. */
  async isDead(paneId: string): Promise<boolean> {
    return (await this.run(["display-message", "-p", "-t", paneId, "#{pane_dead}"])).trim() === "1"
  }
}
