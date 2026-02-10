#!/usr/bin/env bash
set -euo pipefail

VAULT_NAME="Personal-Backup"
COMMAND_ID="blip-resurfacer:resurface-blips-now"

ENCODED_COMMAND_ID="blip-resurfacer%3Aresurface-blips-now"
open "obsidian://command?vault=${VAULT_NAME}&command=${ENCODED_COMMAND_ID}"
