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
  const winners = new Map<string, string>()
  for (const window of listed) {
    const current = winners.get(window.name)
    if (!current || compareWindowIds(window.id, current) < 0) winners.set(window.name, window.id)
  }
  const lines = listed.map((window) => {
    const tags = [
      ...(isSelf(ctx, window) ? ["(you)"] : []),
      ...(winners.get(window.name) !== window.id ? [`(dup of ${winners.get(window.name)})`] : []),
    ]
    return `${window.name}\t${window.id}${tags.length > 0 ? `\t${tags.join(" ")}` : ""}`
  })
  process.stdout.write(`${lines.join("\n")}\n`)
}
