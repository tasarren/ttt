import { parseCommandArgs, splitAtTerminator } from "../../args.ts"
import { usageError } from "../../cli-error.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { requireTypable, resolvePaneTarget } from "./target.ts"

/** `ttt tmux type TARGET -- TEXT`: bracketed paste into a pane (`NAME`, `NAME.N`, `%id`), no Enter. Messages go through `ttt send`. */
export const type: TmuxVerb = async(argv, ctx) => {
  const { head, body } = splitAtTerminator(argv)
  const { positionals } = parseCommandArgs(head, {} as const)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0 || body === undefined || body.length === 0) throw usageError("usage: ttt tmux type TARGET -- TEXT (TARGET: NAME, NAME.N or %id)")
  const target = await resolvePaneTarget(ctx, name)
  await requireTypable(ctx, target)
  await ctx.tmux.input.type(target.paneId, body.join(" "))
  process.stdout.write(`typed into ${name} pane ${target.paneId}\n`)
}

/** `ttt tmux press TARGET KEY`: one tmux key name (`Enter`, `Escape`, `C-c`, `M-x`, ...). */
export const press: TmuxVerb = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [name, key, ...extra] = positionals
  if (name === undefined || key === undefined || extra.length > 0) throw usageError("usage: ttt tmux press TARGET KEY")
  const target = await resolvePaneTarget(ctx, name)
  await requireTypable(ctx, target)
  await ctx.tmux.input.press(target.paneId, key)
  process.stdout.write(`pressed ${key} in ${name} pane ${target.paneId}\n`)
}

/** `ttt tmux interrupt TARGET`: Ctrl-C to a pane; named so a model finds it without knowing tmux key syntax. */
export const interrupt: TmuxVerb = async(argv, ctx) => {
  const { positionals } = parseCommandArgs(argv, {} as const)
  const [name, ...extra] = positionals
  if (name === undefined || extra.length > 0) throw usageError("usage: ttt tmux interrupt TARGET")
  const target = await resolvePaneTarget(ctx, name)
  await requireTypable(ctx, target)
  await ctx.tmux.input.interrupt(target.paneId)
  process.stdout.write(`interrupted ${name} pane ${target.paneId}\n`)
}
