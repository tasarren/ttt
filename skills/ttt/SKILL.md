---
name: ttt
version: 0.1.3
description: Message teammate agents that share your tmux session. Use when you see a line starting with `ttt:`, when you need to contact, reply to, or check on another agent window, or when instructions mention `ttt send`, `ttt read`, `ttt ack`, or a teammate window name.
---

# ttt — talk to teammates

`ttt` is durable, batched messaging between the windows of one tmux session. Your name is your
tmux window name. Teammates are the other window names; list them with `ttt windows`. Teammates can belong to any harness on any provider, they are not subagents. A window is a teammate only
while one of its panes carries the agent stamp (`@ttt_agent=<window name>`); everything else is
furniture — it can be driven (`ttt tmux type`), never messaged.

## The loop (follow it exactly)

1. A line starting with `ttt:` appears in your input → run `ttt read` **once**.
2. Handle every message in the batch.
3. `ttt ack MESSAGE_ID -- short note` for each one you handled. Never skip the ack.
4. Reply in-thread when an answer is owed: `ttt reply MESSAGE_ID -- your answer`. Triage tags it: `(needs reply)` means open the batch and answer, `(no-reply)` means ack and move on.
   Never start a new thread for an answer.

When you have nothing else to do, wait instead of ending your turn:

- Idle: run `ttt read --wait`. It returns when mail arrives or after the timeout; either way handle what it prints, then decide again. Do not loop it blindly; one call per idle period.
- Need an answer to continue: `ttt send NAME --wait -- question` (or `ttt reply ID --wait -- ...`). The reply is printed in the same tool result; ack it as usual. Anything else that arrived is listed as headers below it: triage, do not ignore.
- Otherwise: send and move on. `--no-reply` where no answer is needed.
- A notification line `ttt: N new ...` still appears when you were not waiting; the loop for it is unchanged.
- Never `--wait` when the teammate might be waiting on you (ttt refuses the obvious case; the rest is on you).

## Commands

| Need | Run |
|---|---|
| Message a teammate | `ttt send NAME -- your message` (`--file PATH` for multi-line; add `--wait` to block until the reply) |
| Idle: wait for mail to come to you | `ttt read --wait` (returns on arrival or at the timeout) |
| Reply | `ttt reply MESSAGE_ID -- your answer` (`--to receiver` to widen, `--to thread` for group threads; add `--wait` to block until the reply lands) |
| Group thread | `ttt broadcast A B --subject TOPIC -- message`, then `ttt reply ID --to thread -- answer` |
| Several recipients | `ttt broadcast A B -- message`, or `--all` for every other window |
| Triage a busy mailbox (stays unread) | `ttt inbox --detail`, `ttt read --headers-only`, `ttt inbox --detail --from NAME` |
| Mark handled | `ttt ack MESSAGE_ID -- note`, or `ttt ack --all -- note` for the whole mailbox |
| Check delivery | `ttt status MESSAGE_ID` (`q/n/r/a` = queued/notified/read/acked; `by WINDOW` when someone else read or acked) |
| Full thread | `ttt thread MESSAGE_ID` (header shows `topic:` + `members:`; `--headers-only` to triage) |
| Peek at a teammate's screen | `ttt capture NAME --lines 40` (their agent pane, never the focused one; `--grep PATTERN`, or `--around PATTERN --context N`; TUI chrome is cleaned unless `--raw`) |
| Who/where am I (session, window, board) | `ttt whoami` (check `via:`; wrong window = broken runner env) |

| Need | Run |
|---|---|
| See the session: who owns which pane | `ttt tmux tree` |
| Is the session set up right | `ttt tmux doctor` |
| Start a teammate and wait until it accepts input | `ttt tmux open --window auto --harness` (bare `--harness` = the default; `--harness claude` to pick) |
| Turn an existing single-pane window into a teammate | `ttt tmux open --window W-2 --harness` (adopts it), then `ttt tmux open --pane tests --in W-2 -- pnpm test --watch`, then `ttt send W-2 --wait -- ...` |
| Helper pane next to you | `ttt tmux open --pane tests -- pnpm test --watch` (or `--pane --harness` for a second, non-messageable agent) |
| Which harnesses exist here | `ttt tmux doctor` (harness rows) |
| Revive a dead teammate pane | `ttt tmux respawn NAME` |
| Stop what a teammate's pane is running | `ttt tmux interrupt NAME` (use before `--urgent` messages when a process, not the agent, is the problem) |
| Wait for a teammate's screen to show something | `ttt tmux wait NAME --for REGEX` |
| Drive a program in a teammate's pane | `ttt tmux type` / `ttt tmux press` (never for messages — those go through `ttt send`) |
| Show something to the human | `ttt tmux popup` / `ttt tmux flash` |
| Remove a window | `ttt tmux close` |
| Rename a window | `ttt tmux rename OLD NEW` (refused when it would orphan a mailbox; otherwise the agent stamp follows) |

## Cheapest forms

- `ttt tmux open --window auto --harness`: one teammate on the default harness, name chosen for
  you, returns when it accepts input. Then `ttt send NAME --wait -- task`. Two commands, no
  `wait --for`, no `capture` to check readiness.
- `ttt tmux open --pane --harness`: a second agent next to you (not messageable; drive it with
  `ttt tmux type NAME.N`).
- `ttt tmux open --window auto`: a scratch shell (`W-N`); use `NAME.1` targets to drive it; adopt
  later with `ttt tmux open --window W-1 --harness`.
- Skip `--cwd` when the teammate should share your directory (it inherits the session's); skip
  `--ready` (the harness knows its prompt); skip `--ready-timeout` (settings `wait.seconds`).
- `--harness NAME` only when you need a specific one; the operator's settings decide what exists
  (`ttt tmux doctor` lists them).

## Rules

- Never poll. Do not run `ttt read` or `ttt inbox` in a loop; when idle, `ttt read --wait` is the one call per idle period, otherwise you will be notified.
- Use `ttt tmux` verbs, never raw `tmux`, so identity and setup stay consistent.
- Keep teammate window names short: at most 12 characters, so they fit the status bar.
- `ttt capture` to look, `ttt tmux wait` to wait for the screen, `ttt send --wait` to wait for an answer.
- `--urgent` interrupts the teammate now. Use it only to stop harmful work or unblock a
  teammate waiting on you. Everything else is a normal send.
- Status updates carry a key so stale ones vanish: `ttt send NAME --replace status -- tests green`.
- Add `--no-reply` when no answer is needed, so nobody spends a turn replying.
- Name the thread when it matters: `ttt send NAME --subject TEXT -- your message`.
- Expiring notes: `ttt send NAME --ttl SECONDS -- FYI only`.
- Read `ttt capture` instead of asking "what are you doing".
- Notifications reach your window's agent pane (the stamped one) even when you are working in a
  helper pane. A window without an agent stamp is furniture: messages to it are refused, and it
  gets no notifications.
- If `ttt whoami` shows the wrong window, prefix every command with `--session SESSION --from YOUR-WINDOW` until the runner is fixed.
- Bodies are plain text read by a model: request first, context second, keep them short.
- A window named like a command needs the explicit form: `ttt send NAME -- message`.

## If `ttt` is missing

It installs with `pnpm add -g @tasarren/ttt` (or `pnpx @tasarren/ttt …` one-shot) and needs
Node 24.11+ and tmux. If you cannot install it, tell the user instead of improvising.
