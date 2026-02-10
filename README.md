# Obsidian Blip Resurfacer

Resurface notes with frontmatter `type: blip`, update them **in-place**, and append quality next steps.

## Features
- Finds `type: blip` notes
- Updates frontmatter (`blip_last_reviewed`, `blip_next_review`, counters)
- Appends updates under `## Blip updates (Clawd)` in the same note
- AI backends:
  - Local CLI (Codex/Claude)
  - OpenAI API (optional)
  - fallback rules

## Install (manual)
Copy plugin files to your vault:

```bash
mkdir -p "$VAULT/.obsidian/plugins/blip-resurfacer"
cp main.js manifest.json versions.json "$VAULT/.obsidian/plugins/blip-resurfacer/"
```

Then in Obsidian:
- Settings → Community Plugins → enable **Blip Resurfacer**

## Commands
- `Resurface blips now`
- `Test local AI backend (Codex/Claude)`

## Cron automation (macOS)

### Option A: launchd (recommended)
Use the included script + plist to trigger the Obsidian command daily.

1) Edit `scripts/com.parashuram.blip-resurfacer.plist` if needed (time defaults to 09:00)
2) Install:

```bash
bash scripts/install-launchd.sh
```

### Option B: classic cron
Runs a shell script that sends an Obsidian command URI:

```bash
(crontab -l 2>/dev/null; echo "0 9 * * * /bin/bash /ABS/PATH/TO/scripts/run-blip-resurfacer.sh") | crontab -
```

## Notes
- For local CLI mode, set absolute paths in plugin settings:
  - Codex: `/Users/parashuram/.npm-global/bin/codex`
  - Claude: `/Users/parashuram/.local/bin/claude`
  - Node (Codex): `/opt/homebrew/bin/node`
