# Obsidian Blip Resurfacer

Resurface notes tagged `type: blip`, update them **in-place**, and append AI-generated next steps.

## What it does

- Finds the **currently open blip note** (or the oldest unreviewed one if none is open)
- Updates frontmatter: `blip_last_reviewed`, `blip_next_review`, `blip_resurface_count`
- Appends a dated entry under `## Blip updates (Clawd)` with an insight, concrete next steps, and a reminder

## AI backends

| Provider | How it works |
|---|---|
| **Local CLI** (default) | Runs `claude` or `codex` – path auto-detected via `which` |
| **OpenAI API** | Calls `gpt-4o-mini` (or your chosen model) |
| **Fallback** | Rule-based output, no AI required |

## Install (manual)

```bash
mkdir -p "$VAULT/.obsidian/plugins/blip-resurfacer"
cp main.js manifest.json versions.json "$VAULT/.obsidian/plugins/blip-resurfacer/"
```

Then: **Settings → Community Plugins → enable Blip Resurfacer**

## Configuration

Only three things to set:

| Setting | Default | Description |
|---|---|---|
| **Max daily blips** | 3 | How many blips the scheduled cron resurfaces per day |
| **AI provider** | Local CLI | Which backend generates the next steps |
| **User context** | backend engineer | Appended to every prompt to tailor output |

No paths to configure – the plugin auto-detects `claude`, `codex`, and `node` via `which`.

## Commands

| Command | Action |
|---|---|
| `Resurface current blip` | Resurfaces the active note if it's a blip, else the oldest unreviewed blip |
| `Test local AI backend` | Sends a test prompt to verify your local CLI is working |

## Cron automation (macOS)

Run the plugin daily at 09:00 so blips are ready when you open Obsidian.

### Option A – launchd (recommended)

```bash
bash scripts/install-launchd.sh
```

The script auto-detects its own location; no paths to edit.
To change the schedule, edit `StartCalendarInterval` in the plist before installing.

### Option B – classic cron

```bash
(crontab -l 2>/dev/null; echo "0 9 * * * /bin/bash /ABS/PATH/TO/scripts/run-blip-resurfacer.sh") | crontab -
```

## Blip frontmatter example

```yaml
---
type: blip
blip_status: awareness
blip_created: 2025-01-10
blip_last_reviewed: 2025-06-15
blip_next_review: 2025-06-17
blip_resurface_count: 3
---
```
