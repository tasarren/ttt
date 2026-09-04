import { compareWindowIds } from "@ttt/tmux"

import { parseCommandArgs } from "../args.ts"
import { usageError } from "../cli-error.ts"
import { isSelf } from "../context.ts"
import type { Handler } from "../context.ts"

/** `ttt windows`: list teammate windows in this session so agents can discover names. */
export const windows: Handler = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  if (positionals.length > 0) throw usageError("usage: ttt windows")
  const listed = await ctx.tmux.listWindows(ctx.session)
  listed.sort((a, b) => a.name.localeCompare(b.name) || compareWindowIds(a.id, b.id))
  const lines = listed.map((window) => `${window.name}\t${window.id}${isSelf(ctx, window) ? "\t(you)" : ""}`)
  process.stdout.write(`${lines.join("\n")}\n`)
}
