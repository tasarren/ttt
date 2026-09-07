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
message: normal messages collect for about twenty seconds then arrive as a single summary line, one per
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
# queued ttt-20260902-173355-a1b2c3d4 -> B (notify in ~20s)

# window B receives, about twenty seconds later, one pasted line:
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
| `ttt read [--max N] [--peek] [--latest]` | Print unread messages (oldest first) and mark them read. Every message states its reply obligation explicitly (`reply: ...` or `reply: none needed`). | `--peek` keeps them unread. `--latest` picks the newest N. Partial reads report `N shown, M still unread`. |
| `ttt read --headers-only` | Headers + one-line previews. No bodies, no state change. |
| `ttt inbox [--count]` | Counts by state. `--count` prints only the unread number. |
| `ttt inbox --detail [--max N] [--from NAME]` | Headers + previews for the oldest unread. `--from` filters by sender. |
| `ttt ack MESSAGE_ID [NOTE]` | Mark a message handled. The note needs no `--`. Board state only; nothing is sent. |
| `ttt ack --all [-- NOTE]` | Ack every unacked message in your mailbox at once. |

Ways to check what happened to something you sent, or to look at a teammate's screen:

| Command | What it does |
|---|---|
| `ttt status MESSAGE_ID` | Per-recipient receipt state and short stamps (`q/n/r/a` = queued/notified/read/acked), with `by WINDOW` when someone else read or acked. |
| `ttt thread MESSAGE_ID [--headers-only]` | Every message in the thread, oldest first, with `topic:` and `members:` header. `--headers-only` triages without bodies. |
| `ttt capture TARGET [--lines N] [--raw] [--grep PATTERN] [--around PATTERN] [--context N]` | Last N lines of the teammate's agent pane (their stamped pane, never the focused one). TUI chrome (borders, spinners, padding) is cleaned; `--raw` skips the cleanup and keeps tmux line wrapping. `--grep` keeps matching lines. `--around` keeps matches plus N context lines each side (default 3). |
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
| `--wait` | Block until a reply lands in the thread, then print it in full (and mark it read). See [Waiting for messages](#waiting-for-messages). |
| `--timeout SECONDS` | With `--wait`: give up after SECONDS (1..`wait.maxSeconds`, default `wait.seconds`). Timeout is exit 0. |
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
  The paste lands in the recipient's agent pane -- the pane stamped `@ttt_agent` with the window's
  name by the last command that identified itself through the PID walk -- else the window's first
  pane (pane index 0, the agent's original pane) -- never the active pane, which is whoever touched
  it last.
- **Urgent.** `--urgent` pastes the full message immediately, with the reply instruction. If the paste
  fails, the message falls back to a batched notification, so nothing is lost. Pasting clears the target
  input line (`C-u`) before pasting, so it can clobber in-progress typing. Urgent broadcasts paste
  serially, one recipient at a time. Like batched notifications, the paste targets the
  recipient's stamped agent pane when known, else the window's first pane.
- **Replace and expiry.** `--replace KEY` marks your earlier unread messages with the same KEY as
  superseded, so a busy recipient reads only the latest status. `--ttl SECONDS` lapses unread receipts
  to `superseded` after the deadline instead. Both keep history; both count as terminal for `prune`.
- **Badges.** After every command that changes receipts (send, reply, broadcast, read, ack, and the
  detached notifier), ttt mirrors each mailbox's unread counter into the window option `@ttt_unread`
  of the window with that name (lowest id wins on duplicates; a count of zero unsets the option).
  Attached clients' status bars redraw immediately. Read-only commands (inbox, status, thread,
  capture, windows, whoami, prune, migrate) leave badges alone. The mirror is best-effort: a failure
  prints one line (`ttt: badge sync skipped: ...`) and the command still succeeds, and a stale badge
  self-heals on anyone's next command. The default status line starts rendering the badge with
  `ttt tmux setup`; until then, `tmux display -p -t <window> '#{@ttt_unread}'` shows the value.
- **Reads are cheap.** `ttt read` prints a compact batch: one header line per message, then the body.
  When the mailbox is busy, triage first (`--headers-only`, `inbox --detail`): headers and previews only.

## Settings

Optional file `~/.ttt/settings.jsonc` (or `settings.json`). Comments and trailing commas are allowed.
Unknown keys are rejected so typos surface immediately. `TTT_HOME` moves the whole directory.

```jsonc
{
  // seconds a normal message waits for company before the recipient is notified
  "notifySeconds": 20,
  "notifyOverrides": { "WATCHER": 10 },   // per-window batching windows
  "readMax": 10,
  "boardRoot": "~/.ttt/boards",
  "capture": { "lines": 40, "maxLines": 500 },
  "lock": { "timeoutMs": 10000, "staleMs": 60000 },
  "wait": {
    "seconds": 120,         // default --timeout for --wait
    "maxSeconds": 300       // upper bound for --timeout
  },
  "tmux": {
    "inputSettleMs": 800,   // after clearing the target's input line
    "postPasteMs": 500,     // after the paste and between Enter presses
    "enterPresses": 3,      // slow TUIs swallow the first Enter
    "postSendMs": 300,
    "badges": true          // mirror unread counts into the @ttt_unread window option
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `boardRoot` | string | `~/.ttt/boards` | Boards live at `<boardRoot>/<session>`. `~/` is expanded. |
| `notifySeconds` | integer | `20` | Batching window for normal messages. |
| `notifyOverrides` | object | `{}` | Per-window batching windows (`{ NAME: seconds }`), else `notifySeconds`. |
| `readMax` | integer >= 1 | `10` | Default `--max` for `ttt read`. |
| `capture.lines` | integer >= 1 | `40` | Default `--lines` for `ttt capture`. |
| `capture.maxLines` | integer >= 1 | `500` | Upper bound for `--lines`. |
| `lock.timeoutMs` | integer | `10000` | How long a command waits for a busy mailbox. |
| `lock.staleMs` | integer | `60000` | A lock older than this is treated as abandoned. |
| `wait.seconds` | integer >= 1 | `120` | Default `--timeout` for `--wait`. |
| `wait.maxSeconds` | integer >= 1 | `300` | Upper bound for `--timeout`; keeps an agent from freezing indefinitely. |
| `tmux.inputSettleMs` | integer | `800` | See above. |
| `tmux.postPasteMs` | integer | `500` | See above. |
| `tmux.enterPresses` | integer | `3` | See above. |
| `tmux.postSendMs` | integer | `300` | See above. |
| `tmux.badges` | boolean | `true` | Mirror unread counts into the `@ttt_unread` window option after each command. |

## Tmux setup

`ttt tmux setup` creates a ready-to-work tmux session: named windows, pinned tmux options, and
unread badges, so agents and humans share one normalized environment. Requires tmux 3.2 or newer.
Setup creates the session or errors; it never reworks a session that already exists.

`ttt tmux` is its own composition root: no board, no sender identity. `--session NAME` alone is
allowed before the command; `--from` is rejected; running outside tmux is fine.

| Command | What it does |
|---|---|
| `ttt tmux setup --name SESSION [--profile agents] [--cwd DIR]` | Create a detached session and normalize it with the profile. Prints `ttt: session S set up with profile agents: N options pinned, hook after-new-window installed.`, then `attach with: tmux attach -t S`, plus `note: ...` lines for assert-only options that are off-profile. Errors: session exists (exit 1), bad name (exit 2, same charset rule as window names), unknown profile (exit 2), missing `--name` (exit 2). Any failure after the session was created kills the session again and exits 1. |
| `ttt tmux tree [--json]` | Live session > window > pane view: `S $id [(attached)]`, then `  index:name @id [*]`, then `    index %id command cwd [agent=..., harness=..., dead, active]`. `--json` prints the `TreeSession` object. Needs `--session S` when run outside tmux. |
| `ttt tmux doctor [--json] [--strict]` | Read-only check of a session against its profile. Lines `ok subject: detail`, `warn ...`, `FAIL ...`, each optionally followed by `fix: <command>`. Exit 1 on any FAIL; `--strict` also exits 1 on warn. |

`doctor` checks: tmux version, socket, config files; attached clients; session group; the
`@ttt_setup` marker and session record; every profile option (assert-only ones warn, pinned ones
FAIL with a `tmux set-option ...` fix); the hook; the hook binary path; run-shell failures from
`tmux show-messages`; per window: unstamped panes (informational), dead panes (warn), history
below the profile (warn).

### The `agents` profile

"pin" = set the value and save the original as `@ttt_prev_<key>` on the same target; "assert" =
report only; "lower-only" = pin only when the current value is higher.

| Option | Scope | Value | Mode | Why |
|---|---|---|---|---|
| `allow-rename`, `automatic-rename` | window | off | pin | identity = window name |
| `remain-on-exit` | window | on | pin | a crashed agent keeps its window; respawn revives it |
| `synchronize-panes` | window | off | pin | a paste would hit every pane |
| `monitor-activity` | window | off | pin | pastes are activity; the badge is the signal |
| `pane-border-status`, `pane-border-format` | window | top, `#{?@ttt_agent,#{@ttt_agent},#{window_name}}#{?@ttt_harness, #{@ttt_harness},} #{s\|$HOME\|~\|:pane_current_path}#{?pane_dead, [dead],}` | pin | borders name the agent pane |
| `window-status-format`, `window-status-current-format` | window | `#I:#W#{?@ttt_unread,[#{@ttt_unread}],}#{?window_flags,#{window_flags}, }` (current: bold) | pin | tabs show the unread badge |
| `base-index`, `pane-base-index` | session | 1 | pin | numbers on the bar match `prefix+N` |
| `renumber-windows` | session | on | pin | no gaps after closing |
| `history-limit` | session | 10000 | pin | capture depth |
| `destroy-unattached`, `detach-on-destroy` | session | off | pin | detached sessions survive; killing one does not detach |
| `visual-activity`, `visual-bell`, `bell-action` | session | off, `none` | pin | no flashes |
| `status` | session | on | pin | badges need a bar |
| `aggressive-resize` | session | on | assert | capture width follows the attached client |
| `escape-time` | server | 10 | lower-only | TUIs see Escape promptly |
| `focus-events` | server | on | pin | TUI harnesses expect it |

Worth knowing:

- Nothing is ever written with `-g`; the only server-scope writes are `escape-time` and
  `focus-events`. Your mouse, prefix, shell, and config files are never touched.
- Options your own config already satisfies are not pinned, so "N options pinned" varies by machine.
- Window options are applied per window id, and to windows opened later by a session hook — tmux
  has no session-level window-option layer (`set -w -t SESSION` leaks to every session). The hook
  `after-new-window` runs `ttt tmux _normalize-window #{window_id}` with an absolute binary path,
  because tmux's PATH is whatever the server started with. `_normalize-window` is internal, not for
  humans or agents, and silent on success.
- If the binary moves after setup, new windows silently stay unnormalized; `doctor` reports FAIL,
  and the fix is a new session via setup.

Setup writes a session record `~/.ttt/sessions/<S>/session.json` (`version`, `session`, `profile`,
`hookBin`, `createdAt`) and stamps `@ttt_setup` on the session. The record lives outside the boards
on purpose and is what `doctor` reads. Session options last for the session's lifetime; windows
opened later are normalized by the hook.

<!-- DRAFT (plan 7, step 5): Layouts, save, restore — pending FABLE's step-5 confirmation; do not merge until unmarked. -->

## Layouts

A layout is a hand-editable JSONC file at `~/.ttt/layouts/<L>.jsonc` describing the windows and
panes of a session. Unknown keys are rejected with the file and path named, so typos surface
immediately.

```jsonc
{
  "version": 1,
  "cwd": "~/proj",
  "profile": "agents",
  "windows": [
    {
      "name": "CODER",
      "harness": "claude",
      "layout": "a3b2,160x40,0,0{111x40,0,0[111x29,0,0,0,111x10,0,30,2],48x40,112,0,1}",
      "panes": [                    // pane_index order; length must equal the layout's cells
        { "command": "claude", "agent": true, "cwd": "." },
        { "command": "pnpm test --watch", "cwd": "app" },
        { "command": null }         // plain shell
      ]
    }
  ]
}
```

- `layout` is tmux's own layout string (`#{window_layout}`); panes are bound in index order and the
  pane count must match. Layouts saved at one window size are rescaled on attach.
- `command` is the process each pane starts with. `agent: true` marks the pane a messaging agent
  targets.
- `ttt tmux save` records each window's name, harness, layout string, and panes in index order with
  working directory and command. The command comes from what the pane was started with; when that is
  unknown it falls back to the pane's current process name, marked `"source": "process"`. Shells
  save as `null`.
- `ttt tmux restore` rebuilds the session from the layout. The board is keyed by session name:
  restoring under the same name reconnects to that session's board and unread messages; `--as
  OTHER` starts fresh.

This is a scoped alternative to tmux-resurrect: ttt semantics, hand-editable files, save and
restore only.

<!-- DRAFT (plan 9, step 6): remaining tmux verbs — pending FABLE's step-6 confirmation; tree and doctor are documented under Tmux setup. -->

## Tmux commands

`capture`, `windows`, and `whoami` stay top-level. Everything else tmux-shaped lives behind
`ttt tmux`. `tmux` itself is a reserved window name.

| Command | What it does |
|---|---|
| `ttt tmux open NAME [--cwd DIR] [--harness H] [-- COMMAND]` | New window. |
| `ttt tmux close NAME` | Close a window. |
| `ttt tmux split NAME [--horizontal] [--size PCT] [-- COMMAND]` | Split the window's panes. |
| `ttt tmux respawn NAME [-- COMMAND]` | Restart a dead (or running) pane's process. |
| `ttt tmux type NAME -- TEXT` | Paste text into the pane without pressing Enter. |
| `ttt tmux press NAME KEY` | Press a key (`Enter`, `Escape`, `C-c`, ...). |
| `ttt tmux interrupt NAME` | Send `C-c` to the pane. |
| `ttt tmux wait NAME --for PATTERN [--timeout S]` | Block until the pane's screen matches. Screen state, not messages. |
| `ttt tmux popup [--title T] [--width W] [--height H] [--cwd DIR] -- COMMAND` | Show a popup (needs an attached client). |
| `ttt tmux flash -- TEXT` | Status-line notice, works without a client. |

## Waiting for messages

`--wait` turns a send or a read into a blocking call, so an agent stops instead of polling:

| Command | Effect |
|---|---|
| `ttt send B --wait [--timeout SECONDS] -- question` | Print the usual `queued ...` line, then block until a message lands in this thread. That message prints in full (same format as `ttt read`) and only it is marked read, followed by `1 message shown, N unread messages still unread.` and a headers block for the rest, which stay unread. |
| `ttt reply MESSAGE_ID --wait [--timeout SECONDS] -- answer` | Same, in-thread. |
| `ttt broadcast ... --wait` | Same; wakes on the first reply in the thread. |
| `ttt read --wait [--timeout SECONDS]` | Block until anything is unread, then print the batch exactly like `ttt read` (marks read). The recommended idle state. Cannot combine with `--peek`, `--latest`, or `--headers-only`. |

`--timeout` is an integer between 1 and `wait.maxSeconds` (default `wait.seconds`, 120; cap 300); out
of range exits 2. A timeout is not an error: exit 0 with `ttt: no reply within Ns; M unread.`
(send/reply) or `ttt: nothing arrived within Ns; M unread.` (read). An interrupted wait (SIGINT/
SIGTERM) is also exit 0. `--wait` with `--no-reply` is a usage error, and so is `--timeout` without
`--wait`.

While a recipient is blocked in `--wait`, its message is delivered directly: no batching window, no
paste into the window. The queued line shows it: `queued ttt-2026... -> B (B waiting: delivered
directly)`. With several recipients only the waiting ones are listed; the others get the normal
batch or paste.

One of you must go first: `send --wait`/`reply --wait` to a teammate who is already waiting on a
thread you participate in fails with exit 1, `B is already waiting on a reply from you (thread
ttt-...); answer first`. A plain `read --wait` never blocks anyone.

For harnesses: a `--wait` call stays open for the whole wait. If your harness caps tool-call time
below 300 seconds, pass a smaller `--timeout`.

## Identity

ttt figures out who you are on its own: first your own process ancestry matched against live
tmux panes, then the `TMUX_PANE` environment hint. It never trusts the tmux active window, so a
human switching panes cannot reassign your identity. `ttt whoami` prints the resolved session,
window, id, board path, and which link identified you (`via: pid-walk | pane-env | override`).
The PID walk also stamps `@ttt_agent` with your window name on the pane it found -- that stamp,
not send history, is where delivery and `ttt capture` look first.

`ttt --session NAME --from WINDOW <command>` runs a command as if from that window, from anywhere.
The flags only come as a pair; a lone `--from` is rejected. The detached notifier uses them, and
so should any runner whose tmux environment is broken (wrong `whoami` → prefix every command with
the pair until the runner is fixed).

<!-- DRAFT (plan 9b): Agents install commands — pending FABLE's step-9 confirmation. -->

## Agents

Give your agents the `ttt` skill so teammates learn `ttt` on their own. Three standard ways,
depending on how the package is present:

```sh
npx skills add tasarren/ttt                      # from GitHub; update later with: npx skills update
npx skills add "$(npm root -g)/@tasarren/ttt"    # from a globally installed package, version-locked
npx skills-npm                                   # from a project dependency in node_modules
```

`docs/agent-prompt.md` is the same rules as a block to paste into a system prompt. Developer
documentation is in `docs/development.md`.
