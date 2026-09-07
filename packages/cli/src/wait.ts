import { watch } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"

import type { BoardMessage, Presence } from "@ttt/board"

import type { Context } from "./context.ts"

/** inotify can drop events under load; the poll makes a missed wake cost at most this long. */
const POLL_MS = 2_000

export const WaitOutcome = {
  Arrived: "arrived",
  TimedOut: "timed_out",
  Interrupted: "interrupted",
} as const
export type WaitOutcome = (typeof WaitOutcome)[keyof typeof WaitOutcome]

export interface WaitResult {
  outcome: WaitOutcome
  /** The unread messages that satisfied the wait, oldest first; empty unless `arrived`. */
  messages: BoardMessage[]
}

export interface WaitInput {
  /** Only a message in this thread wakes the wait; `"any"` wakes on anything unread. */
  expect: Presence["expect"]
  timeoutMs: number
}

/**
 * Blocks until the caller's mailbox holds a matching unread message, the timeout passes, or
 * the process is asked to stop. Order matters for the lost-wakeup window: arm the watcher,
 * announce presence (so senders stop pasting), then scan once for anything already there.
 * Presence is always withdrawn on exit, so a sender never mistakes a finished wait for a live one.
 */
export async function waitForMail(ctx: Context, input: WaitInput): Promise<WaitResult> {
  const controller = new AbortController()
  const stop = (): void => {
    controller.abort()
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  const mailbox = await ctx.board.mailboxPath(ctx.senderName)
  let poke: (() => void) | undefined
  const watcher = watch(mailbox, { persistent: false }, () => poke?.())
  watcher.on("error", () => undefined)
  const withdraw = await ctx.board.announcePresence(ctx.senderName, input.expect)
  const deadline = Date.now() + input.timeoutMs
  try {
    for (;;) {
      const messages = await matching(ctx, input.expect)
      if (messages.length > 0) return { outcome: WaitOutcome.Arrived, messages }
      if (controller.signal.aborted) return { outcome: WaitOutcome.Interrupted, messages: [] }
      const left = deadline - Date.now()
      if (left <= 0) return { outcome: WaitOutcome.TimedOut, messages: [] }
      await Promise.race([
        new Promise<void>((resolve) => { poke = resolve }),
        // An abort just ends the nap early; the loop head reports it.
        sleep(Math.min(POLL_MS, left), undefined, { signal: controller.signal }).catch(() => undefined),
      ])
      poke = undefined
    }
  } finally {
    watcher.close()
    process.off("SIGINT", stop)
    process.off("SIGTERM", stop)
    await withdraw()
  }
}

/** Unread messages that satisfy `expect`, without marking anything read. */
async function matching(ctx: Context, expect: Presence["expect"]): Promise<BoardMessage[]> {
  const { messages } = await ctx.board.read(ctx.senderName, { max: 1_000, peek: true, latest: false })
  if (expect === "any") return messages
  return messages.filter((message) => message.threadId === expect.threadId)
}
