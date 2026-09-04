---
name: ttt
description: Message teammate agents that share your tmux session. Use when you see a line starting with `ttt:`, when you need to contact, reply to, or check on another agent window, or when instructions mention `ttt send`, `ttt read`, `ttt ack`, or a teammate window name.
---

# ttt — talk to teammates

`ttt` is durable, batched messaging between the windows of one tmux session. Your name is your
tmux window name. Teammates are the other window names; list them with `ttt windows`.

## The loop (follow it exactly)

1. A line starting with `ttt:` appears in your input → run `ttt read` **once**.
2. Handle every message in the batch.
3. `ttt ack MESSAGE_ID -- short note` for each one you handled. Never skip the ack.
4. Reply in-thread when an answer is owed: `ttt reply MESSAGE_ID -- your answer`.
   Never start a new thread for an answer.

## Commands

| Need | Run |
|---|---|
| Message a teammate | `ttt send NAME -- your message` (`--file PATH` for multi-line) |
| Reply | `ttt reply MESSAGE_ID -- your answer` (`--to receiver` to widen the audience) |
| Several recipients | `ttt broadcast A B -- message`, or `--all` for every other window |
| Triage a busy mailbox (stays unread) | `ttt inbox --detail`, `ttt read --headers-only`, `ttt inbox --detail --from NAME` |
| Mark handled | `ttt ack MESSAGE_ID -- note`, or `ttt ack --all -- note` for the whole mailbox |
| Check delivery | `ttt status MESSAGE_ID` (`q/n/r/a` = queued/notified/read/acked) |
| Full thread | `ttt thread MESSAGE_ID` (`--headers-only` to triage) |
| Peek at a teammate's screen | `ttt capture NAME --lines 40` (`--grep PATTERN`, or `--around PATTERN --context N`; TUI chrome is cleaned unless `--raw`) |
| Who/where am I (session, window, board) | `ttt whoami` |

## Rules

- Never poll. Do not run `ttt read` or `ttt inbox` in a loop; you will be notified.
- `--urgent` interrupts the teammate now. Use it only to stop harmful work or unblock a
  teammate waiting on you. Everything else is a normal send.
- Status updates carry a key so stale ones vanish: `ttt send NAME --replace status -- tests green`.
- Add `--no-reply` when no answer is needed, so nobody spends a turn replying.
- Name the thread when it matters: `ttt send NAME --subject TEXT -- your message`.
- Expiring notes: `ttt send NAME --ttl SECONDS -- FYI only`.
- Read `ttt capture` instead of asking "what are you doing".
- Bodies are plain text read by a model: request first, context second, keep them short.
- A window named like a command needs the explicit form: `ttt send NAME -- message`.

## If `ttt` is missing

It installs with `pnpm add -g @tasarren/ttt` (or `pnpx @tasarren/ttt …` one-shot) and needs
Node 24.11+ and tmux. If you cannot install it, tell the user instead of improvising.
