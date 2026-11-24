#!/bin/sh
# Classify a push or pull_request for ci.yml.
# Writes docs_only=true to $GITHUB_OUTPUT when every changed path is documentation:
# **/*.md, docs/**, .github/FUNDING.yml, LICENSE.
# workflow_call (the release workflow) and any other event write docs_only=false.
# ponytail: paths are newline-delimited; a newline inside a path can mis-classify.
# Usage: sh .orchestrator/scripts/ci-docs-only.sh
#        sh .orchestrator/scripts/ci-docs-only.sh --stdin < paths
set -eu

classify() {
  only=true
  seen=false
  while IFS= read -r path || [ -n "$path" ]; do
    [ -n "$path" ] || continue
    seen=true
    case "$path" in
      *.md|docs/*|.github/FUNDING.yml|LICENSE) ;;
      *) only=false ;;
    esac
  done
  if [ "$seen" = false ]; then
    only=false
  fi
  printf '%s\n' "$only"
}

if [ "${1:-}" = --stdin ]; then
  classify
  exit 0
fi

cd "$(dirname "$0")/../.."
event=${EVENT_NAME:-}
only=false
if [ "$event" = pull_request ]; then
  base=${BASE_SHA:-}
  pr=${PR:-}
  case "$base" in
    *[!0-9a-fA-F]*|'') printf 'missing pull request base sha\n' >&2; exit 1 ;;
  esac
  case "$pr" in
    *[!0-9]*|'') printf 'missing pull request number\n' >&2; exit 1 ;;
  esac
  git fetch --no-tags origin "$base"
  git fetch --no-tags origin "pull/${pr}/head"
  files=$(git -c core.quotePath=false diff --name-only --no-renames "${base}...FETCH_HEAD")
  only=$(printf '%s\n' "$files" | classify)
  printf '%s\n' "$files"
elif [ "$event" = push ]; then
  before=${BEFORE:-}
  case "$before" in
    0000000000000000000000000000000000000000|'')
      only=false
      ;;
    *[!0-9a-fA-F]*)
      printf 'bad before sha\n' >&2
      exit 1
      ;;
    *)
      git fetch --no-tags origin "$before"
      files=$(git -c core.quotePath=false diff --name-only --no-renames "${before}...HEAD")
      only=$(printf '%s\n' "$files" | classify)
      printf '%s\n' "$files"
      ;;
  esac
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'docs_only=%s\n' "$only" >> "$GITHUB_OUTPUT"
fi
printf 'docs_only=%s\n' "$only"
