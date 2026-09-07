import { parseCommandArgs, splitAtTerminator } from "../../args.ts"
import { usageError } from "../../cli-error.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { requireTypable, resolveAgentTarget } from "./target.ts"

/** `ttt tmux type NAME -- TEXT`: bracketed paste into the agent pane, no Enter. Messages go through `ttt send`. */
export const type: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { positionals } = parseCommandArgs(head, {} as const)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0 || body === undefined || body.length === 0) throw usageError("usage: ttt tmux type NAME -- TEXT")
  const target = await resolveAgentTarget(ctx, name)
  await requireTypable(ctx, target)
  await ctx.tmux.input.type(target.paneId, body.join(" "))
  process.stdout.write(`typed into ${name} pane ${target.paneId}\n`)
}

/** `ttt tmux press NAME KEY`: one tmux key name (`Enter`, `Escape`, `C-c`, `M-x`, ...). */
export const press: TmuxVerb = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [name, key, ...extra] = positionals
  if (name === undefined || key === undefined || extra.length > 0) throw usageError("usage: ttt tmux press NAME KEY")
  const target = await resolveAgentTarget(ctx, name)
  await requireTypable(ctx, target)
  await ctx.tmux.input.press(target.paneId, key)
  process.stdout.write(`pressed ${key} in ${name} pane ${target.paneId}\n`)
}

/** `ttt tmux interrupt NAME`: Ctrl-C to the agent pane; named so a model finds it without knowing tmux key syntax. */
export const interrupt: TmuxVerb = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux interrupt NAME")
  const target = await resolveAgentTarget(ctx, name)
  await requireTypable(ctx, target)
  await ctx.tmux.input.interrupt(target.paneId)
  process.stdout.write(`interrupted ${name} pane ${target.paneId}\n`)
}
