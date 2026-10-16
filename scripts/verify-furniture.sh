#!/usr/bin/env sh
# Hand-made windows remain unstamped; create refuses them without restarting.
# Run from inside the session: sh .orchestrator/scripts/verify-furniture.sh
set -u
step() { printf '\n== %s\n' "$1"; }
created=""
cleanup() { for w in $created; do ttt tmux close "$w" >/dev/null 2>&1; done; }
trap cleanup EXIT
step "tmux names a new window; the hook gives it W-N without a stamp"
id=$(tmux new-window -d -P -F '#{window_id}' -c '#{pane_current_path}') || exit 1
sleep 1.5
name=$(tmux display-message -p -t "$id" '#{window_name}')
created="$name"
ttt tmux tree | grep -A1 "$id"
step "creation with that name is refused; the shell keeps running"
original=$(tmux display-message -p -t "$id" '#{pane_pid}')
ttt create --window "$name" --harness; echo "exit=$?"
current=$(tmux display-message -p -t "$id" '#{pane_pid}')
[ "$original" = "$current" ] || exit 1
step "the unregistered window is still reachable by name"
ttt tmux type "$name" -- 'echo driven'; ttt tmux press "$name" Enter
ttt tmux wait "$name" --for '^driven$' --timeout 5
step "a new shell and its command pane are registered immediately"
ttt create --window V-SCRATCH --shell || exit 1
created="$created V-SCRATCH"
ttt create --pane tests --in V-SCRATCH -- sleep 60
ttt create --pane --in V-SCRATCH
ttt panes --window V-SCRATCH
