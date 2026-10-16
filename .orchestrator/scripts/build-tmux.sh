#!/bin/sh
# Container build stage only; installs tmux into that image, never the host.
set -eu
version=${1:?tmux version required}
case "$version" in *[!0-9.a-z]*|'') exit 2 ;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
checksum=$(grep "  tmux-$version.tar.gz$" "$root/.orchestrator/scripts/tmux-checksums.sha256")
mkdir -p "$root/.orchestrator/tmp"
work=$(mktemp -d "$root/.orchestrator/tmp/tmux-build-XXXXXX")
trap 'rm -rf "$work"' EXIT
cd "$work"
curl --fail --location --retry 3 --output "tmux-$version.tar.gz" "https://github.com/tmux/tmux/releases/download/$version/tmux-$version.tar.gz"
printf '%s\n' "$checksum" | sha256sum --check -
tar -xzf "tmux-$version.tar.gz"
cd "tmux-$version"
./configure --disable-utf8proc --disable-systemd
make -j2
make install
tmux -V
