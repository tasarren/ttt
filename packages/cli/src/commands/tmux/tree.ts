import type { TreeSession } from "@ttt/tmux"

import { parseCommandArgs } from "../../args.ts"
import { usageError } from "../../cli-error.ts"
import type { TmuxVerb } from "../../tmux-context.ts"

const TREE_OPTIONS = { json: { type: "boolean", default: false } } as const

/** `ttt tmux tree [--json]`: the live Session > Window > Pane view with the ttt stamps. */
export const tree: TmuxVerb = async(argv, ctx) => {
  const { values, positionals } = parseCommandArgs(argv, TREE_OPTIONS)
  if (positionals.length > 0) throw usageError("usage: ttt tmux tree [--json] (use --session NAME before the command to pick a session)")
  if (ctx.session === undefined) throw usageError("not inside tmux; pass --session NAME before the command")
  const found = await ctx.tmux.inventory.tree(ctx.session)
  process.stdout.write(values.json ? `${JSON.stringify(found, null, 2)}\n` : formatTree(found))
}

export function formatTree(session: TreeSession): string {
  const lines = [`${session.name} ${session.id}${session.attached ? " (attached)" : ""}`]
  for (const window of session.windows) {
    lines.push(`  ${window.index}:${window.name} ${window.id}${window.active ? " *" : ""}`)
    for (const pane of window.panes) {
      const tags = [
        ...(pane.agent !== undefined ? [`agent=${pane.agent}`] : []),
        ...(pane.paneTitle !== undefined ? [`title=${pane.paneTitle}`] : []),
        ...(pane.harness !== undefined ? [`harness=${pane.harness}`] : []),
        ...(pane.dead ? ["dead"] : []),
        ...(pane.active ? ["active"] : []),
      ]
      lines.push(`    ${pane.index} ${pane.pane} ${pane.command} ${pane.cwd}${tags.length > 0 ? ` [${tags.join(", ")}]` : ""}`)
    }
  }
  return `${lines.join("\n")}\n`
}
