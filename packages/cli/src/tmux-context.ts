import { Tmux } from "@ttt/tmux"

import { TTT_VERSION } from "./version.ts"
import type { TmuxContext } from "@ttt/tmux"

import { resolveSettings } from "./settings.ts"
import type { Settings } from "./settings.ts"

/**
 * What a `ttt tmux` verb needs. Lighter than `Context`: no board, no sender identity, and it
 * works outside tmux (setup creates the session that does not exist yet). `--session` alone is
 * accepted here because no mailbox is involved.
 */
export interface TmuxVerbContext {
  settings: Settings
  tmux: Tmux
  /** The session named by `--session`, else the one we run in, else undefined (outside tmux). */
  session: string | undefined
  /** Our own pane and window when detectable; undefined outside tmux. */
  self: TmuxContext | undefined
  /** Path of this executable, used to build the normalize hook command. */
  binPath: string
  /** The running ttt's version, for skill freshness checks. */
  version: string
}

export type TmuxVerb = (argv: string[], ctx: TmuxVerbContext) => Promise<void>

export async function createTmuxContext(sessionOverride: string | undefined, binPath: string): Promise<TmuxVerbContext> {
  const settings = await resolveSettings()
  const tmux = new Tmux(settings.tmux)
  await tmux.requireVersion()
  // Outside tmux there is nothing to detect; `setup` is expected to run from there.
  const self = await tmux.identity.detect(settings.currentPane).catch(() => undefined)
  return { settings, tmux, session: sessionOverride ?? self?.session, self, binPath, version: TTT_VERSION }
}
