#!/usr/bin/env sh
# Exercises `ttt tmux open` inside the current ttt session. Windows it creates start with V-.
# Cleans up after itself. Run from inside the session: sh .orchestrator/scripts/verify-open.sh
set -u
step() { printf '\n== %s\n' "$1"; }
cleanup() { for w in $(ttt windows | awk '$1 ~ /^(V-|W-|OPENCODE-|CLAUDE-|CODEX-)/ {print $1}'); do ttt tmux close "$w" >/dev/null 2>&1; done; }
trap cleanup EXIT
cleanup

step "window with the sh preset (must return quickly with 'ready after')"
ttt tmux open --window V-SH --ready '^[^ ]*[$#] *$' -- sh; echo "exit=$?"
step "auto names: harness -> HARNESS-N (default harness, bare --harness), shell -> W-N"
ttt tmux open --window auto --harness; ttt tmux open --window auto
step "errors: duplicate, too long, unknown harness w/o --ready, no container, both containers"
ttt tmux open --window V-SH --ready '^[^ ]*[$#] *$' -- sh; ttt tmux open --window V-TOO-LONG-NAME; ttt tmux open --window V-X --harness nope; ttt tmux open; ttt tmux open --window V-Y --pane t
step "ready override that times out keeps the window"
ttt tmux open --window V-SLOW --ready never --ready-timeout 1 -- sh; echo "exit=$?"; ttt windows | grep -c V-SLOW
step "helper panes: titled, untitled, in another window; split alias"
ttt tmux open --pane tests --in V-SH --horizontal --size 30 -- sleep 300
ttt tmux open --pane "" --in V-SH
ttt tmux split V-SH -- sleep 5
step "tree for V-SH"
ttt tmux tree | grep -A4 'V-SH'
