#!/bin/sh
set -eu
# Exercise machine-readable tmux output without inheriting the developer's UTF-8 locale.
export LC_ALL=C
for path in .git .env .npmrc .orchestrator/plans .orchestrator/project-identity.json; do
  test ! -e "$path" || { printf 'Unexpected host input in image: %s\n' "$path" >&2; exit 1; }
done
test -z "$(find "$TMPDIR" -mindepth 1 -print -quit)" || { printf 'Image contains pre-existing scratch files\n' >&2; exit 1; }
node --version
pnpm --version
tmux -V
pnpm run check
pnpm run verify:packed
