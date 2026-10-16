# ttt rules for agents

Paste this block into the system prompt of an agent that shares a tmux session with teammates.

---

You communicate with teammates through `ttt`. Identity is automatic inside tmux: omit global
`--session` and `--from` on normal commands. `ttt whoami` is diagnostic, not a setup step.
`ttt inbox --from NAME` is a sender filter, not an identity override. Find teammate names with
`ttt windows` and `ttt panes`.

- Create a teammate shell: `ttt create --window REVIEWER` (or explicitly `--shell`).
- Create a shell pane: `ttt create --pane TESTER` in your window, or add `--in REVIEWER`.
- Start a harness: `ttt create --window auto --harness` or `ttt create --pane --harness`.
  Bare `--harness` uses the configured default; `--harness opencode2` picks a declared preset.
- Run a custom command: `ttt create --pane TESTS -- pnpm test --watch`.
- Every creation registers the teammate name immediately, including shells and custom commands.
  No program flag means a plain shell. Launch a harness manually there whenever needed.
  Shell, harness, and custom command choices are exclusive. Existing windows are refused,
  without adopting or restarting their processes. `ttt create --help` explains options.

- Always shell-quote message bodies, ACK notes, and subjects as single arguments. `--` ends CLI
  options; it does not quote shell text. Use `ttt ack --all -- 'FOO BAR; BIZ'`, never bare prose.
  Prefer single quotes: double quotes still expand `$` and backticks. Escape an apostrophe as
  `'"'"'` (example: `ttt ack ID -- 'It'"'"'s done; tests passed'`). For complex message bodies,
  use `--file PATH` or stdin with a quoted heredoc delimiter, such as `<<'MESSAGE'`.
- To message a teammate: `ttt send NAME -- 'your message'`. Multi-line bodies: `ttt send NAME --file PATH`.
- When a line starting with `ttt:` appears in your input, run `ttt read` once, handle every message in the
  batch, then `ttt ack MESSAGE_ID -- 'short note'` for each one you handled. Never skip the ack.
- When you have nothing else to do, wait instead of ending your turn. Idle: run `ttt read --wait`;
  it returns when mail arrives or after the timeout — either way, handle what it prints, then decide
  again. One wait per idle period; empty waits lengthen on their own (120s, 180s, 240s, 300s) and
  any arrival resets — do not re-poll on your own timer, and do not pass `--timeout` to defeat the
  ramp. After 5 consecutive empty waits the wait exits at once telling you to end your turn —
  obey it, do not run another wait; new mail wakes you with a notification. While you wait, no prompts land on your input: the wait is the notification, so a bare
  `ttt read --wait` with no `--timeout` is the cheapest idle.
- Need an answer to continue: `ttt send NAME --wait -- 'question'` (or
  `ttt reply MESSAGE_ID --wait -- 'answer'`). The reply is printed in the same tool result; ack it as
  usual. Anything else that arrived is listed as headers below it: triage, do not ignore.
- Otherwise: send and move on. Add `--no-reply` where no answer is needed. A notification line
  (`ttt: N new ...`) still appears when you were not waiting; the loop for it is unchanged.
- Never `--wait` when the teammate might be waiting on you; ttt refuses the obvious case, the rest
  is on you.
- Triage a busy mailbox before reading bodies: `ttt inbox --detail` or `ttt read --headers-only`.
- Reply with `ttt reply MESSAGE_ID -- 'your answer'`. Do not start a new thread for an answer.
  For group threads: `ttt broadcast A B --subject 'topic' -- 'message'`, then
  `ttt reply MESSAGE_ID --to thread -- 'your answer'`.
- Never poll. Do not run `ttt read` or `ttt inbox` in a loop; an empty `read --wait` already waits
  longer next time, and while you wait nothing is pasted into your window — the batch the wait
  prints is the delivery.
- Status updates use a key so stale ones disappear: `ttt send NAME --replace status -- 'tests green'`.
- `--urgent` interrupts the teammate immediately. Use it only to stop harmful work or unblock a teammate
  who is waiting on you. Everything else is a normal send.
- Add `--no-reply` when you do not need an answer, so the teammate does not spend a turn replying.
- Name the thread when it matters: `ttt send NAME --subject 'topic' -- 'your message'`.
- `ttt capture NAME --lines 40` shows the seat NAME resolves to (a stamp anywhere in the session,
  else the window's first pane — never the focused one). Read it instead of asking "what are you
  doing". TUI chrome is cleaned automatically; pass `--raw` for the untouched pane.
- Use `ttt create` for new teammates and `ttt tmux` for other terminal operations:
  `ttt tmux tree` (who owns which pane), `ttt tmux doctor` (setup and declared harnesses),
  `ttt tmux respawn NAME` (revive a dead agent), `ttt tmux interrupt NAME` (stop its command),
  `ttt tmux wait NAME --for REGEX` (wait for screen output), `ttt tmux type` / `ttt tmux press`
  (drive a program, never send messages), `ttt tmux popup` / `ttt tmux flash` (show the human),
  `ttt tmux rename OLD NEW` (refuses to orphan a mailbox), `ttt tmux close NAME` (remove a window),
  `ttt tmux close --pane NAME` (remove an agent pane).
- `ttt create --window auto --harness` then `ttt send NAME --wait -- 'task'` is two commands.
  The harness creation already waits until it accepts input: no extra screen wait or capture.
  `ttt create --pane --harness` is the same flow beside you. Auto windows use `HARNESS-N` for
  harnesses and `SHELL-N` for shells or custom commands; nameless panes use `WINDOW-N`.
  Skip `--cwd` when the session directory is appropriate, `--ready` when the harness prompt
  works, and `--ready-timeout` when settings `wait.seconds` is enough. Shells reject readiness flags.
- `ttt capture` to look, `ttt tmux wait` to wait for the screen, `ttt send --wait` to wait for an
  answer.
- For a broken runner only, prefix messaging commands with `--session SESSION --from YOUR-NAME`
  until it is fixed. Use the pane's teammate name, which may differ from the window. Matching
  redundant overrides warn once; different identities and detached callers do not warn.
  Outside tmux, `--session S` alone selects where `create` or `tmux` operates.
  Notifications reach your seat even when another pane is focused. An unregistered window's
  first pane receives until something there runs ttt.
- Message bodies are plain text. Put the request first, context second, and keep them short: every line
  you send is read by a model on the other side.
