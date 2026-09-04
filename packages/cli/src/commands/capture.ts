import { boundedInt, parseCommandArgs } from "../args.ts"
import { usageError } from "../cli-error.ts"
import { requireWindow } from "../context.ts"
import type { Handler } from "../context.ts"

const CAPTURE_OPTIONS = {
  lines: { type: "string" },
  raw: { type: "boolean", default: false },
  grep: { type: "string" },
  around: { type: "string" },
  context: { type: "string" },
} as const

/** `capture TARGET [--lines N] [--raw] [--grep PATTERN] [--around PATTERN] [--context N]`. */
export const capture: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, CAPTURE_OPTIONS)
  const [target, ...extra] = positionals
  if (target === undefined || extra.length > 0) {
    throw usageError("usage: ttt capture TARGET [--lines COUNT] [--raw] [--grep PATTERN] [--around PATTERN] [--context COUNT]")
  }
  if (values.grep !== undefined && values.around !== undefined) {
    throw usageError("--grep and --around cannot be combined")
  }
  const lines = boundedInt(values.lines, "--lines", ctx.settings.capture.lines, ctx.settings.capture.maxLines)
  const window = await requireWindow(ctx, target)
  const text = await ctx.tmux.capture(window.id, lines, !values.raw)
  if (values.around !== undefined) {
    const context = boundedInt(values.context, "--context", 3, ctx.settings.capture.maxLines)
    process.stdout.write(filterAround(text, values.around, context))
    return
  }
  process.stdout.write(filterLines(text, values.grep))
}

/** Keeps only lines containing `pattern` (substring match); undefined keeps everything. */
export function filterLines(text: string, pattern: string | undefined): string {
  if (pattern === undefined) return text
  if (pattern === "") throw usageError("--grep pattern cannot be empty")
  const kept = text.split("\n").filter((line) => line.includes(pattern))
  return kept.length === 0 ? "" : `${kept.join("\n")}\n`
}

/**
 * Keeps matching lines plus `context` lines on each side, merging overlapping windows and marking
 * gaps with `--`. Empty pattern is a usage error.
 */
export function filterAround(text: string, pattern: string, context: number): string {
  if (pattern === "") throw usageError("--around pattern cannot be empty")
  const rows = text.split("\n")
  if (rows.length > 0 && rows[rows.length - 1] === "") rows.pop()
  const hits = new Set<number>()
  rows.forEach((line, index) => {
    if (!line.includes(pattern)) return
    for (let at = Math.max(0, index - context); at <= Math.min(rows.length - 1, index + context); at += 1) {
      hits.add(at)
    }
  })
  if (hits.size === 0) return ""
  const ordered = [...hits].sort((a, b) => a - b)
  const out: string[] = []
  let previous = -2
  for (const at of ordered) {
    if (at > previous + 1 && out.length > 0) out.push("--")
    out.push(rows[at]!)
    previous = at
  }
  return `${out.join("\n")}\n`
}
