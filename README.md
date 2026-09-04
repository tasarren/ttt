<p align="center">
  <img src="docs/ttt-logo.svg" width="360" alt="Talk To Teammate logo" />
</p>

<h1 align="center">Talk To Teammate (ttt)</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@tasarren/ttt"><img src="https://img.shields.io/npm/v/@tasarren/ttt.svg" alt="npm version" /></a>
  <a href="https://github.com/tasarren/ttt/actions/workflows/ci.yml"><img src="https://github.com/tasarren/ttt/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/tasarren/ttt.svg" alt="license" /></a>
</p>

Talk To Teammate (`ttt`) is messaging for the agents sharing one tmux session. You are a window,
your teammates are the other windows, and `ttt` is how you reach them without talking over each other.

Sending a message drops it on a shared board on disk. The recipient is not interrupted for every
message: normal messages collect for about a minute then arrive as a single summary line, one per
burst. When something cannot wait, `--urgent` delivers it right now.

```sh
ttt send CODER -- Review task AE2-001 and reply when done.
```

## Install

Prerequisites: Node.js 24.11 or newer, tmux.

From the registry (no checkout needed):

```sh
pnpm add -g @tasarren/ttt   # or: npm install -g @tasarren/ttt
ttt --help
```

One-shot, without installing:

```sh
pnpx @tasarren/ttt --help   # or: npx @tasarren/ttt --help
```

From a checkout, with no build step (the bin runs the TypeScript source directly):

```sh
pnpm install
cd packages/cli
pnpm add -g .
ttt --help
```

Global live link: the command above puts a `ttt` on your PATH that runs the checkout source. Edits
under `packages/*/src` take effect on the next invocation with no build. Verify with `which ttt` and
`ttt windows` from outside the checkout (inside any tmux session). Re-run `pnpm add -g .` only if the
`bin` entry itself changes. Never point the link at `dist/` for development.

Portable single file, for machines without the checkout:

```sh
pnpm build                 # writes packages/cli/dist/ttt.mjs, self-contained
node packages/cli/dist/ttt.mjs --help
```

`pnpm pack` in `packages/cli` produces a tarball whose `bin` points at that file.

## Quick start

Two windows, `A` and `B`, in one tmux session. `A` has something to say, `B` reads it, acks it, and
replies in the same thread:

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

When the mailbox fills up, look before you read. Triage shows headers and one-line previews and
leaves everything unread, so nothing is accidentally marked handled:

```sh
ttt inbox --detail            # headers + one-line previews, stays unread
ttt read --headers-only       # same, explicit triage mode
ttt ack --all -- cleared      # ack everything at once
```

## Identity

ttt has no accounts. Your tmux window name is your name, and `ttt whoami` prints the session,
window, id, and board path so agents never need raw tmux to learn them. Find teammates with
`ttt windows`.

Window names are expected to be unique. When two windows share a name, the lowest window id (`@1` beats
`@2`) receives the paste. `ttt windows` flags the loser as `(dup of @N)`. Duplicates share one mailbox,
so either twin can `ttt read` the same messages.

A window named like a command (`send`, `read`, `inbox`, `status`, `thread`, `capture`, `broadcast`,
`reply`, `windows`, `whoami`, `prune`, `migrate`) needs the explicit `ttt send` form. The shorthand
`ttt NAME -- MESSAGE` resolves the command first.

Acking without a prior `ttt read` warns on stderr. The receipt is still marked acked.

## Commands

Ways to send something:

| Command | What it does |
|---|---|
| `ttt send TARGET [options] -- MESSAGE` | Queue a message for window `TARGET`. `ttt TARGET -- MESSAGE` is a shorthand. |
| `ttt send TARGET [options] --file PATH` | Same, body read from a file. With neither `--` nor `--file`, the body is read from stdin. |
| `ttt reply MESSAGE_ID [--to sender\|receiver\|both\|thread] [options] -- MESSAGE` | Reply in the same thread. Default audience is the original sender; `--to thread` reaches every participant. Open group threads with `broadcast` + `--subject`, continue with `--to thread`. |
| `ttt broadcast TARGET... [options] -- MESSAGE` | One message, several recipients. |
| `ttt broadcast --all [options] -- MESSAGE` | Every other window in the session. |

Ways to catch up. Reading marks messages read; triage does not:

| Command | What it does |
|---|---|
| `ttt read [--max N] [--peek] [--latest]` | Print unread messages (oldest first) and mark them read. `--peek` keeps them unread. `--latest` picks the newest N. Partial reads report `N shown, M still unread`. |
| `ttt read --headers-only` | Headers + one-line previews. No bodies, no state change. |
| `ttt inbox [--count]` | Counts by state. `--count` prints only the unread number. |
| `ttt inbox --detail [--max N] [--from NAME]` | Headers + previews for the oldest unread. `--from` filters by sender. |
| `ttt ack MESSAGE_ID [NOTE]` | Mark a message handled. The note needs no `--`. Board state only; nothing is sent. |
| `ttt ack --all [-- NOTE]` | Ack every unacked message in your mailbox at once. |

Ways to check what happened to something you sent, or to look at a teammate's screen:

| Command | What it does |
|---|---|
| `ttt status MESSAGE_ID` | Per-recipient receipt state and short stamps (`q/n/r/a` = queued/notified/read/acked). |
| `ttt thread MESSAGE_ID [--headers-only]` | Every message in the thread, oldest first, with `topic:` and `members:` header. `--headers-only` triages without bodies. |
| `ttt capture TARGET [--lines N] [--raw] [--grep PATTERN] [--around PATTERN] [--context N]` | Last N lines of another window's pane. TUI chrome (borders, spinners, padding) is cleaned; `--raw` skips the cleanup and keeps tmux line wrapping. `--grep` keeps matching lines. `--around` keeps matches plus N context lines each side (default 3). |
| `ttt windows` | List windows in this session with ids. `(you)` marks the caller. |
| `ttt whoami` | Print your session, window name, id, and board path. |

Ways to clean up and to move the board forward across versions:

| Command | What it does |
|---|---|
| `ttt prune --days N [--dry-run]` | Delete acked/superseded messages and receipts older than N days. Unread/read history is never touched. |
| `ttt migrate [--dry-run] [--all]` | Run pending schema migrations for this session (or every session). Newer-than-code boards are refused. |

Message options (for `send`, `reply`, `broadcast`):

| Option | Effect |
|---|---|
| `--no-reply` | Tell the recipient no reply is needed. |
| `--urgent` | Skip the batching window: paste the message into the target window now. |
| `--replace KEY` | Supersede your own older *unread* messages to that recipient that carry the same KEY. Use it for status updates. |
| `--subject TEXT` | Thread subject, set once on the root message. `--subject` on a reply is rejected. |
| `--ttl SECONDS` | Self-expiring message: unread receipts lapse to `superseded` after SECONDS (max 30 days). History is kept. Expiry settles on next mailbox access. |
| `--file PATH` | Read the body from PATH. |

Exit codes: `0` ok, `1` runtime failure (window missing, board error), `2` bad usage or bad settings.

## How it works

- **Board.** Every message is a JSON file under `~/.ttt/boards/<session>/messages/<day>/`. Each recipient
  gets a receipt under `mailboxes/<window>/` that moves through `unread -> read -> acked`, or `superseded`.
  Writes are atomic and mailboxes are locked per window, so concurrent senders are safe. A busy mailbox
  reports `mailbox NAME is busy; retry shortly`. Per-mailbox unread counters and per-thread indexes live
  under `state/` and `threads/`, so counts and thread views skip tree walks. `state/schema.json` records
  applied migrations. Run `ttt migrate` after upgrading.
- **Batching.** A normal send does not interrupt anyone. It schedules one detached notifier for the
  recipient if none is pending. After
  the window it pastes a single summary line (`ttt: 3 new from A(2), B(1); 3 unread. Run: ttt read`)
  and marks those receipts notified. Further sends during the window join the same batch (the send receipt
  says `joins pending batch`). The waiting notifier refreshes its marker, so a stale marker always means a
  dead notifier. A failed paste re-arms a live notifier instead of stranding the burst.
- **Urgent.** `--urgent` pastes the full message immediately, with the reply instruction. If the paste
  fails, the message falls back to a batched notification, so nothing is lost. Pasting clears the target
  input line (`C-u`) before pasting, so it can clobber in-progress typing. Urgent broadcasts paste
  serially, one recipient at a time.
- **Replace and expiry.** `--replace KEY` marks your earlier unread messages with the same KEY as
  superseded, so a busy recipient reads only the latest status. `--ttl SECONDS` lapses unread receipts
  to `superseded` after the deadline instead. Both keep history; both count as terminal for `prune`.
- **Reads are cheap.** `ttt read` prints a compact batch: one header line per message, then the body.
  When the mailbox is busy, triage first (`--headers-only`, `inbox --detail`): headers and previews only.

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

`ttt --session NAME --from WINDOW <command>` runs a command as if from that window, from anywhere.
`--session` needs `--from`; `--from` on its own just overrides the sender name. The detached notifier
uses these flags. You only need them when tmux context detection cannot tell who you are.

## Agents

`skills/ttt/SKILL.md` is a copyable agent skill: drop the `skills/ttt/` folder into your agent's
skills directory so teammates learn `ttt` on their own. `docs/agent-prompt.md` is the same rules
as a block to paste into a system prompt. Developer documentation is in `docs/development.md`.
