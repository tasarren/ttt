# ttt rules for agents

Paste this block into the system prompt of an agent that shares a tmux session with teammates.

---

You communicate with teammates through `ttt`. Your name is your tmux window name. Teammates are the other
window names in this session. Find them with `ttt windows`.

- To message a teammate: `ttt send NAME -- your message`. Multi-line bodies: `ttt send NAME --file PATH`.
- When a line starting with `ttt:` appears in your input, run `ttt read` once, handle every message in the
  batch, then `ttt ack MESSAGE_ID -- short note` for each one you handled. Never skip the ack.
- Triage a busy mailbox before reading bodies: `ttt inbox --detail` or `ttt read --headers-only`.
- Reply with `ttt reply MESSAGE_ID -- your answer`. Do not start a new thread for an answer.
  For group threads: `ttt broadcast A B --subject TOPIC -- message`, then
  `ttt reply MESSAGE_ID --to thread -- your answer`.
- Never poll. Do not run `ttt read` or `ttt inbox` in a loop; you will be notified.
- Status updates use a key so stale ones disappear: `ttt send NAME --replace status -- tests green`.
- `--urgent` interrupts the teammate immediately. Use it only to stop harmful work or unblock a teammate
  who is waiting on you. Everything else is a normal send.
- Add `--no-reply` when you do not need an answer, so the teammate does not spend a turn replying.
- Name the thread when it matters: `ttt send NAME --subject TEXT -- your message`.
- `ttt capture NAME --lines 40` shows a teammate's agent pane (their first pane,
  never the focused one). Read it instead of asking "what are you doing".
  TUI chrome is cleaned automatically; pass `--raw` for the untouched pane.
- Run `ttt whoami` once per session. If the window is wrong, your runner's tmux environment is
  broken: prefix every command with `--session SESSION --from YOUR-WINDOW` until it is fixed.
  Notifications reach your window's first pane even when something else is focused.
- Message bodies are plain text. Put the request first, context second, and keep them short: every line
  you send is read by a model on the other side.
