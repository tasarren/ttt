import { usageError } from "./cli-error.ts"
import { capture } from "./commands/capture.ts"
import { ack, inbox, read, status, thread } from "./commands/inbox.ts"
import { migrate } from "./commands/migrate.ts"
import { notify } from "./commands/notify.ts"
import { prune } from "./commands/prune.ts"
import { broadcast, reply, send } from "./commands/send.ts"
import { windows } from "./commands/windows.ts"
import { whoami } from "./commands/whoami.ts"
import { createContext } from "./context.ts"
import type { GlobalOverrides, Handler } from "./context.ts"

const COMMANDS: Record<string, Handler> = {
  send,
  reply,
  ack,
  broadcast,
  read,
  inbox,
  status,
  thread,
  capture,
  windows,
  whoami,
  prune,
  migrate,
  _notify: notify,
}

export const USAGE = `ttt — durable, batched messaging between windows of the current tmux session

usage:
  ttt send TARGET [options] -- MESSAGE          ttt TARGET -- MESSAGE (shorthand)
  ttt send TARGET [options] --file PATH         (or pipe the body on stdin)
  ttt reply MESSAGE_ID [--to sender|receiver|both|thread] [options] -- MESSAGE
  ttt broadcast TARGET... [options] -- MESSAGE  ttt broadcast --all [options] -- MESSAGE
  ttt ack MESSAGE_ID [NOTE]                     ttt ack --all [-- NOTE]

  ttt read [--max COUNT] [--peek] [--latest] [--headers-only]
  ttt inbox [--count]                           ttt inbox --detail [--max COUNT] [--from NAME]
  ttt status MESSAGE_ID
  ttt thread MESSAGE_ID [--headers-only]
  ttt capture TARGET [--lines COUNT] [--raw] [--grep PATTERN] [--around PATTERN] [--context COUNT]
  ttt windows
  ttt whoami
  ttt prune --days N [--dry-run]
  ttt migrate [--dry-run] [--all]

message options:
  --no-reply      the recipient does not need to reply
  --urgent        skip the batching window and paste into the target window now
  --replace KEY   supersede your older unread messages that carry the same KEY
  --subject TEXT  thread subject, set once on the root message (not on replies)
  --ttl SECONDS   unread receipts lapse to superseded after SECONDS (1..2592000)
  --file PATH     read the message body from PATH

Normal messages are queued. A target gets one notification per burst and reads the batch with
"ttt read". ACK is board state only; it sends nothing. Settings: ~/.ttt/settings.jsonc
Shorthand "ttt TARGET -- MESSAGE" sends; a window named like a command (send, read, inbox,
status, thread, capture, broadcast, reply, windows, whoami, prune, migrate) needs the explicit "ttt send" form.
Identity is automatic (PID ancestry, then TMUX_PANE) and never uses the active window.
Recovery overrides only come as a pair: --session NAME --from WINDOW; lone --from is rejected.
Capture output is cleaned of TUI chrome (borders, spinners) unless --raw is passed.`


export async function main(argv: string[], binPath: string): Promise<void> {
  const { overrides, rest } = parseGlobals(argv)
  const first = rest[0]
  if (first === undefined || first === "-h" || first === "--help" || first === "help") {
    process.stdout.write(`${USAGE}\n`)
    return
  }

  // Shorthand `ttt TARGET -- MESSAGE` means `send`.
  const [command, args] = first in COMMANDS ? [first, rest.slice(1)] : ["send", rest]
  const ctx = await createContext(overrides, binPath)
  await COMMANDS[command]!(args, ctx)
}

/** `--session S --from NAME` before the command. Recovery/automation only; the notifier relies on them. */
function parseGlobals(argv: string[]): { overrides: GlobalOverrides; rest: string[] } {
  const overrides: GlobalOverrides = {}
  let index = 0
  while (index < argv.length) {
    const flag = argv[index]
    if (flag !== "--session" && flag !== "--from") break
    const value = argv[index + 1]
    if (value === undefined) throw usageError(`${flag} needs a value`)
    overrides[flag === "--session" ? "session" : "from"] = value
    index += 2
  }
  if (overrides.from !== undefined && overrides.session === undefined) {
    throw usageError("--from needs --session SESSION; overrides only come as a pair")
  }
  return { overrides, rest: argv.slice(index) }
}
