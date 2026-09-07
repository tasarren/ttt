import { OptionScope, PROFILES, UserOption } from "@ttt/tmux"

import { parseCommandArgs } from "../../args.ts"
import { usageError } from "../../cli-error.ts"
import type { TmuxVerb } from "../../tmux-context.ts"

/**
 * Hook entry (`after-new-window`): applies the session's profile to one new window. Silent on
 * success; a failure line lands in tmux's `show-messages`, where `doctor` finds it. Idempotent.
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
  await ctx.tmux.setup.applyWindow(windowId, profile)
}
