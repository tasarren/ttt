import { spawn } from "node:child_process"

import type { BoardMessage, NotificationMarker, NotificationSummary } from "@ttt/board"
import { resolveAgentPane, type TmuxWindow } from "@ttt/tmux"

import { parseCommandArgs } from "../args.ts"
import { CliError, usageError } from "../cli-error.ts"
import { NOTIFIER_NAME, requireWindow } from "../context.ts"
import type { Context, Handler } from "../context.ts"

/**
 * Starts a detached copy of this CLI that waits out the batching window and then pastes one summary line
 * into the target window. If a newer marker replaces this token meanwhile, the child exits silently.
 * A failed spawn cleans up its marker so the next send can schedule a live notifier.
 */
export function spawnNotifier(ctx: Context, marker: NotificationMarker): void {
  let child
  try {
    child = spawn(process.execPath, [
      ctx.binPath,
      "--session", ctx.session,
      "--from", NOTIFIER_NAME,
      "_notify",
      "--target", marker.target,
      "--token", marker.token,
    ], { detached: true, stdio: "ignore" })
  } catch(error) {
    process.stderr.write(`ttt: notifier spawn failed for ${marker.target}: ${error instanceof Error ? error.message : String(error)}\n`)
    void ctx.board.cancelNotification(marker.target, marker.token).catch(() => undefined)
    return
  }
  child.on("error", (error) => {
    process.stderr.write(`ttt: notifier spawn failed for ${marker.target}: ${error.message}\n`)
    void ctx.board.cancelNotification(marker.target, marker.token).catch(() => undefined)
  })
  child.unref()
}

/** Hidden `_notify --target T --token K`: the body of the detached notifier. */
export const notify: Handler = async(argv, ctx) => {
  const { values } = parseCommandArgs(argv, { target: { type: "string" }, token: { type: "string" } } as const)
  if (values.target === undefined || values.token === undefined) throw usageError("_notify needs --target and --token")
  const target = values.target
  const token = values.token
  // The paste runs inside the mailbox lock, so re-arming happens after deliverNotification unwinds it.
  try {
    await ctx.board.deliverNotification(target, token, async(summary) => {
      try {
        const window = await requireWindow(ctx, target)
        await pasteToTeammate(ctx, target, window, formatNotification(summary))
      } catch(error) {
        process.stderr.write(`ttt: notification paste to ${target} failed: ${error instanceof Error ? error.message : String(error)}\n`)
        throw new CancelledNotification(target)
      }
    })
  } catch(error) {
    if (!(error instanceof CancelledNotification)) throw error
    await ctx.board.cancelNotification(target, token)
    const marker = await ctx.board.scheduleNotification(target)
    if (marker) spawnNotifier(ctx, marker)
  }
}

/** Thrown after a failed paste is re-armed, so the dead delivery is not retried or marked done. */
class CancelledNotification extends Error {
  constructor(target: string) {
    super(`notification to ${target} re-armed after a failed paste`)
    this.name = "CancelledNotification"
  }
}

/** One short line: the recipient spends tokens on the batch, not on the interruption. */
export function formatNotification(summary: NotificationSummary): string {
  const senders = summary.senders.map(({ name, count }) => `${name}(${count})`).join(", ")
  return `ttt: ${summary.newCount} new from ${senders}; ${summary.unreadTotal} unread. Run: ttt read`
}

/**
 * Pastes into the target's agent pane (see `resolveAgentPane`); dead bindings
 * are pruned. Failures propagate so the notifier re-arms and urgent falls
 * back, as before.
 */
async function pasteToTeammate(ctx: Context, target: string, window: TmuxWindow, text: string): Promise<void> {
  const live = await ctx.tmux.listAllPanes().catch(() => [])
  const binding = await ctx.board.resolvePane(target)
  const hit = binding && live.some((pane) => pane.pane === binding.paneId && pane.windowId === binding.windowId)
  if (binding && !hit) await ctx.board.prunePane(target)
  await ctx.tmux.sendText(resolveAgentPane(live, window.id, hit ? binding : undefined), text)
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
      await ctx.board.deliverUrgent(message, name, (urgent) => pasteToTeammate(ctx, name, window, formatUrgent(urgent)))
    } catch(error) {
      failures.push(name)
      process.stderr.write(`ttt: urgent delivery to ${name} failed: ${error instanceof Error ? error.message : String(error)}\n`)
      const marker = await ctx.board.scheduleNotification(name)
      if (marker) spawnNotifier(ctx, marker)
    }
  }
  if (failures.length === windows.size) throw new CliError(`urgent delivery failed for all recipients: ${failures.join(", ")}`)
}
