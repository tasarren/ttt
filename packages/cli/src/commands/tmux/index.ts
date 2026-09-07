import { usageError } from "../../cli-error.ts"
import { createTmuxContext } from "../../tmux-context.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { doctor } from "./doctor.ts"
import { close, open, respawn, split } from "./lifecycle.ts"
import { normalizeWindow } from "./normalize-window.ts"
import { layouts, restore } from "./restore.ts"
import { save } from "./save.ts"
import { flash, popup, wait } from "./screen.ts"
import { setup } from "./setup.ts"
import { tree } from "./tree.ts"
import { interrupt, press, type } from "./typing.ts"

const VERBS: Record<string, TmuxVerb> = {
  setup,
  save,
  restore,
  layouts,
  doctor,
  tree,
  open,
  close,
  split,
  respawn,
  type,
  press,
  interrupt,
  wait,
  popup,
  flash,
  "_normalize-window": normalizeWindow,
}

export const TMUX_USAGE = `  ttt tmux setup [--name SESSION] [--layout NAME] [--profile NAME] [--cwd DIR] [--non-interactive]
  ttt tmux save NAME [--force]                  ttt tmux restore NAME [--as SESSION] [--cwd DIR]
  ttt tmux layouts [--json]                     ttt tmux tree [--json]
  ttt tmux doctor [--json] [--strict]
  ttt tmux open NAME [--cwd DIR] [--harness NAME] [-- COMMAND]
  ttt tmux close NAME                           ttt tmux respawn NAME [-- COMMAND]
  ttt tmux split NAME [--horizontal] [--size PERCENT] [--cwd DIR] [-- COMMAND]
  ttt tmux type NAME -- TEXT                    ttt tmux press NAME KEY
  ttt tmux interrupt NAME                       ttt tmux wait NAME --for PATTERN [--timeout SECONDS]
  ttt tmux popup [--title TEXT] [--width W] [--height H] [--cwd DIR] -- COMMAND
  ttt tmux flash -- TEXT
Outside tmux, put --session NAME before the command. "ttt tmux" verbs never touch the message board.`

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
