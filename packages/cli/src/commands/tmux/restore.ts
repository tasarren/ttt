import { parseCommandArgs } from "../../args.ts"
import { usageError } from "../../cli-error.ts"
import { listLayouts } from "../../layout.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { createSession } from "./setup.ts"

const RESTORE_OPTIONS = { as: { type: "string" }, cwd: { type: "string" } } as const

/**
 * `ttt tmux restore NAME [--as SESSION] [--cwd DIR]`: `setup --layout NAME --name (SESSION ?? NAME)`.
 * Restoring under the same name reconnects to the same board (boards are keyed by session name).
 */
export const restore: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, RESTORE_OPTIONS)
  const [layout, ...extra] = positionals
  if (layout === undefined || extra.length > 0) throw usageError("usage: ttt tmux restore LAYOUT [--as SESSION] [--cwd DIR]")
  await createSession(ctx, { name: values.as ?? layout, layout, ...(values.cwd !== undefined ? { cwd: values.cwd } : {}) })
}

const LAYOUTS_OPTIONS = { json: { type: "boolean", default: false } } as const

/** `ttt tmux layouts [--json]`: stored layout names. */
export const layouts: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, LAYOUTS_OPTIONS)
  if (positionals.length > 0) throw usageError("usage: ttt tmux layouts [--json]")
  const names = await listLayouts(ctx.settings.home)
  if (values.json) {
    process.stdout.write(`${JSON.stringify(names)}\n`)
    return
  }
  process.stdout.write(names.length === 0 ? "ttt: no layouts saved yet (ttt tmux save NAME).\n" : `${names.join("\n")}\n`)
}
