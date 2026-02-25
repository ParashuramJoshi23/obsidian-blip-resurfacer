// Pure functions – no Obsidian or runtime-specific dependencies.

export type BlipPack = {
  insight: string;
  nextSteps: string[];
  reminder: string;
};

export type LocalCli = 'codex' | 'claude';

// ── Binary detection ─────────────────────────────────────────────────────────

/**
 * Locate a CLI binary by running `which` with an augmented PATH that covers
 * common install locations. Falls back to the bare name so the OS PATH can
 * handle it at spawn time.
 *
 * @param name  Binary name, e.g. "claude" or "node"
 * @param exec  Runs a shell command and resolves with stdout (injectable for tests)
 * @param home  Value of $HOME (pass `process.env.HOME || ''`)
 */
export async function detectBinary(
  name: string,
  exec: (cmd: string) => Promise<string>,
  home = ''
): Promise<string> {
  const extraPaths = [
    home && `${home}/.npm-global/bin`,
    home && `${home}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin'
  ]
    .filter(Boolean)
    .join(':');

  try {
    const found = (await exec(`PATH="${extraPaths}:$PATH" which ${name}`)).trim();
    if (found) return found;
  } catch {
    // binary not found via which
  }

  return name; // last resort: let spawn delegate to OS PATH
}

// ── Text / JSON helpers ──────────────────────────────────────────────────────

export function parsePackFromText(rawText: string): BlipPack {
  const raw = rawText?.trim() || '{}';
  let parsed: Partial<BlipPack> = {};

  try {
    parsed = JSON.parse(raw) as Partial<BlipPack>;
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        parsed = JSON.parse(raw.slice(first, last + 1)) as Partial<BlipPack>;
      } catch {
        parsed = {};
      }
    }
  }

  return {
    insight: parsed.insight?.trim() || 'Refine this blip into a concrete next action.',
    nextSteps: parsed.nextSteps?.filter(Boolean).slice(0, 3) || [
      'Take one small concrete step and note the result.'
    ],
    reminder: parsed.reminder?.trim() || 'Small execution beats perfect planning.'
  };
}

export function generateFallback(title: string, noteContent: string): BlipPack {
  const text = `${title}\n${noteContent}`.toLowerCase();

  if (text.includes('kafka') || text.includes('tcp') || text.includes('queue')) {
    return {
      insight:
        'This blip has strong implementation value; convert it into one tiny experiment before reading more.',
      nextSteps: [
        'Read one practical article on Kafka over TCP internals (15–20 min cap).',
        'Build a mini PoC: single producer + consumer with one observable metric (latency or retries).',
        'Write 5 bullet learnings in this same note and link to one related system-design note.'
      ],
      reminder: 'Ship one artifact, not just one reading.'
    };
  }

  if (
    text.includes('protein') ||
    text.includes('soya') ||
    text.includes('diet') ||
    text.includes('food')
  ) {
    return {
      insight:
        'This is a behavior-change blip; the fastest clarity comes from a 7-day measured trial.',
      nextSteps: [
        'Pick one daily soya/protein plan and run it for 7 days.',
        'Track satiety, digestion, and energy in one line per day in this note.',
        'At day 7, keep/adjust/drop based on evidence, not mood.'
      ],
      reminder: 'One controlled experiment beats endless nutrition browsing.'
    };
  }

  return {
    insight: 'Narrow this into a concrete next action to preserve momentum.',
    nextSteps: [
      'Define the smallest testable action (<=25 min).',
      'Do it once this week and capture outcome in this note.',
      'Add one link to a related note for context continuity.'
    ],
    reminder: 'Prefer completion artifacts over more inputs.'
  };
}

export function buildPrompt(userContext: string, title: string, noteContent: string): string {
  return `You help resurface personal Obsidian blips in-place.

Context:
- ${userContext}
- Keep output practical, small, and execution-first.
- Output must be valid JSON only.

Blip title: ${title}
Blip content excerpt:
${noteContent.slice(0, 3500)}

Return JSON exactly with keys:
{
  "insight": "string (max 2 lines)",
  "nextSteps": ["2-3 concrete steps"],
  "reminder": "one short reminder"
}`;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
