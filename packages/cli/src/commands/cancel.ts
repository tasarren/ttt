import type { CancelResult } from "@ttt/board"

import { parseCommandArgs } from "../args.ts"
import { CliError, usageError } from "../cli-error.ts"
import type { Handler } from "../context.ts"

const CANCEL_OPTIONS = { replace: { type: "string" } } as const

/** `ttt cancel MESSAGE_ID...` or `ttt cancel --replace KEY`: retract unread messages you sent. */
export const cancel: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, CANCEL_OPTIONS)
  const key = values.replace
  if (key !== undefined && key.trim() === "") throw usageError("--replace key cannot be empty")
  if (key !== undefined && positionals.length > 0) throw usageError("--replace cannot be combined with message ids")

  let ids = positionals
  if (key !== undefined) {
    ids = (await ctx.board.messagesByReplaceKey(ctx.senderName, key)).map((message) => message.messageId)
    if (ids.length === 0) throw new CliError(`no messages with replace key ${key}`)
  }
  if (ids.length === 0) throw usageError("usage: ttt cancel MESSAGE_ID... | ttt cancel --replace KEY")

  const failures: string[] = []
  let cancelledTotal = 0
  for (const id of ids) {
    try {
      const result = await ctx.board.cancel(id, ctx.senderName, ctx.actor)
      if (result.cancelled.length === 0) {
        // The key form retracts what is pending; already-handled messages are not an error.
        if (key === undefined) failures.push(`${id}: nothing to cancel (${describeSkipped(result)})`)
        continue
      }
      cancelledTotal += result.cancelled.length
      process.stdout.write(`${formatCancelled(result)}\n`)
    } catch(error) {
      failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (key !== undefined && cancelledTotal === 0 && failures.length === 0) {
    throw new CliError(`nothing pending for replace key ${key} (already read or acked)`)
  }
  if (failures.length > 0) throw new CliError(failures.join("; "))
}

function describeSkipped(result: CancelResult): string {
  return result.skipped.map(({ recipient, state }) => `${recipient} is ${state}`).join(", ")
}

function formatCancelled(result: CancelResult): string {
  const still = result.skipped.length > 0
    ? ` (still: ${result.skipped.map(({ recipient, state }) => `${recipient} ${state}`).join(", ")})`
    : ""
  return `cancelled ${result.message.messageId} -> ${result.cancelled.join(", ")}${still}`
}
