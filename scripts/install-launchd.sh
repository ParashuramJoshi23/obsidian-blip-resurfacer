#!/usr/bin/env bash
set -euo pipefail

LABEL="com.parashuram.blip-resurfacer"
SRC="/Users/parashuram/clawd/projects/obsidian-blip-resurfacer/scripts/${LABEL}.plist"
DST="$HOME/Library/LaunchAgents/${LABEL}.plist"

mkdir -p "$HOME/Library/LaunchAgents"
cp "$SRC" "$DST"
launchctl unload "$DST" >/dev/null 2>&1 || true
launchctl load "$DST"
launchctl enable "gui/$(id -u)/${LABEL}" || true

printf "Installed %s\n" "$DST"
printf "Check: launchctl list | grep %s\n" "$LABEL"
