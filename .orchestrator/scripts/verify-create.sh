#!/usr/bin/env sh
# Exercises ttt create inside the current session. Closes only the windows it creates.
# Run: sh .orchestrator/scripts/verify-create.sh
set -u
step() { printf '\n== %s\n' "$1"; }
created_windows=""
cleanup() { for w in $created_windows; do ttt tmux close "$w" >/dev/null 2>&1; done; }
trap cleanup EXIT

step "registered shell: no harness or readiness wait"
ttt create --window V-SH --shell || exit 1
created_windows="V-SH"
ttt panes --window V-SH
step "auto names: harness -> HARNESS-N, shell -> SHELL-N"
for mode in --harness --shell; do
  result=$(ttt create --window auto "$mode") || exit 1
  printf '%s\n' "$result"
  created_windows="$created_windows $(printf '%s\n' "$result" | awk '{print $2}')"
done
step "errors: duplicate, too long, unknown harness, no container, both containers, conflicting programs"
ttt create --window V-SH; ttt create --window V-TOO-LONG-NAME; ttt create --window V-X --harness nope
ttt create; ttt create --window V-Y --pane t; ttt create --window V-Y --shell --harness
step "ready timeout keeps the registered command window"
if ttt windows | awk '{print $1}' | grep -qx V-SLOW; then
  printf '%s\n' 'V-SLOW already exists; skipping timeout probe'
else
  ttt create --window V-SLOW --ready never --ready-timeout 1 -- sh; echo "exit=$?"
  created_windows="$created_windows V-SLOW"
fi
step "command and shell panes are registered immediately"
ttt create --pane tests --in V-SH --horizontal --size 30 -- sleep 300
ttt create --pane --in V-SH --shell
ttt panes --window V-SH
step "tree for V-SH"
ttt tmux tree | grep -A4 'V-SH'
