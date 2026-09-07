#!/usr/bin/env sh
# Furniture vs teammates, inside the live ttt session: a hand-made window becomes W-N, cannot be
# messaged, can be driven by pane, can be renamed, and becomes a teammate when adopted.
# Run from inside the session: sh .orchestrator/scripts/verify-furniture.sh
set -u
step() { printf '\n== %s\n' "$1"; }
cleanup() { for w in $(ttt windows | awk '$1 ~ /^(V-|W-)/ {print $1}'); do ttt tmux close "$w" >/dev/null 2>&1; done; }
trap cleanup EXIT
cleanup
step "prefix c (tmux names the window itself) -> hook renames it W-1, no stamp"
tmux new-window -d -c "#{pane_current_path}"; sleep 1.5; ttt tmux tree | grep -A1 'W-1'
step "messaging furniture is refused (exit 1); broadcast --all skips it"
ttt send W-1 -- hi; echo "exit=$?"
step "driving furniture by pane works"
ttt tmux type W-1.1 -- "echo driven"; ttt tmux press W-1.1 Enter; ttt tmux wait W-1.1 --for '^driven$' --timeout 5
step "rename: the stamp follows; a window with a mailbox refuses"
ttt tmux rename W-1 V-SCRATCH; ttt tmux rename FABLE X; echo "exit=$?"
step "adopt: open --window on furniture restarts pane 1 with the harness and stamps it"
ttt tmux open --window V-SCRATCH --harness; ttt tmux tree | grep -A1 'V-SCRATCH'
step "now it can be messaged; adopting again is refused"
ttt send V-SCRATCH --no-reply -- hello; ttt tmux wait V-SCRATCH --for 'ttt: 1 new from' --timeout 40
ttt tmux open --window V-SCRATCH --harness; echo "exit=$?"
step "borders: agent / titled helper / unstamped pane"
ttt tmux open --pane tests --in V-SCRATCH -- sleep 60 >/dev/null; ttt tmux open --pane "" --in V-SCRATCH >/dev/null
F="$(tmux show -wv -t "$(ttt whoami | sed -n 's/^session: //p')":V-SCRATCH pane-border-format)"
for p in $(tmux list-panes -t V-SCRATCH -F '#{pane_id}'); do printf '%s [%s]\n' "$p" "$(tmux display -p -t "$p" "$F")"; done
