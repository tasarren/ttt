import { usageError } from "../../cli-error.ts"
import { createTmuxContext } from "../../tmux-context.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { doctor } from "./doctor.ts"
import { normalizeWindow } from "./normalize-window.ts"
import { layouts, restore } from "./restore.ts"
import { save } from "./save.ts"
import { setup } from "./setup.ts"
import { tree } from "./tree.ts"

const VERBS: Record<string, TmuxVerb> = {
  setup,
  save,
  restore,
  layouts,
  doctor,
  tree,
  "_normalize-window": normalizeWindow,
}

export const TMUX_USAGE = `  ttt tmux setup --name SESSION [--layout NAME] [--profile NAME] [--cwd DIR]
  ttt tmux save NAME [--force]                  ttt tmux restore NAME [--as SESSION] [--cwd DIR]
  ttt tmux layouts [--json]
  ttt tmux tree [--json]                        ttt tmux doctor [--json] [--strict]`

/**
 * `ttt tmux VERB ...`: a separate composition root. These verbs never touch a mailbox, so
 * `--session` alone is accepted and running outside tmux is fine (setup creates the session).
 */
export async function runTmuxVerb(argv: string[], sessionOverride: string | undefined, binPath: string): Promise<void> {
  const [verb, ...rest] = argv
  const handler = verb === undefined ? undefined : VERBS[verb]
  if (!handler) throw usageError(`ttt tmux needs one of: ${Object.keys(VERBS).filter((name) => !name.startsWith("_")).join(", ")}`)
  const ctx = await createTmuxContext(sessionOverride, binPath)
  await handler(rest, ctx)
}
