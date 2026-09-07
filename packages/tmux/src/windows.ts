import type { Inventory, TmuxWindow } from "./inventory.ts"
import type { TmuxRunner } from "./runner.ts"

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

export interface OpenWindowInput {
  session: string
  name: string
  cwd?: string
  /** Shell command the window's first pane runs; the session's default shell when absent. */
  command?: string
}

/** Window lifecycle and lookup. Ids in, ids out; names are resolved here and nowhere else. */
export class Windows {
  private readonly run: TmuxRunner
  private readonly inventory: Inventory

  constructor(run: TmuxRunner, inventory: Inventory) {
    this.run = run
    this.inventory = inventory
  }

  async find(session: string, name: string): Promise<TmuxWindow | undefined> {
    return winnersByName(await this.inventory.listWindows(session)).get(name)
  }

  /** Creates a detached window and returns its id plus its first pane id. */
  async open(input: OpenWindowInput): Promise<{ windowId: string; paneId: string }> {
    const args = ["new-window", "-d", "-t", input.session, "-n", input.name, "-P", "-F", "#{window_id}\t#{pane_id}"]
    if (input.cwd !== undefined) args.push("-c", input.cwd)
    if (input.command !== undefined) args.push(input.command)
    const [windowId, paneId] = (await this.run(args)).trim().split("\t")
    if (!windowId || !paneId) throw new Error(`tmux new-window returned no ids for ${input.session}:${input.name}`)
    return { windowId, paneId }
  }

  async close(windowId: string): Promise<void> {
    await this.run(["kill-window", "-t", windowId])
  }
}
