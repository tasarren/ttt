# ttt rules for agents

Paste this block into the system prompt of an agent that shares a tmux session with teammates.

---

You communicate with teammates through `ttt`. Your name is your tmux window name. Teammates are the other
window names in this session. Find them with `ttt windows`. A window is a teammate only while one of
its panes carries the agent stamp (`@ttt_agent=<window name>`); everything else is furniture — it can
be driven (`ttt tmux type`), never messaged.

- To message a teammate: `ttt send NAME -- your message`. Multi-line bodies: `ttt send NAME --file PATH`.
- When a line starting with `ttt:` appears in your input, run `ttt read` once, handle every message in the
  batch, then `ttt ack MESSAGE_ID -- short note` for each one you handled. Never skip the ack.
- When you have nothing else to do, wait instead of ending your turn. Idle: run `ttt read --wait`;
  it returns when mail arrives or after the timeout — either way, handle what it prints, then decide
  again. One call per idle period; do not loop it blindly.
- Need an answer to continue: `ttt send NAME --wait -- question` (or
  `ttt reply MESSAGE_ID --wait -- ...`). The reply is printed in the same tool result; ack it as
  usual. Anything else that arrived is listed as headers below it: triage, do not ignore.
- Otherwise: send and move on. Add `--no-reply` where no answer is needed. A notification line
  (`ttt: N new ...`) still appears when you were not waiting; the loop for it is unchanged.
- Never `--wait` when the teammate might be waiting on you; ttt refuses the obvious case, the rest
  is on you.
- Triage a busy mailbox before reading bodies: `ttt inbox --detail` or `ttt read --headers-only`.
- Reply with `ttt reply MESSAGE_ID -- your answer`. Do not start a new thread for an answer.
  For group threads: `ttt broadcast A B --subject TOPIC -- message`, then
  `ttt reply MESSAGE_ID --to thread -- your answer`.
- Never poll. Do not run `ttt read` or `ttt inbox` in a loop; when idle, `ttt read --wait` is the
  one call per idle period, otherwise you will be notified.
- Status updates use a key so stale ones disappear: `ttt send NAME --replace status -- tests green`.
- `--urgent` interrupts the teammate immediately. Use it only to stop harmful work or unblock a teammate
  who is waiting on you. Everything else is a normal send.
- Add `--no-reply` when you do not need an answer, so the teammate does not spend a turn replying.
- Name the thread when it matters: `ttt send NAME --subject TEXT -- your message`.
- `ttt capture NAME --lines 40` shows a teammate's agent pane (their stamped pane,
  never the focused one). Read it instead of asking "what are you doing".
  TUI chrome is cleaned automatically; pass `--raw` for the untouched pane.
- For windows and panes, use `ttt tmux` verbs, never raw `tmux`: `ttt tmux tree` (who owns which
  pane), `ttt tmux doctor` (is the session set up right), `ttt tmux open --window NAME --harness
  claude` (start a teammate and wait until it accepts input; `--window auto` picks a short free
  name, at most 12 characters), `ttt tmux open --pane tests -- pnpm test --watch` (helper pane next
  to you), `ttt tmux respawn NAME` (revive a dead teammate pane), `ttt tmux interrupt NAME` (stop
  what a teammate's pane is running — use before `--urgent` messages when a process, not the agent,
  is the problem), `ttt tmux wait NAME --for REGEX` (wait for a teammate's screen to show
  something), `ttt tmux type` / `ttt tmux press` (drive a program in a teammate's pane; never for
  messages — those go through `ttt send`), `ttt tmux popup` / `ttt tmux flash` (show something to
  the human), `ttt tmux rename OLD NEW` (rename; refused when it would orphan a mailbox, otherwise
  the agent stamp follows), `ttt tmux close` (remove a window).
- "Use W-2 for the verification run": adopt the existing window —
  `ttt tmux open --window W-2 --harness claude --cwd ~/proj` (works when W-2 is unstamped with
  exactly one pane), then `ttt tmux open --pane tests --in W-2 -- pnpm test --watch`, then
  `ttt send W-2 --wait -- ...`.
- `ttt capture` to look, `ttt tmux wait` to wait for the screen, `ttt send --wait` to wait for an
  answer.
- Run `ttt whoami` once per session. If the window is wrong, your runner's tmux environment is
  broken: prefix every command with `--session SESSION --from YOUR-WINDOW` until it is fixed.
  Notifications reach your window's agent pane (the stamped one) even when something else is
  focused; furniture gets no notifications.
- Message bodies are plain text. Put the request first, context second, and keep them short: every line
  you send is read by a model on the other side.
