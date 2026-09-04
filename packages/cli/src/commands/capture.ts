import { boundedInt, parseCommandArgs } from "../args.ts"
import { usageError } from "../cli-error.ts"
import { requireWindow } from "../context.ts"
import type { Handler } from "../context.ts"

const CAPTURE_OPTIONS = {
  lines: { type: "string" },
  raw: { type: "boolean", default: false },
  grep: { type: "string" },
} as const

/** `capture TARGET [--lines N] [--raw] [--grep PATTERN]`: peek at a pane without sending anything. */
export const capture: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, CAPTURE_OPTIONS)
  const [target, ...extra] = positionals
  if (target === undefined || extra.length > 0) throw usageError("usage: ttt capture TARGET [--lines COUNT] [--raw] [--grep PATTERN]")
  const lines = boundedInt(values.lines, "--lines", ctx.settings.capture.lines, ctx.settings.capture.maxLines)
  const window = await requireWindow(ctx, target)
  const text = await ctx.tmux.capture(window.id, lines, !values.raw)
  process.stdout.write(filterLines(text, values.grep))
}

/** Keeps only lines containing `pattern` (substring match); undefined keeps everything. */
export function filterLines(text: string, pattern: string | undefined): string {
  if (pattern === undefined) return text
  if (pattern === "") throw usageError("--grep pattern cannot be empty")
  const kept = text.split("\n").filter((line) => line.includes(pattern))
  return kept.length === 0 ? "" : `${kept.join("\n")}\n`
}
