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
your teammates are the other agents, and `ttt` is how you reach them without talking over each other.

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

## UI library

`packages/ui-lib` is one private `@ttt/ui` workspace package. It exports Vue components, styles,
and contract types/helpers through `@ttt/ui`. Histoire includes component variants and
ten page previews with sample data; it does not connect to a live ttt session.

```sh
pnpm --filter @ttt/ui stories
pnpm run check
```

See [UI library usage](packages/ui-lib/README.md) and [component API](packages/ui-lib/docs/COMPONENT_API.md).

## Local Webapp

Desktop Webapp uses Hono SSR, Vue, Pinia, Vue Router, and the `@ttt/ui` library.
Run from this checkout:

```sh
pnpm web                  # development, http://127.0.0.1:3000
pnpm build
pnpm web:start            # built client and SSR renderer, same address
```

Boards, threads, receipts, waiting agents, sessions, layouts, activity, projects, diagnostics,
and settings use real local data. History loads in pages of 50. Viewing mail never marks it read,
settles expiry, or changes board files. Files remain in their existing locations; SQLite is deferred.
Boards have All, Threads (multiple messages), Standalone, and Acknowledgements tabs, plus search,
priority, and receipt-state filters. Acknowledgements are receipt records with recipient, time, and
note; they are not guessed from message text. Activity is scoped to a session, defaults to the first
live session, and pages 50 recorded events from newest to oldest.

SSE refreshes state after changes. Sessions lists every window and pane; hide/show windows independently,
or open one window for focused interaction. xterm.js streams every pane in each expanded window currently
on screen through tmux control mode. Collapsed, offscreen, and hidden browser windows stop streaming.
Click a pane to type into it. Input refuses dead panes and synchronized windows. Terminal dimensions
follow tmux; browser size changes scale the view without resizing another tmux client's panes.
Metadata refreshes and geometry changes preserve terminal instances and the connected output stream.
Each pane uses xterm's own scrollback scrollbar and has header controls for Details and Close pane.
Auto fits the existing tmux columns to pane width; A−/A+ adjust each pane manually. Tall
output scrolls inside xterm, keeping the pane wrapper fixed and preserving tmux's grid.
Closing the last pane also closes its window; the Webapp asks before closing. Session, window, and pane
badges show recorded unread mailbox counts; IDs appear as small labels beside names.

Sessions supports opening panes/windows, closing and renaming windows, interrupting/respawning
agents, and saving/restoring layouts. Details opens a right sidebar for pane metadata and source.
Settings/layout edits preserve JSONC comments and reject a save if the file changed since loading.
Changes run through the existing CLI validation and tmux controls. The server binds localhost only;
writes require the same origin and a per-process request token.

See [Webapp API spec](packages/webapp/openapi.json), [domain JSON Schema](docs/ttt-system.schema.json),
and [Webapp development](packages/webapp/README.md).

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

Teammates, the second way — start one that is actually ready before you message it:

```sh
ttt tmux open --window REVIEWER --harness claude --cwd ~/proj
# opened REVIEWER @12 pane %31 (ready after 2.1s)
ttt send REVIEWER --wait -- Review src/wait.ts for lost-wakeup bugs and reply with findings.
```

An *agent* is a name with a mailbox whose notifications land in exactly one pane (its seat). Every
window has a main agent named like the window — it exists the moment the window does, whether or
not anything there has run ttt. A *second agent* is another ttt user in the same window, named
`WINDOW-N` or a name given to `ttt tmux open --pane NAME --harness`, stamped on its own pane and
messageable by name. *Registered* means a pane carries the stamp; *unregistered* (tab dot, `(unregistered)`)
means nothing there has run ttt yet — information, never a refusal: a message to the window lands
in its first pane. A *scratch window* is a hook-named `W-N`; the only windows `broadcast --all`
skips.

## Identity

ttt has no accounts. Your name is what `ttt whoami` prints as `name:` — your window's name unless
you registered as a second agent (`WINDOW-N`) in someone's window — and `ttt whoami` prints the
session, name, window, id, and board path so agents never need raw tmux to learn them. Find agents
with `ttt windows`, panes with `ttt panes`.

Window names are expected to be unique. When two windows share a name, the lowest window id (`@1` beats
`@2`) receives the paste. `ttt windows` flags the loser as `(dup of @N)`. Duplicates share one mailbox,
so either twin can `ttt read` the same messages.

A window named like a command (`send`, `read`, `inbox`, `status`, `thread`, `capture`, `broadcast`,
`reply`, `windows`, `whoami`, `prune`, `migrate`, `tmux`) needs the explicit `ttt send` form. The
shorthand `ttt NAME -- MESSAGE` resolves the command first.

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
| `ttt read [--max N] [--peek] [--latest]` | Print unread messages (oldest first) and mark them read. Every message states its reply obligation explicitly (`reply: ...` or `reply: none needed`). | `--peek` keeps them unread. `--latest` picks the newest N. Partial reads report `N shown, M still unread`. An empty read reports `(N cancelled)` when senders have retracted mail. |
| `ttt read --headers-only` | Headers + one-line previews. No bodies, no state change. |
| `ttt inbox [--count]` | Counts by state (unread/read/acked/superseded/cancelled). `--count` prints only the unread number. |
| `ttt inbox --detail [--max N] [--from NAME]` | Headers + previews for the oldest unread. `--from` filters by sender. |
| `ttt ack MESSAGE_ID [NOTE]` | Mark a message handled. The note needs no `--`. Board state only; nothing is sent. |
| `ttt ack --all [-- NOTE]` | Ack every unacked message in your mailbox at once. |

Ways to check what happened to something you sent, or to look at another agent's screen:

| Command | What it does |
|---|---|
| `ttt cancel MESSAGE_ID...` / `ttt cancel --replace KEY` | Retract messages you sent that the recipient has not read. Sender-only; replies included; the same `--replace KEY` you sent with retracts every pending one. A recipient who already read it is reported, not changed. An already-pasted line cannot be un-pasted. |
| `ttt status MESSAGE_ID` | Per-recipient receipt state and short stamps (`q/n/r/a` = queued/notified/read/acked; a cancelled receipt shows `cancelled` and when), with `by WINDOW` when someone else read, acked, or cancelled. |
| `ttt thread MESSAGE_ID [--headers-only]` | Every message in the thread, oldest first, with `topic:` and `members:` header. `--headers-only` triages without bodies. |
| `ttt capture TARGET [--lines N] [--raw] [--grep PATTERN] [--around PATTERN] [--context N]` | Last N lines of the agent's seat (the pane their name resolves to, never the focused one). TUI chrome (borders, spinners, padding) is cleaned; `--raw` skips the cleanup and keeps tmux line wrapping. `--grep` keeps matching lines. `--around` keeps matches plus N context lines each side (default 3). |
| `ttt windows` | List windows in this session with ids; each window is its main agent. `(you)` marks the caller, `(unregistered)` that nothing there has run ttt yet. |
| `ttt panes [--window NAME] [--json]` | One line per pane of one window (default: the caller's): index, pane id, the agent seated there or `-`, and what runs (harness, else helper title, else the foreground command), with `(seat)` on the pane a message to the window lands in, `(unregistered)` when that seat is only the first pane standing in, `(dead)`. `--json` prints `{ window, id, panes: [{ index, pane, agent, seat, registered, runs, dead }] }`. |
| `ttt whoami` | Print your session, name, window, id, link (`via:`), pane, and board path. A second agent also gets `window: W (its main agent is W; you are a second agent there)`; on the run that registered a new pane the pane line reads `pane: %id (registered now as NAME: messages to that name land here)`. |

Ways to clean up and to move the board forward across versions:

| Command | What it does |
|---|---|
| `ttt prune --days N [--dry-run]` | Delete acked/superseded/cancelled messages and receipts older than N days. Unread/read history is never touched. |
| `ttt migrate [--dry-run] [--all]` | Run pending schema migrations for this session (or every session). Newer-than-code boards are refused. |

Message options (for `send`, `reply`, `broadcast`):

| Option | Effect |
|---|---|
| `--no-reply` | Tell the recipient no reply is needed. |
| `--urgent` | Skip the batching window: paste the message into the target window now (unless they are waiting — then the wait delivers it). |
| `--replace KEY` | Supersede your own older *unread* messages to that recipient that carry the same KEY. Use it for status updates. |
| `--subject TEXT` | Thread subject, set once on the root message. `--subject` on a reply is rejected. |
| `--ttl SECONDS` | Self-expiring message: unread receipts lapse to `superseded` after SECONDS (max 30 days). History is kept. Expiry settles on next mailbox access. |
| `--wait` | Block until a reply lands in the thread, then print it in full (and mark it read). See [Waiting for messages](#waiting-for-messages). |
| `--timeout SECONDS` | With `--wait`: give up after SECONDS (1..`wait.maxSeconds`, default `wait.seconds`). Timeout is exit 0. |
| `--file PATH` | Read the body from PATH. |

Exit codes: `0` ok (including `--wait` timeouts and `doctor` warnings), `1` runtime failure (tmux,
board, dead pane, no client, `doctor` FAIL or `--strict` warn), `2` usage, settings, or layout-file
errors.

## How it works

- **Board.** Every message is a JSON file under `~/.ttt/boards/<session>/messages/<day>/`. Each recipient
  gets a receipt under `mailboxes/<window>/` that moves through `unread -> read -> acked`, or `superseded`
  (replaced or expired) or `cancelled` (retracted by the sender before you read it).
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
  The paste lands in the recipient's seat -- the pane their name resolves to (a stamp anywhere in
  the session, else the window's first pane) -- never the active pane,
  which is whoever touched it last. Before clearing the input line the paste waits for 2 s of
  screen quiet (a human typing or the agent streaming both defer it, silently, up to 15 s) --
  no keystrokes are captured, only screen equality.
- **Urgent.** `--urgent` pastes the full message immediately, with the reply instruction. If the paste
  fails, the message falls back to a batched notification, so nothing is lost. Pasting clears the target
  input line (`C-u`) before pasting, so it can clobber in-progress typing. Urgent broadcasts paste
  serially, one recipient at a time. Like batched notifications, the paste targets the
  recipient's seat.
- **Replace, expiry, and cancel.** `--replace KEY` marks your earlier unread messages with the same KEY as
  superseded, so a busy recipient reads only the latest status. `--ttl SECONDS` lapses unread receipts
  to `superseded` after the deadline instead. `ttt cancel` retracts a message you sent from recipients
  who had not read it: their receipt becomes `cancelled` and the message never appears in `ttt read`
  (an empty read says `(N cancelled)`), though it stays in `ttt thread`. All three keep history and
  count as terminal for `prune`.
- **Badges.** After every command that changes receipts (send, reply, broadcast, read, ack, and the
  detached notifier), ttt mirrors each agent's unread counter into the `@ttt_unread` window option;
  a window's badge `[N]` sums the unread of every agent seated in it (lowest window id wins on
  duplicate names; a count of zero unsets the option).
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
Copy the example below to `~/.ttt/settings.jsonc` for every general setting and its default value.
Harness presets inherit `bin` and `ready`; add either key to override it. The example selects
`opencode2` as default; remove `harnesses` for no default.

Vocabulary, stated once: a *harness* is an agent program that runs in a pane (claude, opencode2,
codex, whatever the operator declares). A *shell* is what a pane runs without one. The agent
vocabulary (agent, seat, second agent, registered, scratch window) is stated in
[Quick start](#quick-start) and holds everywhere below.

```jsonc
{
  // seconds a normal message waits for company before the recipient is notified
  "notifySeconds": 20,
  "notifyOverrides": {},                  // per-window batching windows, e.g. { "WATCHER": 10 }
  "readMax": 10,
  "boardRoot": "~/.ttt/boards",
  "capture": { "lines": 40, "maxLines": 500 },
  "lock": { "timeoutMs": 10000, "staleMs": 60000 },
  "wait": {
    "seconds": 120,         // default --timeout for --wait
    "maxSeconds": 300,      // upper bound for --timeout
    "maxIdle": 5            // consecutive empty read --waits before the next one exits idle
  },
  "tmux": {
    "inputSettleMs": 800,   // after clearing the target's input line
    "postPasteMs": 500,     // after the paste and between Enter presses
    "enterPresses": 3,      // slow TUIs swallow the first Enter
    "postSendMs": 300,
    "badges": true          // mirror unread counts into the @ttt_unread window option
  },
  "harnesses": {
    "opencode2": { "default": true }, // shipped v2 preset; bin and ready regex inherited
    "opencode":  {},                  // shipped v1 preset
    "claude":    {},                  // shipped preset
    "codex":    {}                   // shipped preset
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
| `wait.maxIdle` | integer >= 1 | `5` | Consecutive empty `read --wait`s before the next one exits idle instead of waiting. |
| `tmux.inputSettleMs` | integer | `800` | See above. |
| `tmux.postPasteMs` | integer | `500` | See above. |
| `tmux.enterPresses` | integer | `3` | See above. |
| `tmux.postSendMs` | integer | `300` | See above. |
| `tmux.badges` | boolean | `true` | Mirror unread counts into the `@ttt_unread` window option after each command. |
| `harnesses` | object | absent | The harnesses `open` may start. Absent: every shipped preset (`claude`, `opencode`, `opencode2`, `codex`) is allowed and none is the default. Present: only declared names are allowed. Per entry: `bin` (string, default the preset's command; required without a preset), `ready` (string regex, default the preset's regex; required without a preset; invalid -> exit 2, `harnesses.NAME.ready is not a valid regular expression: ...`), `default` (boolean; exactly one true, else exit 2, `harnesses: 0 marked default; set harnesses.NAME.default to true on one of them` or `harnesses: 2 marked default: claude, codex; only one may be`), `limited` (string regex, placeholder: a screen line meaning the harness is out of tokens; no preset ships one yet and nothing matches against it). Unknown key -> `unknown setting "harnesses.claude.foo"`. Empty object -> `harnesses declares nothing; remove the section to allow the shipped presets`. Overriding `ready` drops the preset's note. |

## Tmux setup

`ttt tmux setup` creates a ready-to-work tmux session: named windows, pinned tmux options, and
unread badges, so agents and humans share one normalized environment. Requires tmux 3.2 or newer.
Setup creates the session or errors; it never reworks a session that already exists.

`ttt tmux` is its own composition root: no board, no sender identity. `--session NAME` alone is
allowed before the command; `--from` is rejected; running outside tmux is fine.

| Command | What it does |
|---|---|
| `ttt tmux setup --name SESSION [--profile agents] [--cwd DIR] [--layout NAME]` | Create a detached session and normalize it with the profile. With `--layout`, builds the layout's windows inside the session and prints `layout NAME: N windows created[, skipped X, Y]` before the attach hint. `--cwd` overrides the layout's cwd; `--profile` overrides the layout's profile. Prints `ttt: session S set up with profile agents: N options pinned, hook after-new-window installed.`, then `attach with: tmux attach -t S`, plus `note: ...` lines for assert-only options that are off-profile. Errors: session exists (exit 1), bad name (exit 2, same charset rule as window names), unknown profile (exit 2), missing `--name` (exit 2). Any failure after the session was created kills the session again and exits 1. |
| `ttt tmux save NAME [--force]` | Save the current session as layout `NAME` under `~/.ttt/layouts/`. Prints `saved N windows to <path>`. Refuses to overwrite without `--force` (exit 1). |
| `ttt tmux restore NAME [--as SESSION] [--cwd DIR]` | Shortcut for `ttt tmux setup --name <SESSION or NAME> --layout NAME`. See [Layouts](#layouts) for board semantics. |
| `ttt tmux layouts [--json]` | List saved layouts, one name per line (or a JSON array). Empty: `ttt: no layouts saved yet (ttt tmux save NAME).` |
| `ttt tmux tree [--json]` | Live session > window > pane view: `S $id [(attached)]`, then `  index:name @id [*]`, then `    index %id command cwd [agent=..., harness=..., seat (unregistered), dead, active]` — `seat (unregistered)` on the pane standing in for a window's main agent before anything there has run ttt. `--json` prints the `TreeSession` object. Needs `--session S` when run outside tmux. |
| `ttt tmux doctor [--json] [--strict]` | Read-only check of a session against its profile. Lines `ok subject: detail`, `warn ...`, `FAIL ...`, each optionally followed by `fix: <command>`. Exit 1 on any FAIL; `--strict` also exits 1 on warn. |

`doctor` checks: tmux version, socket, config files; attached clients; session group; the
`@ttt_setup` marker and session record; every profile option (assert-only ones warn, pinned ones
FAIL with a `tmux set-option ...` fix); the hook; the hook binary path; run-shell failures from
`tmux show-messages`; the harnesses section
(`ok harnesses: opencode2, opencode, claude, codex; declared in /home/haze/.ttt/settings.jsonc; default opencode2`
— or `; shipped presets (no harnesses section in settings); default none (a bare --harness is refused)`
— then per harness `ok harness opencode2: /home/haze/.config/scripts/bin/opencode2` or
`warn harness gemini: bin "gemini" not found on PATH`, fix `install it, or set harnesses.gemini.bin in settings`);
per window (`ok window MUSE: unregistered: pane 1 receives until something there runs ttt` — ok, no
fix; `warn window X: pane %id is stamped @ttt_agent=Y, also the name of window @id; messages to Y
land here, not there` — a second agent named like a window; fix: clear the stamp, then register it
as `X-N`; `warn window X: panes %a and %b are both stamped @ttt_agent=Y; the first wins`; dead panes —
the fix names the seated agent, `ttt tmux respawn REVIEWER-2`; history below the profile, warn); and
skill installs, read-only: `ok   skill <harness>: symlink -> <target>, vX`
(or `copy, vX`), `warn skill <harness>: ... vX but ttt is vY` (fix: `npx skills update ttt` for
copies, update the checkout for symlinks), `warn skill <harness>: symlink -> ... (target missing)`,
and `warn skill: no ttt skill installed for any agent` with the install command. Harness
directories checked: `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`,
`~/.config/opencode/skills`, `~/.cursor/skills`, `~/.gemini/skills`, `~/.copilot/skills`.

### The `agents` profile

"pin" = set the value and save the original as `@ttt_prev_<key>` on the same target; "assert" =
report only; "lower-only" = pin only when the current value is higher.

| Option | Scope | Value | Mode | Why |
|---|---|---|---|---|
| `allow-rename`, `automatic-rename` | window | off | pin | identity = window name |
| `remain-on-exit` | window | on | pin | a crashed agent keeps its window; respawn revives it |
| `synchronize-panes` | window | off | pin | a paste would hit every pane |
| `monitor-activity` | window | off | pin | pastes are activity; the badge is the signal |
| `pane-border-status`, `pane-border-format` | window | top, `#{?@ttt_agent,#{@ttt_agent},#{?@ttt_title,#{@ttt_title},pane #{pane_index} · #{pane_current_command}}}#{?@ttt_harness, #{@ttt_harness},} #{s\|$HOME\|~\|:pane_current_path}#{?pane_dead, [dead],}` | pin | borders name the pane's owner, then harness, cwd, dead |
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
`hookBin`, `createdAt`, `layout` when the session was built from one) and stamps `@ttt_setup` on the
session. The record lives outside the boards
on purpose and is what `doctor` reads. Session options last for the session's lifetime; windows
opened later are normalized by the hook.

## Layouts

A layout is a hand-editable JSONC file at `~/.ttt/layouts/<name>.jsonc` describing the windows and
panes of a session. Comments and trailing commas are allowed; unknown keys are rejected; every
error names the file and the path, exit 2.

```jsonc
{
  "version": 1,
  "cwd": "~/proj",                      // optional default; relative pane cwds resolve against it; ~ expands
  "profile": "agents",                  // optional, default agents
  "windows": [
    {
      "name": "CODER",                  // required; same charset as window names; unique
      "layout": "a3b2,160x40,0,0{111x40,0,0[111x29,0,0,0,111x10,0,30,2],48x40,112,0,1}",
      "panes": [                        // built in file order; omitted = one shell agent
        { "command": "claude", "agent": true, "harness": "claude", "cwd": "." },   // the main agent; at most one agent: true
        { "command": "opencode", "agent": "SIDE", "harness": "opencode" },         // a second agent, registered as SIDE
        { "command": "pnpm test --watch", "title": "tests", "cwd": "app" },
        { "command": null }             // plain shell
      ]
    }
  ]
}
```

- `layout` is tmux's own layout string (`#{window_layout}`); required when a window has more than
  one pane, and its cell count must equal `panes.length` — tmux silently accepts a mismatch, ttt
  does not. There is no layout parser: the string round-trips exactly through `select-layout`,
  nested layouts included, and a layout saved at 160x40 restores at any size (tmux rescales on
  attach).
- `command` is the process each pane starts with. `agent` marks the pane a name seats: `true` is the
  window's main agent (at most one per window, the pane a message to the window lands in), a string
  is a second agent registered under that name. A window whose `panes` marks no agent is built
  unregistered (tab `W-1·`); that is what `save` writes for a `W-N` window. The shorthand
  `{ "name": "LEAD" }` (no `panes` key) still means one shell pane that is the main agent and parses
  as `[{ "command": null, "agent": true }]`.
- `title` (optional string) is a helper-pane title: stamped `@ttt_title`, shown in the border.
  Refused on an agent pane: exit 2,
  `<file>: windows[i].panes[j] is an agent pane and cannot carry a title`.
- `agent` errors, all exit 2: not `true`/`false`/a name -> `<file>: windows[i].panes[j].agent must
  be true, false, or an agent name`; two `agent: true` -> `<file>: windows[i] marks 2 panes as the
  main agent; at most one`; a name seated twice, or equal to the window's own name, ->
  `<file>: windows[i] seats agent "X" twice` (appended: `(the window's own name is "agent": true)`).
- `harness` is per pane (the pane that runs it), not per window — a window-level key is exit 2,
  `<file>: windows[i].harness moved to windows[i].panes[j].harness (the pane that runs it)`. It
  stamps `@ttt_harness` on that pane, agent or helper. At `setup --layout` / `restore`, every
  pane's harness must be declared in settings: exit 2,
  `layout NAME: windows[CODER].panes[0].harness "x" is not a declared harness (opencode2, opencode, claude, codex)`.
- `ttt tmux restore` / `setup --layout` builds the windows: panes in file order — each extra pane is
  split from the pane created last, so `pane_index` 1..N follows the file and the saved `layout`
  string binds cells correctly — then the layout applied, then every layout window gets the
  profile's window options and the stamps: `@ttt_agent` on the agent pane, `@ttt_harness` on every
  pane with a harness, `@ttt_command` on every pane with a command, `@ttt_title` on every pane with
  a title. Windows
  already present by name are skipped, never duplicated, so reruns are idempotent. A failed build
  kills the session.
- Restoring under the same session name reconnects to the same board (boards are keyed by session
  name), so unread messages survive; `restore NAME --as OTHER` starts with a fresh board. A missing
  layout exits 2 with `no layout named X (run: ttt tmux layouts)`.
- `ttt tmux save` captures each window's name, geometry (only for
  multi-pane windows), and panes in index order with cwd, command, the helper-pane title
  (`@ttt_title`), the agent (`@ttt_agent`: `true` for the main agent, the name the stamp says for a
  second agent), and the harness (`@ttt_harness`, agent or helper) when stamped. The command is `@ttt_command`
  when ttt started the pane; otherwise the launch line from the pane's process tree (full argv,
  so `codex resume X` restores with its session args), saved with `"source": "tree"` — or the
  foreground process name with `"source": "process"` when the tree shows only the shell — plus
  a warning to check them before restoring. The pane running the save itself is excluded, so a
  bare terminal never saves as `node`. Idle shells (`sh`, `bash`, `zsh`, `fish`, ...) save as
  `null`. `pane_start_command` is never read: it exposes the full argv, secrets included.
  The layout also records its origin session (`session:`, informational). After a restore,
  humans resume each harness session by hand.

tmux-resurrect does generic save/restore; ttt's is a scoped subset with identity, stamps, badges,
and hand-editable jsonc.

## Tmux commands

`capture`, `windows`, and `whoami` stay top-level. Everything else tmux-shaped lives behind
`ttt tmux` (`ttt --help` lists them all). `tmux` itself is a reserved window name. Run outside tmux,
the verbs need `--session S` before the command, and none touch the message board.

An agent's seat is where its messages land: the pane stamped `@ttt_agent=NAME` anywhere in the
session, else — for the window named NAME — its first pane (lowest index). So every window is
reachable by name before anything there has run ttt, and the main agent of a window is the window
name. The first `ttt` run from a pane registers it: a pane already stamped keeps its name; the
window's first pane takes the window name when free; anything else is stamped `WINDOW-N`, lowest N
(>= 2) that is not a live window, a live stamp, or a mailbox on disk (old mailboxes are never
inherited). `ttt whoami` says `pane: %id (registered now as NAME: messages to that name land here)`
on the run that stamped. A second agent may message its window's main agent; sending to your own
name is `refusing to send a message to yourself`.

The bar and borders follow the stamps. Tabs: `3:W-1·` is unregistered (trailing `·`, no stamp in
the window), `2:DOCUMENTER` is registered; the unread badge `[2]` is unchanged. Pane borders show
the harness in every branch: `DOCUMENTER opencode ~/proj` for a stamped pane (main or second
agent), `tests ~/proj` for a titled helper (`open --pane tests -- pnpm test --watch`), `pane 2 ·
bash ~/proj` for any unnamed pane (a human `prefix "` split, `--pane ""`).

Hand-made windows (`prefix c`) get the profile pinned by the `after-new-window` hook and, when tmux
named the window itself (no window-local `automatic-rename`), a `W-N` name — lowest free N against
live windows and mailbox directories. A window named by its creator (`new-window -n`, `prefix ,`)
keeps the name. The hook never stamps; the first ttt run inside registers the seat.

Delivery never refuses for lack of a stamp: `ttt send W-1 -- hi` works while W-1 exists and lands
in its first pane until something there registers. `broadcast --all` reaches one agent per window
— the main agent, who relays to second agents in their panes — and skips scratch windows,
printing `ttt: skipping W-1: scratch window` on stderr.

| Command | What it does |
|---|---|
| `ttt tmux open --window NAME\|auto [--harness [NAME]] [--ready REGEX\|none] [--ready-timeout SECONDS] [--cwd DIR] [-- COMMAND]` | The main agent of a new detached window (or a scratch shell). Exactly one of `--window`/`--pane` is required. NAME: same charset as window names, at most 12 characters (fits the bar); `auto` names it `HARNESS-N` from the resolved harness (`OPENCODE-1`), `W-N` for a shell — lowest N that is neither a live window, a live stamp, nor an existing mailbox directory, printed. Resolution of `--harness`/`--ready`: see below. With a harness or COMMAND, the pane is stamped `@ttt_agent=NAME`, `@ttt_harness` (when a harness), `@ttt_command`; a plain-shell `--window` stays unregistered (tab `W-1·`) until something runs ttt in it. Prints `opened NAME @id pane %id (opencode, ready after 1.5s)` — harness name first, then ready time, nothing in parentheses for a shell. Timeout: exit 1, `NAME did not become ready (/REGEX/) within Ns; the window @id stays open` (plus the preset's note — codex's trust prompt, claude's trust-configuration prompt; the note also ends the timeout message). Readiness polls only the pane's visible screen. Adoption: when NAME already exists and is unregistered with exactly one pane, ttt kills it, restarts it under the harness command (with `--cwd`), stamps it, and waits for readiness — prints `adopted NAME @id pane %id (ready after 1.2s)`. Refusals: NAME a live stamp anywhere -> exit 1, `agent NAME already exists in S: pane %id of WINDOW; pick another name or --window auto`; registered window -> `tmux window already exists: S:NAME (its agent is seated in %id; pick another name or --window auto)`; several panes and no registered agent -> `window NAME has N panes and no registered agent; adopting needs exactly one pane (close the others, or pick another name)`. Errors: exists (exit 1), too long (exit 2, `window name "X" is longer than 12 characters; it must fit the status bar`), `--in`/`--horizontal`/`--size` with `--window` (exit 2, `--in applies to --pane only`). |
| `ttt tmux open --pane [TITLE\|AGENT] [--harness [NAME]] [--ready REGEX\|none] [--ready-timeout SECONDS] [--in WINDOW] [--horizontal] [--size PERCENT] [--cwd DIR] [-- COMMAND]` | A pane next to an agent. `--in` defaults to the caller's own window; outside an agent window it is required (exit 2). `--horizontal` puts it to the right (below by default), `--size` takes 1..99. Three shapes: with a harness and no name (`--pane --harness`) a second agent registered as `WINDOW-N` immediately; with a harness and a name (`--pane NAME --harness`, NAME checked like a window name) a second agent registered as NAME — refused, exit 1, when NAME is already a live stamp (`agent NAME already exists in S: pane %id of WINDOW`) or a window (`agent NAME already exists in S: window NAME`); without a harness a titled helper (`--pane TITLE`, may be empty: `--pane ""`), stamped `@ttt_title` only, which becomes `WINDOW-N` the day something in it runs ttt. A bare `--pane` followed by another flag is fine. Prints `opened pane %id in WINDOW (agent REVIEWER-2, opencode, ready after 1.0s)` with only the parts that apply. Timeout: exit 1, `pane %id in WINDOW did not become ready (/REGEX/) within Ns; the pane stays open`. |
| `ttt tmux close NAME` | Kills the window; refuses to close the window the command itself runs in (exit 1). Prints `closed NAME @id`. The board on disk is untouched. Takes any window, registered or not. |
| `ttt tmux close --pane TARGET` | Kills one pane (`NAME`, `NAME.N`, or `%id`) in the selected session. Refuses the pane the command itself runs in. Closing the last pane closes its window. Message history remains on disk. |
| `ttt tmux rename OLD NEW` | Renames a window: prints `renamed OLD to NEW @id`, plus `(agent pane %id follows)` when the main agent's stamp moves with the name (second agents keep theirs). Refused, exit 1, when a mailbox would be affected: OLD has one (`OLD has a mailbox; renaming would orphan it. Close OLD and open NEW instead`) or NEW has an old one (`NEW has an old mailbox that OLD would inherit; pick another name`), or when NEW is a live stamp: `agent NEW already exists in S: pane %id of WINDOW`. NEW obeys the 12-char rule. |
| `ttt tmux split NAME ...` | Deprecated alias of `ttt tmux open --pane --in NAME`; prints a one-line notice on stderr; removed next release. |
| `ttt tmux respawn NAME [-- COMMAND]` | Restarts NAME's seat's command — any agent's, second agents included: `COMMAND`, else the recorded `@ttt_command`, else the default shell. Re-stamps agent and harness. Prints `respawned NAME pane %id[ with: COMMAND]`. The fix for a `[dead]` pane. |
| `ttt tmux type NAME -- TEXT` | Bracketed paste into NAME's seat, no Enter. Not for messages — those go through `ttt send`. Prints `typed into NAME pane %id`. |
| `ttt tmux press NAME KEY` | One tmux key name (`Enter`, `Escape`, `Tab`, `C-c`, `M-x`, ...). Prints `pressed KEY in NAME pane %id`. |
| `ttt tmux interrupt NAME` | Ctrl-C to NAME's seat. Prints `interrupted NAME pane %id`. |
| `ttt tmux wait NAME --for REGEX [--timeout SECONDS]` | Polls NAME's seat's screen (last 200 lines, every 500 ms) until a line matches the JS regular expression; prints the matching line, exit 0. Timeout: exit 1, `NAME did not show /REGEX/ within Ns`. Bad regex: exit 2. `--timeout` defaults to `wait.seconds`, capped by `wait.maxSeconds` — same settings as message waits. Screen state, not messages. |
| `ttt tmux popup [--title TEXT] [--width W] [--height H] [--cwd DIR] -- COMMAND` | `display-popup -E` on the session's first attached client; blocks until the popup closes. Width/height take columns or percentages (`80%`). Without a client: exit 1. |
| `ttt tmux flash -- TEXT` | One line on the status line. Harmless without a client. |

`type`, `press`, and `interrupt` refuse two things, both exit 1: a dead pane (`pane %id of NAME is
dead; run: ttt tmux respawn NAME` — tmux's `send-keys` into a dead pane silently succeeds, so the
refusal is the point) and a window with `synchronize-panes` on (keys would reach every pane).

Both `open` containers resolve `--harness` the same way. No `--harness`: the session's default
shell; nothing stamped as harness, no wait. `--harness` bare: the default harness; exit 2 without
one: `no default harness; set harnesses.NAME.default to true in ~/.ttt/settings.jsonc (shipped: claude, opencode, opencode2, codex)`.
`--harness NAME`: that declared harness; exit 2 otherwise:
`unknown harness "gemini"; declared in /home/haze/.ttt/settings.jsonc: opencode2, opencode, claude, codex`
(or `; shipped: claude, opencode, opencode2, codex` without a section). `--ready REGEX` and `--ready none`
still override the harness's regex; `--ready` with neither harness nor COMMAND: exit 2,
`--ready needs something to wait for: pass --harness or -- COMMAND`. `--ready-timeout` defaults to
`wait.seconds`, capped by `wait.maxSeconds`.

Driving verbs (`type`, `press`, `interrupt`, `wait`, `open --pane --in`) take a pane target:
NAME (the seat of the agent called NAME — its stamp anywhere in the session, else the first pane
of the window called NAME), NAME.N (`pane_index` N — base-index 1 under the agents profile), or
%id. A target that is neither a live stamp nor a live window is exit 1,
`tmux window does not exist: S:NAME`; a wrong pane index is
`window NAME has no pane 7`. `respawn` stays NAME-only (it re-stamps); `close` takes any window.

`open --window NAME` on an existing, unregistered, single-pane window is the adoption path. "Use
W-2 for the verification run":

```sh
ttt tmux open --window W-2 --harness claude --cwd ~/proj   # adopts W-2: adopted W-2 @9 pane %17 (ready after 1.2s)
ttt tmux open --pane REVIEWER-2 --harness --in W-2         # a second agent in W-2, messageable by name
ttt send REVIEWER-2 --wait -- Run the suite and reply with findings.
```

`ttt tmux setup` without `--name`, on a terminal, is a wizard: `Session name:`, then
`Layout (none, a, b) [none]:` when layouts exist, then `Working directory [cwd]:`. `--layout`/`--cwd`
given on the command line skip their question. `--non-interactive` or a non-TTY stdin: exit 2,
`setup needs --name SESSION (or a terminal, for the wizard)`.

## Waiting for messages

`--wait` turns a send or a read into a blocking call, so an agent stops instead of polling:

| Command | Effect |
|---|---|
| `ttt send B --wait [--timeout SECONDS] -- question` | Print the usual `queued ...` line, then block until a message lands in this thread. That message prints in full (same format as `ttt read`) and only it is marked read, followed by `1 message shown, N unread messages still unread.` and a headers block for the rest, which stay unread. |
| `ttt reply MESSAGE_ID --wait [--timeout SECONDS] -- answer` | Same, in-thread. |
| `ttt broadcast ... --wait` | Same; wakes on the first reply in the thread. |
| `ttt read --wait [--timeout SECONDS]` | Block until anything is unread, then print the batch exactly like `ttt read` (marks read). The recommended idle state: one wait per idle period. Without `--timeout` the wait ramps: consecutive empty waits last `wait.seconds + 60 * streak`, capped at `wait.maxSeconds` (120, 180, 240, 300 with defaults — the third empty wait hits the cap), and any arrival resets the streak. Ramped waits announce it on stderr: `ttt: waiting 180s after 1 empty wait; any arrival resets it`. After `wait.maxIdle` (default 5) consecutive empty waits the next wait exits at once with `ttt: nothing arrived after 5 empty waits. End your turn here. ...` — end the turn, do not loop waits; pending mail still delivers through a re-run. Cannot combine with `--peek`, `--latest`, or `--headers-only`. |

`--timeout` is an integer between 1 and `wait.maxSeconds` (default `wait.seconds`, 120; cap 300); out
of range exits 2. An explicit `--timeout` skips the ramp and keeps the range check; `--timeout`
without `--wait` is a usage error, and so is `--wait` with `--no-reply`. A timeout is not an error:
exit 0 with `ttt: no reply within Ns; M unread.`
(send/reply) or `ttt: nothing arrived within Ns; M unread.` (read — N is the effective length). An
interrupted wait (SIGINT/SIGTERM) is also exit 0, and resets the streak. `send --wait` and
`reply --wait` never touch the streak: they await one thread, not idleness. After `wait.maxIdle`
(default 5) consecutive empty `read --wait`s without `--timeout`, the next one exits at once,
exit 0, with `ttt: nothing arrived after 5 empty waits. End your turn here. ...` — end the turn
instead of waiting again, unless mail is already unread (it then delivers immediately).

While you wait, nothing is pasted — the wait is the notification. Starting a wait cancels that
agent's pending batch marker (a sleeping notifier exits silently), and mail that arrives during the
wait is delivered by the wait itself: it stays unread and unnotified, the marker is dropped, and the
next send re-arms if the waiter leaves without reading. The queued line shows direct delivery:
`queued ttt-2026... -> B (B waiting: delivered directly)`; with several recipients only the waiting
ones are listed, the others get the normal batch or paste. This holds for `--urgent` too: an urgent to
an all-waiting audience lands via the waits instead of pasting (it used to error). A bare `read
--wait` wakes on anything; a thread-scoped `send --wait` wakes on its thread only — other-thread
mail during a thread wait stays silent, and the wait's timeout line reports the unread count (the
old `send --wait` behavior, not a bug). Long waits re-announce presence past half its TTL.

One of you must go first: `send --wait`/`reply --wait` to a teammate who is already waiting on a
thread you participate in fails with exit 1, `B is already waiting on a reply from you (thread
ttt-...); answer first`. A plain `read --wait` never blocks anyone.

For harnesses: a `--wait` call stays open for the whole wait. If your harness caps tool-call time
below 300 seconds, pass a smaller `--timeout`.

## Identity

ttt figures out who you are on its own: first your own process ancestry matched against live
tmux panes, then the `TMUX_PANE` environment hint. It never trusts the tmux active window, so a
human switching panes cannot reassign your identity. `ttt whoami` prints the resolved session,
name, window, id, board path, and which link identified you (`via: pid-walk | pane-env | override`).
The PID walk registers the pane it finds, like any first `ttt` run: stamps `@ttt_agent=NAME` on it
— that stamp, not send history, is where delivery and `ttt capture` look first. A stamp is never
cleared by another pane's claim (only the same name elsewhere, as a dedupe); the window's first
pane stands in for its main agent until registered.

`ttt --session NAME --from WINDOW <command>` runs a command as if from that window, from anywhere.
The flags only come as a pair; a lone `--from` is rejected. The detached notifier uses them, and
so should any runner whose tmux environment is broken (wrong `whoami` → prefix every command with
the pair until the runner is fixed).

## Agents

Give your agents the `ttt` skill so teammates learn `ttt` on their own. The skill ships inside the
package under `skills/` (the npm skills convention), so both installers find it:

```sh
npx skills add tasarren/ttt                               # from GitHub; later: npx skills update
npx skills add "$(npm root -g)/@tasarren/ttt"             # from the installed package; the symlink stays current on every upgrade
npx skills-npm                                            # when ttt is a project dependency; re-syncs on install
```

`docs/agent-prompt.md` is the same rules as a block to paste into a system prompt. Developer
documentation is in `docs/development.md`.
