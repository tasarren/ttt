#!/usr/bin/env bash
# Live check of quiet waits (step 15): a waiting pane is never pasted; empty read-waits ramp.
# Every verb goes through $TTT_BIN (default `ttt`), so worktree source can drive the live
# session: TTT_BIN="node /path/to/packages/cli/src/ttt.ts" sh .orchestrator/scripts/verify-wait.sh
# Windows are prefixed V- and removed at the end. The ramp curve itself is e2e-covered (120 s
# waits are too slow to watch live); here the streak file appears and disappears.
set -u
T=${TTT_BIN:-ttt}
step() { printf '\n== %s\n' "$*"; }
fail() { echo "FAIL: $*"; exit 1; }
session() { $T whoami | awk '/^session:/ {print $2}'; }
cleanup() {
  local s
  s=$(session) || return 0
  for w in $($T windows | awk '$1 ~ /^V-/ {print $1}'); do $T tmux close "$w" >/dev/null 2>&1; done
  rm -f ~/.ttt/boards/"$s"/state/V-A.wait.json ~/.ttt/boards/"$s"/state/V-A.waiting.json ~/.ttt/boards/"$s"/state/V-A.notification.json
  rm -rf ~/.ttt/boards/"$s"/mailboxes/V-A ~/.ttt/boards/"$s"/mailboxes/V-B
}
trap cleanup EXIT

step "two shell windows"
$T create --window V-A || exit 1
$T create --window V-B || exit 1

step "a normal send during read --wait lands in the wait's output, never as a paste"
$T tmux type V-A.1 -- "$T read --wait --timeout 15" >/dev/null
$T tmux press V-A.1 Enter >/dev/null
sleep 3
$T send V-A --no-reply -- "V: quiet probe"
sleep 3
$T capture V-A --lines 12 | grep -q "quiet probe" || fail "the wait did not print the batch"
$T capture V-A --lines 12 | grep -q "Run: ttt read" && fail "a paste reached the waiting pane"
echo "ok: batch printed, no prompt pasted"

step "urgent mail to a waiter likewise arrives via the wait"
$T tmux type V-A.1 -- "$T read --wait --timeout 15" >/dev/null
$T tmux press V-A.1 Enter >/dev/null
sleep 3
$T send V-A --no-reply --urgent -- "V: urgent probe"
sleep 3
$T capture V-A --lines 12 | grep -q "urgent probe" || fail "the wait did not print the urgent batch"
$T capture V-A --lines 12 | grep -q "URGENT" && fail "an urgent paste reached the waiting pane"
echo "ok: urgent batch printed, no URGENT pasted"

step "an empty wait leaves a streak that the next arrival removes"
$T tmux type V-A.1 -- "$T read --wait --timeout 3" >/dev/null
$T tmux press V-A.1 Enter >/dev/null
sleep 5
ST=~/.ttt/boards/$(session)/state/V-A.wait.json
test -e "$ST" || fail "no streak file after an empty wait"
echo "ok: streak present: $(cat "$ST")"
$T send V-A --no-reply -- "V: streak reset" >/dev/null
$T tmux type V-A.1 -- "$T read --wait --timeout 3" >/dev/null
$T tmux press V-A.1 Enter >/dev/null
sleep 5
test ! -e "$ST" || fail "arrival did not remove the streak"
echo "ok: streak gone after arrival"
