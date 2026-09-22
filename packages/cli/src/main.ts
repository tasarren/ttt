import { syncBadges } from "./badges.ts"
import { usageError } from "./cli-error.ts"
import { cancel } from "./commands/cancel.ts"
import { capture } from "./commands/capture.ts"
import { ack, inbox, read, status, thread } from "./commands/inbox.ts"
import { migrate } from "./commands/migrate.ts"
import { notify } from "./commands/notify.ts"
import { panes } from "./commands/panes.ts"
import { prune } from "./commands/prune.ts"
import { broadcast, reply, send } from "./commands/send.ts"
import { TMUX_USAGE, runTmuxVerb } from "./commands/tmux/index.ts"
import { windows } from "./commands/windows.ts"
import { whoami } from "./commands/whoami.ts"
import { createContext } from "./context.ts"
import type { GlobalOverrides, Handler } from "./context.ts"

/** Commands that only read: no receipt changes, so no badge to refresh. */
const READ_ONLY = new Set(["inbox", "status", "thread", "capture", "windows", "panes", "whoami", "migrate", "prune"])

const COMMANDS: Record<string, Handler> = {
  send,
  reply,
  ack,
  cancel,
  broadcast,
  read,
  inbox,
  status,
  thread,
  capture,
  windows,
  panes,
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
  ttt cancel MESSAGE_ID... | ttt cancel --replace KEY

  ttt read [--max COUNT] [--peek] [--latest] [--headers-only]
  ttt read --wait [--timeout SECONDS]           block until mail arrives, then print it
  ttt inbox [--count]                           ttt inbox --detail [--max COUNT] [--from NAME]
  ttt status MESSAGE_ID
  ttt thread MESSAGE_ID [--headers-only]
  ttt capture TARGET [--lines COUNT] [--raw] [--grep PATTERN] [--around PATTERN] [--context COUNT]
  ttt windows                                   one line per window (its main agent)
  ttt panes [--window NAME] [--json]            the panes of one window: index, %id, agent, what runs
  ttt whoami
  ttt prune --days N [--dry-run]
  ttt migrate [--dry-run] [--all]

${TMUX_USAGE}

message options:
  --no-reply      the recipient does not need to reply
  --urgent        skip the batching window and paste into the target window now
  --replace KEY   supersede your older unread messages that carry the same KEY
  --subject TEXT  thread subject, set once on the root message (not on replies)
  --ttl SECONDS   unread receipts lapse to superseded after SECONDS (1..2592000)
  --file PATH     read the message body from PATH
  --wait          block until the recipient replies (or acks) in this thread, then print the reply
  --timeout SEC   how long --wait blocks (default settings.wait.seconds, max settings.wait.maxSeconds)

Normal messages are queued. A target gets one notification per burst and reads the batch with
"ttt read". A recipient blocked in --wait gets no paste at all: the wait returns the mail itself. ACK is board state only; it sends nothing. Cancel retracts a message you sent from recipients who had not read it; the same --replace KEY you sent with retracts every pending one. Settings: ~/.ttt/settings.jsonc
Shorthand "ttt TARGET -- MESSAGE" sends; a window named like a command (send, read, inbox,
status, thread, capture, cancel, broadcast, reply, windows, whoami, prune, migrate, tmux) needs the explicit "ttt send" form.
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

  // `ttt tmux ...` has its own composition root: no board, no sender, works outside tmux.
  if (first === "tmux") {
    if (overrides.from !== undefined) throw usageError("--from does not apply to ttt tmux commands")
    await runTmuxVerb(rest.slice(1), overrides.session, binPath)
    return
  }

  // Shorthand `ttt TARGET -- MESSAGE` means `send`.
  const [command, args] = first in COMMANDS ? [first, rest.slice(1)] : ["send", rest]
  const ctx = await createContext(overrides, binPath)
  await COMMANDS[command]!(args, ctx)
  if (!READ_ONLY.has(command)) await syncBadges(ctx)
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
  const rest = argv.slice(index)
  if (overrides.from !== undefined && overrides.session === undefined) {
    throw usageError("--from needs --session SESSION; overrides only come as a pair")
  }
  if (overrides.session !== undefined && overrides.from === undefined && rest[0] !== "tmux") {
    throw usageError("--session needs --from NAME")
  }
  return { overrides, rest }
}
