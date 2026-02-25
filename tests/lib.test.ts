import { describe, it, expect, vi } from 'vitest';
import {
  detectBinary,
  parsePackFromText,
  generateFallback,
  buildPrompt,
  formatDate
} from '../lib';

// ── detectBinary ─────────────────────────────────────────────────────────────

describe('detectBinary', () => {
  it('returns the trimmed which output when found', async () => {
    const result = await detectBinary('node', async () => '/opt/homebrew/bin/node\n', '/home/user');
    expect(result).toBe('/opt/homebrew/bin/node');
  });

  it('falls back to bare name when which throws', async () => {
    const result = await detectBinary('unknown', async () => { throw new Error('not found'); });
    expect(result).toBe('unknown');
  });

  it('falls back to bare name when which returns empty string', async () => {
    const result = await detectBinary('node', async () => '   ', '/home/user');
    expect(result).toBe('node');
  });

  it('includes home-based paths in the PATH when home is provided', async () => {
    let capturedCmd = '';
    await detectBinary('codex', async (cmd) => { capturedCmd = cmd; return '/found/codex'; }, '/home/user');
    expect(capturedCmd).toContain('/home/user/.npm-global/bin');
    expect(capturedCmd).toContain('/home/user/.local/bin');
  });

  it('includes standard system paths regardless of home', async () => {
    let capturedCmd = '';
    await detectBinary('claude', async (cmd) => { capturedCmd = cmd; return '/found'; }, '');
    expect(capturedCmd).toContain('/opt/homebrew/bin');
    expect(capturedCmd).toContain('/usr/local/bin');
    expect(capturedCmd).toContain('/usr/bin');
  });

  it('works with empty home without adding empty path segments', async () => {
    let capturedCmd = '';
    await detectBinary('node', async (cmd) => { capturedCmd = cmd; return '/usr/bin/node'; }, '');
    expect(capturedCmd).not.toContain('undefined');
    expect(capturedCmd).not.toMatch(/^:/);
  });

  it('caches nothing across calls – each call runs exec', async () => {
    const exec = vi.fn().mockResolvedValue('/usr/bin/node');
    await detectBinary('node', exec, '');
    await detectBinary('node', exec, '');
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

// ── parsePackFromText ────────────────────────────────────────────────────────

describe('parsePackFromText', () => {
  it('parses valid JSON directly', () => {
    const input = JSON.stringify({
      insight: 'Key insight here',
      nextSteps: ['Step 1', 'Step 2'],
      reminder: 'Stay focused'
    });
    const result = parsePackFromText(input);
    expect(result.insight).toBe('Key insight here');
    expect(result.nextSteps).toEqual(['Step 1', 'Step 2']);
    expect(result.reminder).toBe('Stay focused');
  });

  it('extracts JSON embedded in surrounding text', () => {
    const input =
      'Sure! Here:\n{"insight":"Embedded","nextSteps":["a"],"reminder":"go"}\nDone.';
    const result = parsePackFromText(input);
    expect(result.insight).toBe('Embedded');
  });

  it('returns defaults for completely invalid JSON', () => {
    const result = parsePackFromText('not json at all');
    expect(result.insight).toBe('Refine this blip into a concrete next action.');
    expect(result.nextSteps).toHaveLength(1);
    expect(result.reminder).toBe('Small execution beats perfect planning.');
  });

  it('returns defaults for empty input', () => {
    const result = parsePackFromText('');
    expect(result.insight).toBe('Refine this blip into a concrete next action.');
  });

  it('fills missing fields with defaults', () => {
    const result = parsePackFromText(JSON.stringify({ insight: 'Only insight' }));
    expect(result.insight).toBe('Only insight');
    expect(result.nextSteps).toEqual(['Take one small concrete step and note the result.']);
    expect(result.reminder).toBe('Small execution beats perfect planning.');
  });

  it('trims whitespace from string fields', () => {
    const input = JSON.stringify({
      insight: '  trimmed  ',
      nextSteps: ['step'],
      reminder: '  also trimmed  '
    });
    const result = parsePackFromText(input);
    expect(result.insight).toBe('trimmed');
    expect(result.reminder).toBe('also trimmed');
  });

  it('caps nextSteps at 3 items', () => {
    const input = JSON.stringify({
      insight: 'x',
      nextSteps: ['a', 'b', 'c', 'd', 'e'],
      reminder: 'y'
    });
    expect(parsePackFromText(input).nextSteps).toHaveLength(3);
  });
});

// ── generateFallback ─────────────────────────────────────────────────────────

describe('generateFallback', () => {
  it('returns Kafka pack when title contains "kafka"', () => {
    const result = generateFallback('Kafka internals', '');
    expect(result.insight).toContain('implementation value');
    expect(result.nextSteps).toHaveLength(3);
    expect(result.reminder).toContain('artifact');
  });

  it('returns Kafka pack when content contains "tcp"', () => {
    const result = generateFallback('Networking', 'learning tcp sockets today');
    expect(result.reminder).toContain('artifact');
  });

  it('returns Kafka pack when content contains "queue"', () => {
    const result = generateFallback('Notes', 'queue-based architecture');
    expect(result.insight).toContain('implementation value');
  });

  it('returns diet pack when content contains "protein"', () => {
    const result = generateFallback('Health', 'protein intake goals');
    expect(result.insight).toContain('behavior-change');
    expect(result.nextSteps[0]).toContain('soya/protein');
  });

  it('returns diet pack when content contains "soya"', () => {
    const result = generateFallback('Nutrition', 'soya chunks experiment');
    expect(result.reminder).toContain('experiment');
  });

  it('returns generic pack for unrecognised content', () => {
    const result = generateFallback('Random idea', 'something unrelated');
    expect(result.insight).toContain('concrete next action');
    expect(result.nextSteps[0]).toContain('smallest testable action');
  });
});

// ── buildPrompt ──────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('includes the title', () => {
    expect(buildPrompt('ctx', 'My Blip Title', 'content')).toContain('My Blip Title');
  });

  it('includes the user context', () => {
    expect(buildPrompt('backend engineer', 'title', 'content')).toContain('backend engineer');
  });

  it('truncates note content to 3500 chars', () => {
    const longContent = 'x'.repeat(5000);
    const prompt = buildPrompt('ctx', 'title', longContent);
    expect(prompt).toContain('x'.repeat(3500));
    expect(prompt).not.toContain('x'.repeat(3501));
  });

  it('requests JSON output with required keys', () => {
    const prompt = buildPrompt('ctx', 'title', 'content');
    expect(prompt).toContain('"insight"');
    expect(prompt).toContain('"nextSteps"');
    expect(prompt).toContain('"reminder"');
  });
});

// ── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(formatDate(new Date('2025-06-15T12:00:00Z'))).toBe('2025-06-15');
  });

  it('output matches YYYY-MM-DD pattern', () => {
    expect(formatDate(new Date('2025-01-05T00:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
