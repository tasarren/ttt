import { OptionScope, PROFILES, UserOption } from "@ttt/tmux"

import { parseCommandArgs } from "../../args.ts"
import { usageError } from "../../cli-error.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { generateWindowName, mailboxNames } from "./names.ts"

/** Stem of the name a hand-made window gets: `W-1`, `W-2`; visibly not a harness, nobody's chosen name. */
export const FURNITURE_STEM = "W"

/** `W-N`: a window named by the hook, not by a person; the one kind `broadcast --all` leaves out. */
export function isScratchName(name: string): boolean {
  return new RegExp(`^${FURNITURE_STEM}-\\d+$`).test(name)
}

/**
 * Hook entry (`after-new-window`): applies the session's profile to one new window and, when
 * tmux named the window itself (a human's `prefix c`), renames it `W-N` so nobody mistakes
 * `bash` for a chosen name. No stamp: the first ttt run inside registers the seat. Silent on success; a failure line lands in tmux's
 * `show-messages`, where `doctor` finds it. Idempotent.
 */
export const normalizeWindow: TmuxVerb = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [windowId, ...extra] = positionals
  if (windowId === undefined || extra.length > 0 || !windowId.startsWith("@")) throw usageError("usage: ttt tmux _normalize-window @id")
  const session = (await ctx.tmux.inventory.listAllPanes()).find((pane) => pane.windowId === windowId)?.session
  if (session === undefined) throw usageError(`no such window: ${windowId}`)
  const profileName = await ctx.tmux.options.get({ scope: OptionScope.Session, target: session, key: UserOption.Setup })
  const profile = profileName === undefined ? undefined : PROFILES[profileName]
  if (!profile) return
  // tmux sets a window-local `automatic-rename off` exactly when `new-window -n NAME` named the
  // window; a window without that local value was named by tmux after its command.
  const namedByCaller = await ctx.tmux.options.get({ scope: OptionScope.Window, target: windowId, key: "automatic-rename" }) !== undefined
  await ctx.tmux.setup.applyWindow(windowId, profile)
  if (namedByCaller) return
  const windows = await ctx.tmux.inventory.listWindows(session)
  const live = (await ctx.tmux.inventory.listAllPanes()).filter((pane) => pane.session === session)
  const taken = new Set([...windows.map((window) => window.name), ...live.flatMap((pane) => (pane.agent === undefined ? [] : [pane.agent])), ...await mailboxNames(ctx.settings.boardRoot, session)])
  await ctx.tmux.windows.rename(windowId, generateWindowName(FURNITURE_STEM, taken))
}
