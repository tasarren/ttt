#!/usr/bin/env bash
# Live check of agent seats inside the current ttt session (step 14): a created shell window is
# registered immediately, and each shell or harness pane has its own teammate name.
# Uses ttt only; windows are prefixed V- and removed at the end. Optional $1: harness name for the
# named second agent (empty = the settings' default).
set -u
H=${1:-}
step() { printf '\n== %s\n' "$*"; }
cleanup() {
  for w in $(ttt windows | awk '$1 ~ /^V-/ {print $1}'); do ttt tmux close "$w" >/dev/null 2>&1; done
}
trap cleanup EXIT

step "registered shell window: listed, seat = pane 1, urgent lands there"
ttt create --window V-SEAT || exit 1
ttt windows | grep V-SEAT
ttt panes --window V-SEAT
ttt send V-SEAT --no-reply --urgent -- "V: probe to a shell window"
sleep 1; ttt capture V-SEAT --lines 4 | grep -c "probe to a shell" | sed 's/^/lines showing the probe: /'

step "a new shell pane is V-SEAT-2 immediately; pane 1 keeps the window's name"
ttt create --pane --in V-SEAT --shell >/dev/null
ttt tmux type V-SEAT.2 -- "ttt whoami"; ttt tmux press V-SEAT.2 Enter; sleep 2
ttt capture V-SEAT-2 --lines 10 | grep -E "^(name|window|pane):"
ttt panes --window V-SEAT
ttt tmux type V-SEAT.1 -- "ttt whoami"; ttt tmux press V-SEAT.1 Enter; sleep 2
ttt capture V-SEAT --lines 10 | grep -E "^(name|pane):"
ttt panes --window V-SEAT

step "named second agent with a harness: --pane V-SIDE --harness $H"
ttt create --pane V-SIDE --in V-SEAT --harness $H || exit 1
ttt panes --window V-SEAT
ttt windows | grep -c V-SIDE | sed 's/^/windows lines naming V-SIDE (expect 0): /'
ttt create --window V-SIDE 2>&1 | sed 's/^/refused: /'

# broadcast --all (main agents only, W-N skipped) is covered by the e2e; running it here would page the live team.

step "doctor: no row for a registered window with distinct seats (expect 0)"
ttt tmux doctor | grep -c "V-SEAT"
true
