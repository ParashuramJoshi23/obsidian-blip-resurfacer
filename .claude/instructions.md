# Claude Configuration – Blip Resurfacer

## Project overview
Obsidian plugin that resurfaces `type: blip` notes in-place, appending AI-generated next steps.

## File layout

| File | Purpose |
|---|---|
| `main.ts` | Plugin entry point, Obsidian APIs, settings tab |
| `lib.ts` | Pure functions with no Obsidian/Node dependencies (testable) |
| `tests/lib.test.ts` | Vitest unit tests for `lib.ts` |
| `scripts/run-blip-resurfacer.sh` | Shell script triggered by cron / launchd |
| `scripts/install-launchd.sh` | Installs the launchd plist (uses `SCRIPT_DIR`, no hardcoded paths) |
| `scripts/com.parashuram.blip-resurfacer.plist` | launchd template – `__SCRIPTS_DIR__` is substituted at install time |

## Key design decisions

- **Pure functions in `lib.ts`** – `parsePackFromText`, `generateFallback`, `buildPrompt`, `formatDate`, `detectBinary` are dependency-injected and fully unit-tested.
- **Binary auto-detection** – `detectBinary(name, exec, home)` runs `which` with an augmented PATH covering common install locations. No user-configured paths needed.
- **Single-file resurface** – The `Resurface current blip` command acts on the active file (if it's a blip) or the oldest unreviewed blip. It never batch-processes.
- **No hardcoded paths** – All user-specific paths removed from defaults and settings UI.

## Settings (user-facing)

- `maxDailyResurface` – informational limit for scheduled runs
- `aiProvider` – `local-cli` | `openai` | `fallback`
- `localCli` – `claude` | `codex` (auto-detected via `which`)
- `strictLocalAi` – fail hard if local CLI errors rather than falling back
- `openaiApiKey` / `openaiModel` – only shown when provider is `openai`
- `userContext` – appended to every AI prompt

## Dev workflow

```bash
npm run build       # one-off build
npm run dev         # watch mode (esbuild)
npm test            # vitest (run once)
npm run test:watch  # vitest watch
```

## Testing approach

- All tests live in `tests/lib.test.ts` and only import from `lib.ts`
- Dependencies (`exec`, `exists`) are injected so tests run in plain Node without mocking Obsidian
- Run `npm test` to verify before committing
