# ttt rules for agents

Paste this block into the system prompt of an agent that shares a tmux session with teammates.

---

You communicate with teammates through `ttt`. You are reachable before you speak: your first `ttt`
run registers your pane, and until then messages to your window land in its first pane. Your name
is what `ttt whoami` prints as `name:` — the window name unless you registered as a second agent
(`WINDOW-N`) in someone's window. Every window has a main agent named like the window; other agents
live in other windows. Find them with `ttt windows`, and panes with `ttt panes`.

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
- `ttt capture NAME --lines 40` shows the seat NAME resolves to (a stamp anywhere in the session,
  else the window's first pane — never the focused one). Read it instead of asking "what are you
  doing". TUI chrome is cleaned automatically; pass `--raw` for the untouched pane.
- For windows and panes, use `ttt tmux` verbs, never raw `tmux`: `ttt tmux tree` (who owns which
  pane), `ttt tmux doctor` (is the session set up right; harness rows list what exists),
  `ttt tmux open --window auto --harness` (one agent on the default harness; returns when it
  accepts input; `--window auto` picks a short free name, at most 12 characters; `--harness claude`
  to pick a specific one), `ttt tmux open --pane --harness` (a second agent next to you, messageable
  at once; `--pane NAME --harness` picks the name) or `ttt tmux open --pane tests -- pnpm test
  --watch` (a titled helper, never messageable), `ttt tmux respawn NAME` (revive a dead agent pane,
  second agents included), `ttt tmux interrupt NAME` (stop
  what a teammate's pane is running — use before `--urgent` messages when a process, not the agent,
  is the problem), `ttt tmux wait NAME --for REGEX` (wait for a teammate's screen to show
  something), `ttt tmux type` / `ttt tmux press` (drive a program in a teammate's pane; never for
  messages — those go through `ttt send`), `ttt tmux popup` / `ttt tmux flash` (show something to
  the human), `ttt tmux rename OLD NEW` (rename; refused when it would orphan a mailbox or NEW is a
  live agent name, otherwise the stamp follows), `ttt tmux close` (remove a window).
- "Use W-2 for the verification run": adopt the existing window —
  `ttt tmux open --window W-2 --harness` (works when W-2 is unregistered with
  exactly one pane), then `ttt tmux open --pane tests --in W-2 -- pnpm test --watch`, then
  `ttt send W-2 --wait -- ...`.
- Cheapest forms: `ttt tmux open --window auto --harness` then `ttt send NAME --wait -- task` —
  two commands, no `wait --for`, no `capture` to check readiness. `ttt tmux open --pane --harness`
  is the cheapest second agent: messageable as soon as it opens. `ttt tmux open --window auto`
  is a scratch shell (`W-N`): drive it with `NAME.1` targets, adopt later with
  `ttt tmux open --window W-1 --harness`. Skip `--cwd` when the teammate should share your
  directory; skip `--ready` (the harness knows its prompt); skip `--ready-timeout` (settings
  `wait.seconds`).
- `ttt capture` to look, `ttt tmux wait` to wait for the screen, `ttt send --wait` to wait for an
  answer.
- Run `ttt whoami` once per session. If the window is wrong, your runner's tmux environment is
  broken: prefix every command with `--session SESSION --from YOUR-WINDOW` until it is fixed.
  Notifications reach your seat even when another pane is focused; an unregistered window's first
  pane receives until something there runs ttt.
- Message bodies are plain text. Put the request first, context second, and keep them short: every line
  you send is read by a model on the other side.
