#!/usr/bin/env sh
# The teammate flow, for real: create a harness window, wait until it accepts input,
# message it. Uses the sh harness so it is deterministic; pass a harness name to try a real one.
# Run from inside the ttt session: sh .orchestrator/scripts/verify-teammate-flow.sh [harness]
set -u
H=${1:-}  # empty = the default harness from settings; pass a declared name to pick one
created=""
trap '[ -z "$created" ] || ttt tmux close "$created" >/dev/null 2>&1' EXIT
echo "== 1. create"; ttt create --window V-MATE --harness $H || exit 1
created="V-MATE"
echo "== 2. the teammate identifies itself as V-MATE (proves identity + stamp)"
ttt tmux type V-MATE -- "ttt whoami" && ttt tmux press V-MATE Enter && ttt tmux wait V-MATE --for '^name: V-MATE$' --timeout 10 || exit 1
echo "== 3. send; the notification must land in V-MATE's pane"
ttt send V-MATE --no-reply -- hello teammate
ttt tmux wait V-MATE --for 'ttt: 1 new from' --timeout 40
echo "== 4. teammate reads it"
ttt tmux type V-MATE -- "ttt read"; ttt tmux press V-MATE Enter; ttt tmux wait V-MATE --for 'hello teammate' --timeout 10
echo "== tree"; ttt tmux tree | grep -A2 V-MATE
