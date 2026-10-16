#!/bin/sh
# Same entrypoint locally and in CI. No bind mounts or privileged host access.
# Usage: sh .orchestrator/scripts/verify-container.sh [TMUX_VERSION ...]
set -eu
cd "$(dirname "$0")/../.."
if [ "$#" -eq 0 ]; then set -- 3.2 3.4 3.8; fi
for version do
  case "$version" in *[!0-9.a-z]*|'') exit 2 ;; esac
  grep -Fq "  tmux-$version.tar.gz" .orchestrator/scripts/tmux-checksums.sha256
  TMUX_VERSION="$version" docker compose -f compose.yaml run --build --rm --no-deps verify
done
