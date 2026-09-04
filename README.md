# ttt

Durable, batched messaging between the windows of one tmux session. Built for AI agents that share a
session: a message is written to a board on disk, and the recipient gets **one** short notification per
burst instead of an interruption per message. Urgent messages bypass the batch.

```
ttt send CODER -- Review task AE2-001 and reply when done.
```

## Install

Prerequisites: Node.js 24.11 or newer (development pins 26.8.1), pnpm 11.24.0, tmux.

From a checkout, with no build step (the bin runs the TypeScript source directly):

```sh
pnpm install
cd packages/cli
pnpm add -g .
ttt --help
```

Portable single file, for machines without the checkout:

```sh
pnpm build                 # writes packages/cli/dist/ttt.mjs (self-contained, ~50 kB)
node packages/cli/dist/ttt.mjs --help
```

`pnpm pack` in `packages/cli` produces a tarball whose `bin` points at that file.

## Quick start

In a tmux session with two windows named `A` and `B`:

```sh
# in window A
ttt send B -- hello from A
# queued ttt-20260902-173355-a1b2c3d4 -> B (notify in ~60s)

# window B receives, about a minute later, one pasted line:
# ttt: 1 new from A(1); 1 unread. Run: ttt read

# in window B
ttt read
ttt ack ttt-20260902-173355-a1b2c3d4 -- handled
ttt reply ttt-20260902-173355-a1b2c3d4 -- on it

# in window A
ttt status ttt-20260902-173355-a1b2c3d4
```

Your identity is your tmux window name. Rename windows to name your agents (`tmux rename-window CODER`).
Window names are expected to be unique; when two windows share a name, the lowest window id (`@1` beats
`@2`) receives the paste. Duplicates share one mailbox, so either twin can `ttt read` the same messages.
A window named like a command (`send`, `read`, `inbox`, `status`, `thread`, `capture`, `broadcast`, `reply`,
`windows`, `prune`, `migrate`) needs the explicit `ttt send` form; the shorthand `ttt NAME -- MESSAGE` resolves the command first.
Acking without a prior `ttt read` warns on stderr; the receipt is still marked acked.

## Commands

| Command | What it does |
|---|---|
| `ttt send TARGET [options] -- MESSAGE` | Queue a message for window `TARGET`. `ttt TARGET -- MESSAGE` is a shorthand. |
| `ttt send TARGET [options] --file PATH` | Same, body read from a file. With neither `--` nor `--file`, the body is read from stdin. |
| `ttt reply MESSAGE_ID [--to sender\|receiver\|both] [options] -- MESSAGE` | Reply in the same thread. Default audience is the original sender. |
| `ttt broadcast TARGET... [options] -- MESSAGE` | One message, several recipients. |
| `ttt broadcast --all [options] -- MESSAGE` | Every other window in the session. |
| `ttt ack MESSAGE_ID [-- NOTE]` | Mark a message handled. Board state only; nothing is sent. |
| `ttt ack MESSAGE_ID [NOTE]` | Same, with a bare note (no `--` needed). Acking unread warns on stderr. |
| `ttt ack --all [-- NOTE]` | Ack every unacked message in your mailbox at once. |
| `ttt read [--max N] [--peek] [--latest]` | Print unread messages (oldest first) and mark them read. `--peek` keeps them unread; `--latest` picks the newest N. |
| `ttt read --headers-only` | Triage without bodies or state change: headers + one-line previews, stays unread. |
| `ttt inbox [--count]` | Counts by state. `--count` prints only the unread number. |
| `ttt inbox --detail [--max N]` | Same as headers-only triage for the oldest unread. |
| `ttt inbox --detail --from NAME` | Triage only messages from NAME. |
| `ttt status MESSAGE_ID` | Per-recipient receipt state and timestamps. |
| `ttt thread MESSAGE_ID [--headers-only]` | Every message in the thread, oldest first. `--headers-only` triages without bodies. |
| `ttt capture TARGET [--lines N] [--raw]` | Last N lines of another window's pane. `--raw` keeps tmux's line wrapping. |
| `ttt capture TARGET [--grep PATTERN]` | Same, but only lines containing PATTERN (token-saving filter). |
| `ttt capture TARGET [--around PATTERN] [--context N]` | Matching lines plus N lines of context each side (default 3), gaps marked `--`. |
| `ttt windows` | List windows in this session with ids; `(you)` marks the caller. |
| `ttt prune --days N [--dry-run]` | Delete acked/superseded messages + receipts older than N days. Unread/read history is never touched. |
| `ttt migrate [--dry-run] [--all]` | Run pending schema migrations for this session (or every session). Newer-than-code boards are refused. |

Message options (for `send`, `reply`, `broadcast`):

| Option | Effect |
|---|---|
| `--no-reply` | Tell the recipient no reply is needed. |
| `--urgent` | Skip the batching window: paste the message into the target window now. |
| `--replace KEY` | Supersede your own older *unread* messages to that recipient that carry the same KEY. Use it for status updates. |
| `--subject TEXT` | Thread subject, set once on the root message. Replies inherit the thread; `--subject` on a reply is rejected. |
| `--ttl SECONDS` | Self-expiring message: unread receipts lapse to `superseded` after SECONDS (max 30 days). History is kept. |
| `--file PATH` | Read the body from PATH. |

Exit codes: `0` ok, `1` runtime failure (window missing, board error), `2` bad usage or bad settings.

## How it works

- **Board.** Every message is a JSON file under `~/.ttt/boards/<session>/messages/<day>/`. Each recipient
  gets a receipt under `mailboxes/<window>/` that moves through `unread -> read -> acked`, or `superseded`.
  Writes are atomic and mailboxes are locked per window, so concurrent senders are safe. Per-mailbox unread
  counters and per-thread indexes live under `state/` and `threads/` so counts and thread views skip tree walks.
  `state/schema.json` records applied migrations; run `ttt migrate` after upgrading.
- **Batching.** A normal send schedules one detached notifier for the recipient if none is pending. After
  `notifySeconds` it pastes a single summary line (`ttt: 3 new from A(2), B(1); 3 unread. Run: ttt read`)
  and marks those receipts notified. Further sends during the window join the same batch (the send receipt
  says `joins pending batch`). The waiting notifier refreshes its marker, so a stale marker always means a
  dead notifier, and a failed paste re-arms a live one instead of stranding the burst.
- **Urgent.** `--urgent` pastes the full message immediately, with the reply instruction. If the paste
  fails the message falls back to a batched notification, so nothing is lost. Pasting clears the target's
  input line (`C-u`) before pasting, so it can clobber in-progress typing; urgent broadcasts paste serially,
  about one batching-free paste per recipient.
- **Replace.** `--replace KEY` marks your earlier unread messages with the same KEY as superseded, so a
  recipient that was busy reads only the latest status.
- **Reads are cheap.** `ttt read` prints a compact batch: one header line per message, then the body.

## Settings

Optional file `~/.ttt/settings.jsonc` (or `settings.json`). Comments and trailing commas are allowed.
Unknown keys are rejected so typos surface immediately. `TTT_HOME` moves the whole directory.

```jsonc
{
  // seconds a normal message waits for company before the recipient is notified
  "notifySeconds": 60,
  "notifyOverrides": { "WATCHER": 10 },   // per-window batching windows
  "readMax": 10,
  "boardRoot": "~/.ttt/boards",
  "capture": { "lines": 40, "maxLines": 500 },
  "lock": { "timeoutMs": 10000, "staleMs": 60000 },
  "tmux": {
    "inputSettleMs": 800,   // after clearing the target's input line
    "postPasteMs": 500,     // after the paste and between Enter presses
    "enterPresses": 3,      // slow TUIs swallow the first Enter
    "postSendMs": 300
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `boardRoot` | string | `~/.ttt/boards` | Boards live at `<boardRoot>/<session>`. `~/` is expanded. |
| `notifySeconds` | integer | `60` | Batching window for normal messages. |
| `notifyOverrides` | object | `{}` | Per-window batching windows (`{ NAME: seconds }`), else `notifySeconds`. |
| `readMax` | integer >= 1 | `10` | Default `--max` for `ttt read`. |
| `capture.lines` | integer >= 1 | `40` | Default `--lines` for `ttt capture`. |
| `capture.maxLines` | integer >= 1 | `500` | Upper bound for `--lines`. |
| `lock.timeoutMs` | integer | `10000` | How long a command waits for a busy mailbox. |
| `lock.staleMs` | integer | `60000` | A lock older than this is treated as abandoned. |
| `tmux.inputSettleMs` | integer | `800` | See above. |
| `tmux.postPasteMs` | integer | `500` | See above. |
| `tmux.enterPresses` | integer | `3` | See above. |
| `tmux.postSendMs` | integer | `300` | See above. |

## Recovery overrides

`ttt --session NAME --from WINDOW <command>` runs a command as if from that window, from anywhere. Both
flags are required. The detached notifier uses this; you only need it when tmux context detection is not possible.

## Agents

`docs/agent-prompt.md` is a short set of rules to paste into a teammate's system prompt. Developer
documentation is in `docs/development.md`.
