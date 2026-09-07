import { TmuxError, TmuxFailure } from "./runner.ts"
import type { TmuxRunner } from "./runner.ts"

export const OptionScope = {
  Server: "server",
  Session: "session",
  Window: "window",
  Pane: "pane",
} as const
export type OptionScope = (typeof OptionScope)[keyof typeof OptionScope]

/** Every user option ttt writes, in one place so nothing else spells them. */
export const UserOption = {
  /** Pane: the window name of the agent that owns this pane. */
  Agent: "@ttt_agent",
  /** Pane: the harness running in the pane (`claude`, `opencode`, ...). */
  Harness: "@ttt_harness",
  /** Pane: the command line ttt started the pane with, for `save`. */
  Command: "@ttt_command",
  /** Pane: a human-readable title for a helper pane (no identity), shown in the border. */
  Title: "@ttt_title",
  /** Window: unread message count for the badge. */
  Unread: "@ttt_unread",
  /** Session: set once setup has normalized the session. */
  Setup: "@ttt_setup",
} as const
export type UserOption = (typeof UserOption)[keyof typeof UserOption]

/** Prefix under which `pin` saves the previous value of an option on the same target. */
export const PREVIOUS_PREFIX = "@ttt_prev_"

export interface OptionRef {
  scope: OptionScope
  /** Session name or id, window id, pane id; ignored for `server`. */
  target?: string
  key: string
}

function scopeFlags(scope: OptionScope): string[] {
  switch (scope) {
    case OptionScope.Server:
      return ["-s"]
    case OptionScope.Session:
      return []
    case OptionScope.Window:
      return ["-w"]
    case OptionScope.Pane:
      return ["-p"]
  }
}

function targetFlags(ref: OptionRef): string[] {
  return ref.scope !== OptionScope.Server && ref.target !== undefined ? ["-t", ref.target] : []
}

/** Reading and writing tmux options with explicit scope. Global (`-g`) is never written. */
export class Options {
  private readonly run: TmuxRunner

  constructor(run: TmuxRunner) {
    this.run = run
  }

  /** The option's explicit value on that target; undefined when unset there (inherited values do not count). */
  async get(ref: OptionRef): Promise<string | undefined> {
    try {
      const value = await this.run(["show-options", ...scopeFlags(ref.scope), ...targetFlags(ref), "-v", ref.key])
      const text = value.replace(/\n$/, "")
      return text === "" ? undefined : text
    } catch(error) {
      // tmux reports an unset user option as `invalid option`; that is "absent", not a failure.
      if (error instanceof TmuxError && error.code === TmuxFailure.BadOption && ref.key.startsWith("@")) return undefined
      throw error
    }
  }

  /** The effective value, following inheritance (`-A`). */
  async getEffective(ref: OptionRef): Promise<string | undefined> {
    const value = await this.run(["show-options", ...scopeFlags(ref.scope), ...targetFlags(ref), "-A", "-v", ref.key]).catch((error: unknown) => {
      if (error instanceof TmuxError && error.code === TmuxFailure.BadOption) return ""
      throw error
    })
    const text = value.replace(/\n$/, "")
    return text === "" ? undefined : text
  }

  async set(ref: OptionRef, value: string): Promise<void> {
    await this.run(["set-option", ...scopeFlags(ref.scope), ...targetFlags(ref), ref.key, value])
  }

  async unset(ref: OptionRef): Promise<void> {
    await this.run(["set-option", ...scopeFlags(ref.scope), ...targetFlags(ref), "-u", ref.key]).catch((error: unknown) => {
      if (error instanceof TmuxError && error.code === TmuxFailure.BadOption) return
      throw error
    })
  }

  /**
   * Sets an option after saving its previous explicit value under `@ttt_prev_<key>` on the same
   * target, so `restore` needs no file. A second pin does not overwrite the saved original.
   */
  async pin(ref: OptionRef, value: string): Promise<void> {
    const saved: OptionRef = { ...ref, key: previousKey(ref.key) }
    if (await this.get(saved) === undefined) {
      // Session/window/pane options inherit, so "unset here" is a faithful original and restoring
      // it means unsetting. Server options have no parent: the effective value is the original.
      const current = ref.scope === OptionScope.Server ? await this.getEffective(ref) : await this.get(ref)
      await this.set(saved, current === undefined ? UNSET_MARKER : current)
    }
    await this.set(ref, value)
  }

  /** Restores one pinned option to what it was before `pin` and drops the saved copy. */
  async restore(ref: OptionRef): Promise<boolean> {
    const saved: OptionRef = { ...ref, key: previousKey(ref.key) }
    const previous = await this.get(saved)
    if (previous === undefined) return false
    if (previous === UNSET_MARKER) await this.unset(ref)
    else await this.set(ref, previous)
    await this.unset(saved)
    return true
  }
}

/** tmux cannot store an empty user option, so "was unset" is spelled out. */
const UNSET_MARKER = "<unset>"

export function previousKey(key: string): string {
  return `${PREVIOUS_PREFIX}${key.replace(/^@/, "").replaceAll("-", "_")}`
}
