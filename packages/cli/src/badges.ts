import { OptionScope, UserOption, winnersByName } from "@ttt/tmux"

import type { Context } from "./context.ts"

/**
 * Copies each mailbox's unread counter into the `@ttt_unread` window option so the
 * status line can render a badge. The board keeps counting as before; this only
 * mirrors. One `list-windows` read, writes only what differs, then one status redraw.
 * Best-effort: a stale badge self-heals on anyone's next command, so a failure is
 * reported once and dropped.
 */
export async function syncBadges(ctx: Context): Promise<void> {
  if (!ctx.settings.tmux.badges) return
  try {
    const [badges, counts] = await Promise.all([
      ctx.tmux.inventory.listBadges(ctx.session),
      ctx.board.unreadCounts(),
    ])
    const writes: Promise<void>[] = []
    for (const [name, window] of winnersByName(badges)) {
      const wanted = counts.get(name) ?? 0
      if (wanted === window.unread) continue
      const ref = { scope: OptionScope.Window, target: window.id, key: UserOption.Unread } as const
      writes.push(wanted === 0 ? ctx.tmux.options.unset(ref) : ctx.tmux.options.set(ref, String(wanted)))
    }
    if (writes.length === 0) return
    await Promise.all(writes)
    await ctx.tmux.screen.refreshStatus(ctx.session)
  } catch(error) {
    process.stderr.write(`ttt: badge sync skipped: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}
