import { usageError } from "../../cli-error.ts"
import { createTmuxContext } from "../../tmux-context.ts"
import type { TmuxVerb } from "../../tmux-context.ts"
import { doctor } from "./doctor.ts"
import { close, rename, respawn } from "./lifecycle.ts"
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
  close,
  rename,
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
  ttt tmux close NAME                           ttt tmux respawn NAME [-- COMMAND]
  ttt tmux close --pane TARGET
  ttt tmux rename OLD NEW                       (refused once OLD has a mailbox: the name is the mailbox key)
  ttt tmux type TARGET -- TEXT                  ttt tmux press TARGET KEY
  ttt tmux interrupt TARGET                     ttt tmux wait TARGET --for PATTERN [--timeout SECONDS]
TARGET is NAME (the agent's pane), NAME.N (pane index N) or %id.
An unregistered window receives through its first pane. Create new teammates with "ttt create".
  ttt tmux popup [--title TEXT] [--width W] [--height H] [--cwd DIR] -- COMMAND
  ttt tmux flash -- TEXT
Outside tmux, put --session NAME before the command. "ttt tmux" verbs never touch the message board.`

/**
 * `ttt tmux VERB ...`: a separate composition root. These verbs never touch a mailbox, so
 * `--session` alone is accepted and running outside tmux is fine (setup creates the session).
 */
export async function runTmuxVerb(argv: string[], sessionOverride: string | undefined, binPath: string): Promise<void> {
  const [verb, ...rest] = argv
  if (verb === "--help" || verb === "-h" || verb === "help") {
    process.stdout.write(`${TMUX_USAGE}\n`)
    return
  }
  if (verb === "open" || verb === "split") throw usageError("use ttt create --help to create windows and panes")
  const handler = verb === undefined ? undefined : VERBS[verb]
  if (!handler) throw usageError(`ttt tmux needs one of: ${Object.keys(VERBS).filter((name) => !name.startsWith("_")).join(", ")}`)
  const ctx = await createTmuxContext(sessionOverride, binPath)
  await handler(rest, ctx)
}
