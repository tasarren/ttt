import { join } from "node:path"

import { parseCommandArgs } from "../args.ts"
import { usageError } from "../cli-error.ts"
import type { Handler } from "../context.ts"

/** `ttt whoami`: print the resolved session, window, and board so agents never need raw tmux. */
export const whoami: Handler = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  if (positionals.length > 0) throw usageError("usage: ttt whoami")
  const lines = [`session: ${ctx.session}`, `window: ${ctx.senderName}`]
  if (ctx.senderId) lines.push(`id: ${ctx.senderId}`)
  lines.push(`via: ${ctx.via}`)
  lines.push(`board: ${join(ctx.settings.boardRoot, ctx.session)}`)
  process.stdout.write(`${lines.join("\n")}\n`)
}
