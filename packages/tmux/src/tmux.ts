import { Identity, procAncestors } from "./context.ts"
import type { AncestorResolver } from "./context.ts"
import { Hooks } from "./hooks.ts"
import { Input } from "./input.ts"
import type { TmuxOptions } from "./input.ts"
import { Inventory } from "./inventory.ts"
import { Options } from "./options.ts"
import { Panes } from "./panes.ts"
import { TmuxError, TmuxFailure, parseVersion, runTmux, versionAtLeast } from "./runner.ts"
import type { TmuxRunner } from "./runner.ts"
import { Screen } from "./screen.ts"
import { Windows } from "./windows.ts"

/** Oldest tmux the setup verbs support: pane user options and `display-popup` arrived in 3.2. */
export const MIN_TMUX_VERSION: readonly [number, number] = [3, 2]

/**
 * The tmux server as ttt sees it. Holds one runner and one option set, and exposes each concern
 * as a sub-object; the CLI composes exactly one `Tmux` per invocation.
 */
export class Tmux {
  readonly inventory: Inventory
  readonly identity: Identity
  readonly windows: Windows
  readonly panes: Panes
  readonly input: Input
  readonly screen: Screen
  readonly options: Options
  readonly hooks: Hooks
  private readonly run: TmuxRunner
  private version: Promise<readonly [number, number] | undefined> | undefined

  constructor(options: TmuxOptions, run: TmuxRunner = runTmux, ancestors: AncestorResolver = procAncestors) {
    this.run = run
    this.inventory = new Inventory(run)
    this.identity = new Identity(run, this.inventory, ancestors)
    this.windows = new Windows(run, this.inventory)
    this.panes = new Panes(run)
    this.input = new Input(run, options)
    this.screen = new Screen(run)
    this.options = new Options(run)
    this.hooks = new Hooks(run)
  }

  /** Once per instance; throws `unsupported_version` style `TmuxError` below `MIN_TMUX_VERSION`. */
  async requireVersion(minimum: readonly [number, number] = MIN_TMUX_VERSION): Promise<void> {
    this.version ??= this.run(["-V"]).then(parseVersion)
    const found = await this.version
    if (found === undefined) throw new TmuxError(TmuxFailure.Unknown, "-V", "could not read the tmux version")
    if (!versionAtLeast(found, minimum)) {
      throw new TmuxError(TmuxFailure.Unknown, "-V", `tmux ${found.join(".")} is too old; ttt tmux needs ${minimum.join(".")} or newer`)
    }
  }
}
