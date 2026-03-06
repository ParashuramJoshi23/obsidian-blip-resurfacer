#!/usr/bin/env bash
set -euo pipefail

LABEL="com.parashuram.blip-resurfacer"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/${LABEL}.plist"
DST="$HOME/Library/LaunchAgents/${LABEL}.plist"

mkdir -p "$HOME/Library/LaunchAgents"

# Substitute __SCRIPTS_DIR__ placeholder with the real path
sed "s|__SCRIPTS_DIR__|${SCRIPT_DIR}|g" "$TEMPLATE" > "$DST"

launchctl unload "$DST" >/dev/null 2>&1 || true
launchctl load "$DST"
launchctl enable "gui/$(id -u)/${LABEL}" || true

printf "Installed %s\n" "$DST"
printf "Check: launchctl list | grep %s\n" "$LABEL"
