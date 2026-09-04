import { spawn } from "node:child_process"

import type { BoardMessage, NotificationMarker, NotificationSummary } from "@ttt/board"
import type { TmuxWindow } from "@ttt/tmux"

import { parseCommandArgs } from "../args.ts"
import { CliError, usageError } from "../cli-error.ts"
import { NOTIFIER_NAME, requireWindow } from "../context.ts"
import type { Context, Handler } from "../context.ts"

/**
 * Starts a detached copy of this CLI that waits out the batching window and then pastes one summary line
 * into the target window. If a newer marker replaces this token meanwhile, the child exits silently.
 */
export function spawnNotifier(ctx: Context, marker: NotificationMarker): void {
  const child = spawn(process.execPath, [
    ctx.binPath,
    "--session", ctx.session,
    "--from", NOTIFIER_NAME,
    "_notify",
    "--target", marker.target,
    "--token", marker.token,
  ], { detached: true, stdio: "ignore" })
  child.unref()
}

/** Hidden `_notify --target T --token K`: the body of the detached notifier. */
export const notify: Handler = async(argv, ctx) => {
  const { values } = parseCommandArgs(argv, { target: { type: "string" }, token: { type: "string" } } as const)
  if (values.target === undefined || values.token === undefined) throw usageError("_notify needs --target and --token")
  const target = values.target
  await ctx.board.deliverNotification(target, values.token, async(summary) => {
    const window = await requireWindow(ctx, target)
    await ctx.tmux.sendText(window.id, formatNotification(summary))
  })
}

/** One short line: the recipient spends tokens on the batch, not on the interruption. */
export function formatNotification(summary: NotificationSummary): string {
  const senders = summary.senders.map(({ name, count }) => `${name}(${count})`).join(", ")
  return `ttt: ${summary.newCount} new from ${senders}; ${summary.unreadTotal} unread. Run: ttt read`
}

export function formatUrgent(message: BoardMessage): string {
  const instruction = message.replyExpected
    ? `Reply with: ttt reply ${message.messageId} -- MESSAGE`
    : "No reply required."
  return `URGENT from ${message.from} [${message.messageId}]:\n\n${message.body}\n\n${instruction}`
}

/** Pastes an urgent message into every recipient now; a failed paste falls back to a batched notification. */
export async function pushUrgent(ctx: Context, message: BoardMessage, windows: Map<string, TmuxWindow>): Promise<void> {
  const failures: string[] = []
  for (const [name, window] of windows) {
    try {
      await ctx.board.deliverUrgent(message, name, (urgent) => ctx.tmux.sendText(window.id, formatUrgent(urgent)))
    } catch(error) {
      failures.push(name)
      process.stderr.write(`ttt: urgent delivery to ${name} failed: ${error instanceof Error ? error.message : String(error)}\n`)
      const marker = await ctx.board.scheduleNotification(name)
      if (marker) spawnNotifier(ctx, marker)
    }
  }
  if (failures.length === windows.size) throw new CliError(`urgent delivery failed for all recipients: ${failures.join(", ")}`)
}
