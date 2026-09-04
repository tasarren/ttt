import { boundedInt, parseCommandArgs } from "../args.ts"
import { usageError } from "../cli-error.ts"
import type { Handler } from "../context.ts"

const PRUNE_OPTIONS = {
  days: { type: "string" },
  "dry-run": { type: "boolean", default: false },
} as const

/** `prune --days N [--dry-run]`: garbage-collects terminal (acked/superseded) history older than N days. */
export const prune: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, PRUNE_OPTIONS)
  if (positionals.length > 0) throw usageError("usage: ttt prune --days N [--dry-run]")
  if (values.days === undefined) throw usageError("prune needs --days N")
  const days = boundedInt(values.days, "--days", 0, 36500)
  const result = await ctx.board.prune({ olderThanMs: days * 86_400_000, dryRun: values["dry-run"] })
  const verb = values["dry-run"] ? "would prune" : "pruned"
  process.stdout.write(`ttt: ${verb} ${result.messages} message${result.messages === 1 ? "" : "s"}, ${result.receipts} receipt${result.receipts === 1 ? "" : "s"} older than ${days} day${days === 1 ? "" : "s"}.\n`)
}
