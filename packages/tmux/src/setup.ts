import type { Hooks } from "./hooks.ts"
import type { Inventory } from "./inventory.ts"
import { OptionScope, UserOption } from "./options.ts"
import type { OptionRef, Options } from "./options.ts"
import { SetupMode } from "./profile.ts"
import type { ProfileOption, SetupProfile } from "./profile.ts"

/** Hook that normalizes windows humans open later; the command is supplied by the CLI (absolute path). */
export const NORMALIZE_HOOK = "after-new-window"

export const CheckState = {
  Ok: "ok",
  Off: "off",
  Pinned: "pinned",
} as const
export type CheckState = (typeof CheckState)[keyof typeof CheckState]

export interface OptionCheck {
  scope: OptionScope
  /** Session name, window id, or "" for server. */
  target: string
  key: string
  wanted: string
  found: string | undefined
  mode: SetupMode
  state: CheckState
  why: string
}

export interface SetupReport {
  session: string
  profile: string
  /** One row per option per target that was looked at; `pinned` rows were changed. */
  checks: OptionCheck[]
  hookInstalled: boolean
}

/** Applies a profile to one session (and its windows) with every change reversible via `@ttt_prev_*`. */
export class Setup {
  private readonly options: Options
  private readonly hooks: Hooks
  private readonly inventory: Inventory

  constructor(options: Options, hooks: Hooks, inventory: Inventory) {
    this.options = options
    this.hooks = hooks
    this.inventory = inventory
  }

  /**
   * Session and server options once, window options on every window in the session, the
   * normalize hook, and `@ttt_setup=<profile>`. Idempotent: a second run changes nothing.
   */
  async apply(session: string, profile: SetupProfile, hookCommand: string): Promise<SetupReport> {
    const checks: OptionCheck[] = []
    const windows = await this.inventory.listWindows(session)
    for (const option of profile.options) {
      for (const target of this.targetsFor(option, session, windows.map((window) => window.id))) {
        checks.push(await this.applyOne(option, target))
      }
    }
    await this.hooks.set(session, NORMALIZE_HOOK, hookCommand)
    await this.options.set({ scope: OptionScope.Session, target: session, key: UserOption.Setup }, profile.name)
    return { session, profile: profile.name, checks, hookInstalled: true }
  }

  /** The window-scoped part of `apply` for one window; what the hook runs for new windows. */
  async applyWindow(windowId: string, profile: SetupProfile): Promise<OptionCheck[]> {
    const checks: OptionCheck[] = []
    for (const option of profile.options) {
      if (option.scope !== OptionScope.Window) continue
      checks.push(await this.applyOne(option, windowId))
    }
    return checks
  }

  /** Reports without writing: every option on every target, plus whether the hook and marker are present. */
  async check(session: string, profile: SetupProfile): Promise<SetupReport> {
    const checks: OptionCheck[] = []
    const windows = await this.inventory.listWindows(session)
    for (const option of profile.options) {
      for (const target of this.targetsFor(option, session, windows.map((window) => window.id))) {
        const found = await this.options.getEffective(this.ref(option, target))
        checks.push({ ...this.row(option, target, found), state: this.satisfied(option, found) ? CheckState.Ok : CheckState.Off })
      }
    }
    const hooks = await this.hooks.list(session)
    return { session, profile: profile.name, checks, hookInstalled: hooks.some((hook) => hook.name === NORMALIZE_HOOK) }
  }

  /** Restores every pinned option on the session, its windows, and the server; removes hook and marker. */
  async revert(session: string, profile: SetupProfile): Promise<number> {
    let restored = 0
    const windows = await this.inventory.listWindows(session)
    for (const option of profile.options) {
      for (const target of this.targetsFor(option, session, windows.map((window) => window.id))) {
        if (await this.options.restore(this.ref(option, target))) restored += 1
      }
    }
    await this.hooks.unset(session, NORMALIZE_HOOK)
    await this.options.unset({ scope: OptionScope.Session, target: session, key: UserOption.Setup })
    return restored
  }

  private async applyOne(option: ProfileOption, target: string): Promise<OptionCheck> {
    const ref = this.ref(option, target)
    const found = await this.options.getEffective(ref)
    const row = this.row(option, target, found)
    if (this.satisfied(option, found)) return { ...row, state: CheckState.Ok }
    if (option.mode === SetupMode.Assert) return { ...row, state: CheckState.Off }
    await this.options.pin(ref, option.value)
    return { ...row, state: CheckState.Pinned }
  }

  private satisfied(option: ProfileOption, found: string | undefined): boolean {
    switch (option.mode) {
      case SetupMode.Pin:
      case SetupMode.Assert:
        return found === option.value
      case SetupMode.PinLowerOnly:
        return found !== undefined && Number(found) <= Number(option.value)
    }
  }

  private targetsFor(option: ProfileOption, session: string, windowIds: string[]): string[] {
    switch (option.scope) {
      case OptionScope.Server:
        return [""]
      case OptionScope.Session:
        return [session]
      case OptionScope.Window:
        return windowIds
      case OptionScope.Pane:
        return []
    }
  }

  private ref(option: ProfileOption, target: string): OptionRef {
    return option.scope === OptionScope.Server ? { scope: option.scope, key: option.key } : { scope: option.scope, target, key: option.key }
  }

  private row(option: ProfileOption, target: string, found: string | undefined): Omit<OptionCheck, "state"> {
    return { scope: option.scope, target, key: option.key, wanted: option.value, found, mode: option.mode, why: option.why }
  }
}
