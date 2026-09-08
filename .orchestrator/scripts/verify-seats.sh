#!/usr/bin/env bash
# Live check of agent seats inside the current ttt session (step 14): an unregistered window is
# reachable, a second pane becomes WINDOW-N, a named second agent is opened with --pane NAME --harness.
# Uses ttt only; windows are prefixed V- and removed at the end. Optional $1: harness name for the
# named second agent (empty = the settings' default).
set -u
H=${1:-}
step() { printf '\n== %s\n' "$*"; }
cleanup() {
  for w in $(ttt windows | awk '$1 ~ /^V-/ {print $1}'); do ttt tmux close "$w" >/dev/null 2>&1; done
  rm -rf ~/.ttt/boards/"$(ttt whoami | awk '/^session:/ {print $2}')"/mailboxes/V-*
}
trap cleanup EXIT

step "unregistered shell window: listed, seat = pane 1, urgent lands there"
ttt tmux open --window V-SEAT || exit 1
ttt windows | grep V-SEAT
ttt panes --window V-SEAT
ttt send V-SEAT --no-reply --urgent -- "V: probe to an unregistered window"
sleep 1; ttt capture V-SEAT --lines 4 | grep -c "probe to an unregistered" | sed 's/^/lines showing the probe: /'

step "a later pane running ttt becomes V-SEAT-2; pane 1 keeps the window's name"
ttt tmux open --pane --in V-SEAT -- sh >/dev/null
ttt tmux type V-SEAT.2 -- "ttt whoami"; ttt tmux press V-SEAT.2 Enter; sleep 2
ttt capture V-SEAT-2 --lines 10 | grep -E "^(name|window|pane):"
ttt panes --window V-SEAT
ttt tmux type V-SEAT.1 -- "ttt whoami"; ttt tmux press V-SEAT.1 Enter; sleep 2
ttt capture V-SEAT --lines 10 | grep -E "^(name|pane):"
ttt panes --window V-SEAT

step "named second agent with a harness: --pane V-SIDE --harness $H"
ttt tmux open --pane V-SIDE --in V-SEAT --harness $H --cwd /tmp/opencode || exit 1
ttt panes --window V-SEAT
ttt windows | grep -c V-SIDE | sed 's/^/windows lines naming V-SIDE (expect 0): /'
ttt tmux open --window V-SIDE 2>&1 | sed 's/^/refused: /'

# broadcast --all (main agents only, W-N skipped) is covered by the e2e; running it here would page the live team.

step "doctor: no row for a registered window with distinct seats (expect 0)"
ttt tmux doctor | grep -c "V-SEAT"
true
