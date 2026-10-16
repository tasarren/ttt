---
name: ttt
version: 0.2.0
description: Message teammate agents that share your tmux session. Use when you see a line starting with `ttt:`, when you need to contact, reply to, check on, or retract a message to another agent window, or when instructions mention `ttt send`, `ttt read`, `ttt ack`, `ttt cancel`, `ttt create`, windows or panes for teammates, or a teammate window name.
---

# ttt — talk to teammates

`ttt` is durable, batched messaging between the windows of one tmux session. You are reachable
before you speak: your first `ttt` run registers your pane, and until then messages to your window
land in its first pane. Your name is what `ttt whoami` prints as `name:` — the window name unless
you are a second agent (`WINDOW-N`) in someone's window. Other agents can belong to any harness on
any provider; they are not subagents. Every window has a main agent named like the window, messageable
the moment the window exists; a second agent in the same window is messageable by its own name.
`ttt panes` shows who sits where in a window, `ttt windows` lists names.

## Start here

Identity is automatic inside tmux. **Omit global `--session` and `--from` on normal commands.**
`ttt whoami` is a diagnostic, never a required setup step. `ttt inbox --from NAME` filters senders;
it does not override identity. Recovery overrides before a command select another mailbox;
matching redundant overrides warn once and still work. Outside tmux, `--session S` alone selects
where `create` or `tmux` operates.

- New shell window: `ttt create --window REVIEWER` or explicitly `--shell`.
- New shell pane: `ttt create --pane TESTER` (your window), or add `--in REVIEWER`.
- Start the configured harness: `ttt create --window auto --harness` or `ttt create --pane --harness`.
- Pick a harness: `ttt create --window REVIEWER --harness opencode2`.
- Run a command: `ttt create --pane TESTS -- pnpm test --watch`.

Every created pane is registered and messageable immediately, including shells and commands.
No program flag means a plain shell; launch a harness manually there whenever you want.
Shell, harness, and custom command choices are exclusive. Existing windows are refused;
creation never adopts or restarts a running window. Use `ttt create --help` for options.

## The loop (follow it exactly)

1. A line starting with `ttt:` appears in your input → run `ttt read` **once**.
2. Handle every message in the batch.
3. `ttt ack MESSAGE_ID -- 'short note'` for each one you handled. Never skip the ack. An ack is board state only: the note stays in your own mailbox and reaches nobody, so never put an answer in it.
4. Reply in-thread when an answer is owed: `ttt reply MESSAGE_ID -- 'your answer'`. Triage tags it: `(needs reply)` means open the batch and answer, `(no-reply)` means ack and move on. Reply first, then ack the original — the ack note is not the reply.
   Never start a new thread for an answer.

When you have nothing else to do, wait instead of ending your turn:

- Idle: run `ttt read --wait`. It returns when mail arrives or after the timeout; either way handle what it prints, then decide again. One wait per idle period; empty waits lengthen on their own (120s, 180s, 240s, 300s) and any arrival resets — do not re-poll on your own timer, and do not pass `--timeout` to defeat the ramp. After 5 consecutive empty waits the wait exits at once telling you to end your turn — obey it, do not run another wait; new mail wakes you with a notification.
- While you wait, no prompts land on your input: the wait is the notification, and the batch it prints is the delivery. A bare `ttt read --wait` with no `--timeout` is the cheapest idle.
- Need an answer to continue: `ttt send NAME --wait -- 'question'` (or `ttt reply ID --wait -- 'answer'`). The reply is printed in the same tool result; ack it as usual. Anything else that arrived is listed as headers below it: triage, do not ignore.
- Otherwise: send and move on. `--no-reply` where no answer is needed.
- A notification line `ttt: N new ...` still appears when you were not waiting; the loop for it is unchanged.
- Never `--wait` when the teammate might be waiting on you (ttt refuses the obvious case; the rest is on you).

## Commands

| Need | Run |
|---|---|
| Message a teammate | `ttt send NAME -- 'your message'` (`--file PATH` for multi-line; add `--wait` to block until the reply) |
| Idle: wait for mail to come to you | `ttt read --wait` (returns on arrival or at the timeout) |
| Reply | `ttt reply MESSAGE_ID -- 'your answer'` (`--to receiver` to widen, `--to thread` for group threads; add `--wait` to block until the reply lands) |
| Group thread | `ttt broadcast A B --subject 'topic' -- 'message'`, then `ttt reply ID --to thread -- 'answer'` |
| Several recipients | `ttt broadcast A B -- 'message'`, or `--all` for one agent per window (scratch `W-N` windows are skipped; relay to your own second agents yourself) |
| Triage a busy mailbox (stays unread) | `ttt inbox --detail`, `ttt read --headers-only`, `ttt inbox --detail --from NAME` |
| Mark handled | `ttt ack MESSAGE_ID -- 'note'`, or `ttt ack --all -- 'note'` for the whole mailbox |
| Retract a stale message you sent | `ttt cancel MESSAGE_ID` (only while unread; `ttt cancel --replace KEY` retracts every pending one). The recipient's next `ttt read` says `(N cancelled)` instead of showing it |
| Check delivery | `ttt status MESSAGE_ID` (`q/n/r/a` = queued/notified/read/acked; `cancelled` when retracted; `by WINDOW` when someone else read, acked, or cancelled) |
| Full thread | `ttt thread MESSAGE_ID` (header shows `topic:` + `members:`; `--headers-only` to triage) |
| Peek at another agent's screen | `ttt capture NAME --lines 40` (their seat, never the focused one; `--grep PATTERN`, or `--around PATTERN --context N`; TUI chrome is cleaned unless `--raw`) |
| Who/where am I (session, name, window, board) | `ttt whoami` (check `via:`; wrong window = broken runner env) |
| Who sits where in a window | `ttt panes` (your window) or `ttt panes --window NAME` |

| Need | Run |
|---|---|
| See the session: who owns which pane | `ttt tmux tree` |
| Is the session set up right | `ttt tmux doctor` |
| Start an agent and wait until it accepts input | `ttt create --window auto --harness` (bare `--harness` = the default; `--harness claude` to pick) |
| Prepare a teammate shell for a manual harness launch | `ttt create --window REVIEWER --shell`; the name is registered immediately |
| Second agent next to you, messageable by name | `ttt create --pane --harness` (name chosen) or `--pane NAME --harness` to pick one; then `ttt send NAME --wait -- 'task'` |
| Command teammate pane next to you | `ttt create --pane tests -- pnpm test --watch` |
| Which harnesses exist here | `ttt tmux doctor` (harness rows) |
| Revive a dead agent pane | `ttt tmux respawn NAME` (any agent, second agents included) |
| Stop what a teammate's pane is running | `ttt tmux interrupt NAME` (use before `--urgent` messages when a process, not the agent, is the problem) |
| Wait for a teammate's screen to show something | `ttt tmux wait NAME --for REGEX` |
| Drive a program in a teammate's pane | `ttt tmux type` / `ttt tmux press` (never for messages — those go through `ttt send`) |
| Show something to the human | `ttt tmux popup` / `ttt tmux flash` |
| Remove a window | `ttt tmux close` |
| Rename a window | `ttt tmux rename OLD NEW` (refused when it would orphan a mailbox; otherwise the agent stamp follows) |

## Cheapest forms

- `ttt create --window auto --harness`: one agent on the default harness, name chosen for
  you, returns when it accepts input. Then `ttt send NAME --wait -- 'task'`. Two commands, no
  `wait --for`, no `capture` to check readiness.
- `ttt create --pane --harness`: the cheapest second agent next to you — name chosen
  (`WINDOW-N`), messageable at once; `--pane NAME --harness` to pick the name. Then
  `ttt send NAME --wait -- 'task'`.
- `ttt create --window auto`: a registered shell (`SHELL-N`), no harness and no wait.
  A nameless shell pane (`ttt create --pane`) is registered as `WINDOW-N` immediately.
- Skip `--cwd` when the agent should share your directory (it inherits the session's); skip
  `--ready` (the harness knows its prompt); skip `--ready-timeout` (settings `wait.seconds`).
- Skip `--session` and `--from` on every command: identity is inherited from tmux. They exist only
  to recover a broken runner, never for normal use.
- `--harness NAME` only when you need a specific one; the operator's settings decide what exists
  (`ttt tmux doctor` lists them).

## Rules

- Always shell-quote message bodies, ACK notes, and subjects as single arguments. `--` ends CLI
  options; it does not quote shell text. Use `ttt ack --all -- 'FOO BAR; BIZ'`, never bare prose.
  Prefer single quotes: double quotes still expand `$` and backticks. Escape an apostrophe as
  `'"'"'` (example: `ttt ack ID -- 'It'"'"'s done; tests passed'`). For complex message bodies,
  use `--file PATH` or stdin with a quoted heredoc delimiter, such as `<<'MESSAGE'`.
- Never poll. Do not run `ttt read` or `ttt inbox` in a loop; an empty `read --wait` already waits
  longer next time, and you will be notified the moment mail arrives — the wait itself is the
  notification, so while you wait nothing is pasted into your window.
- Use `ttt create` for new teammates and `ttt tmux` for other terminal operations.
- Keep teammate window names short: at most 12 characters, so they fit the status bar.
- `ttt capture` to look, `ttt tmux wait` to wait for the screen, `ttt send --wait` to wait for an answer.
- `--urgent` interrupts the teammate now. Use it only to stop harmful work or unblock a
  teammate waiting on you. Everything else is a normal send.
- Status updates carry a key so stale ones vanish: `ttt send NAME --replace status -- 'tests green'`.
- Add `--no-reply` when no answer is needed, so nobody spends a turn replying.
- Name the thread when it matters: `ttt send NAME --subject 'topic' -- 'your message'`.
- Expiring notes: `ttt send NAME --ttl SECONDS -- 'FYI only'`.
- Retract a stale message you sent: `ttt cancel MESSAGE_ID` (only while the recipient has not read it; `ttt cancel --replace KEY` retracts every pending one). A `ttt read` that says `(N cancelled)` means a sender retracted mail before you read it — nothing to do, do not go hunting for it.
- Read `ttt capture` instead of asking "what are you doing".
- Notifications reach your seat (the pane your name resolves to) even when you are working in
  another pane of the window. An unregistered window still receives: its first pane stands in for
  the main agent until something there runs ttt.
- `broadcast --all` reaches one agent per window. If second agents share your window, relay to
  them yourself (`ttt send REVIEWER-2 -- 'message'`); their panes are not broadcast targets.
- For a broken runner only, put `--session SESSION --from YOUR-NAME` before a messaging command.
  Use your pane's teammate name; a second agent's name differs from its window.
- Bodies are plain text read by a model: request first, context second, keep them short.
- A window named like a command needs the explicit form: `ttt send NAME -- 'message'`.

## If `ttt` is missing

It installs with `pnpm add -g @tasarren/ttt` (or `pnpx @tasarren/ttt …` one-shot) and needs
Node 24.11+ and tmux. If you cannot install it, tell the user instead of improvising.
