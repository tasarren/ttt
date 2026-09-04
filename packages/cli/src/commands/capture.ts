import { boundedInt, parseCommandArgs } from "../args.ts"
import { CliError, usageError } from "../cli-error.ts"
import { isSelf, requireWindow } from "../context.ts"
import type { Handler } from "../context.ts"

const CAPTURE_OPTIONS = {
  lines: { type: "string" },
  raw: { type: "boolean", default: false },
} as const

/** `capture TARGET [--lines N] [--raw]`: peek at a teammate's pane without sending anything. */
export const capture: Handler = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, CAPTURE_OPTIONS)
  const [target, ...extra] = positionals
  if (target === undefined || extra.length > 0) throw usageError("usage: ttt capture TARGET [--lines COUNT] [--raw]")
  const lines = boundedInt(values.lines, "--lines", ctx.settings.capture.lines, ctx.settings.capture.maxLines)
  const window = await requireWindow(ctx, target)
  if (isSelf(ctx, window)) throw new CliError("refusing to capture the current window")
  process.stdout.write(await ctx.tmux.capture(window.id, lines, !values.raw))
}
