import type { LivePane, TmuxWindow } from "./inventory.ts"
import { OptionScope, UserOption } from "./options.ts"
import type { Options } from "./options.ts"
import type { TmuxRunner } from "./runner.ts"

/** Where an agent's messages land: its window and pane, and whether a stamp says so. */
export interface AgentSeat {
  windowId: string
  windowName: string
  paneId: string
  /** True when a pane is stamped `@ttt_agent=NAME`; false when the window's lowest pane stands in. */
  registered: boolean
}

/**
 * One pane truth for notify, capture and typing. A pane stamped `@ttt_agent=NAME` anywhere in
 * the session is NAME's seat (a secondary agent lives in another agent's window). Without a
 * stamp, the window called NAME seats its main agent in its lowest-index pane: a teammate is
 * reachable before it has ever run ttt. Never the active pane. Pure: unit-tests run on fake
 * arrays, no tmux server.
 */
export function resolveAgent(live: LivePane[], window: TmuxWindow | undefined, name: string): AgentSeat | undefined {
  const stamped = live.find((pane) => pane.agent === name)
  if (stamped) return { windowId: stamped.windowId, windowName: stamped.window, paneId: stamped.pane, registered: true }
  if (!window) return undefined
  const lowest = live.filter((pane) => pane.windowId === window.id).sort((a, b) => a.index - b.index)[0]
  if (!lowest) return undefined
  return { windowId: window.id, windowName: window.name, paneId: lowest.pane, registered: false }
}

/**
 * How a `ttt tmux` verb names a pane: `NAME` is the window's agent pane, `NAME.N` its pane with
 * index N (`pane_index`, base-index aware), `%id` a pane id anywhere in the session.
 */
export type PaneAddress =
  | { kind: "agent"; window: string }
  | { kind: "index"; window: string; index: number }
  | { kind: "id"; pane: string }

export function parsePaneAddress(text: string): PaneAddress | undefined {
  if (/^%\d+$/.test(text)) return { kind: "id", pane: text }
  const dotted = /^(?<window>[^.]+)\.(?<index>\d+)$/.exec(text)
  if (dotted?.groups) return { kind: "index", window: dotted.groups["window"]!, index: Number(dotted.groups["index"]) }
  if (text.length > 0 && !text.includes(".")) return { kind: "agent", window: text }
  return undefined
}

/** What ttt stamps on a pane it starts or identifies; each field maps to one `@ttt_*` option. */
export interface PaneStamp {
  /** The agent seated here: the window name for its main agent, `WINDOW-N` or a given name otherwise. */
  agent?: string
  harness?: string
  command?: string
  /** Helper-pane title; never set together with `agent`. */
  title?: string
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
  private readonly options: Options

  constructor(run: TmuxRunner, options: Options) {
    this.run = run
    this.options = options
  }

  /**
   * Stamps ttt's pane options. With `agent`, marks `paneId` as NAME's seat and clears that same
   * name from every other pane in `live`, so one name sits in one pane; other agents' stamps in
   * the window are untouched. Only writes what differs; a pane already stamped costs nothing.
   */
  async stamp(paneId: string, live: LivePane[], stamp: PaneStamp): Promise<void> {
    const me = live.find((pane) => pane.pane === paneId)
    const writes: Promise<void>[] = []
    if (stamp.agent !== undefined && me?.agent !== stamp.agent) {
      writes.push(this.options.set({ scope: OptionScope.Pane, target: paneId, key: UserOption.Agent }, stamp.agent))
    }
    if (stamp.harness !== undefined) {
      writes.push(this.options.set({ scope: OptionScope.Pane, target: paneId, key: UserOption.Harness }, stamp.harness))
    }
    if (stamp.command !== undefined) {
      writes.push(this.options.set({ scope: OptionScope.Pane, target: paneId, key: UserOption.Command }, stamp.command))
    }
    if (stamp.title !== undefined) {
      writes.push(this.options.set({ scope: OptionScope.Pane, target: paneId, key: UserOption.Title }, stamp.title))
    }
    if (stamp.agent !== undefined) {
      for (const other of live) {
        if (other.pane === paneId || other.agent !== stamp.agent) continue
        writes.push(this.options.unset({ scope: OptionScope.Pane, target: other.pane, key: UserOption.Agent }))
      }
    }
    await Promise.all(writes)
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
  async respawn(paneId: string, command?: string, cwd?: string): Promise<void> {
    const args = ["respawn-pane", "-k", "-t", paneId]
    if (cwd !== undefined) args.push("-c", cwd)
    if (command !== undefined) args.push(command)
    await this.run(args)
  }

  /** `#{pane_dead}` for one pane; `send-keys` to a dead pane succeeds silently, so callers check first. */
  async isDead(paneId: string): Promise<boolean> {
    return (await this.run(["display-message", "-p", "-t", paneId, "#{pane_dead}"])).trim() === "1"
  }
}
