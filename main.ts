import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  requestUrl
} from 'obsidian';

type BlipPack = {
  insight: string;
  nextSteps: string[];
  reminder: string;
};

type AiProvider = 'local-cli' | 'openai' | 'fallback';
type LocalCli = 'codex' | 'claude';

interface BlipResurfacerSettings {
  maxDailyResurface: number;
  reviewIntervalDays: number;
  aiProvider: AiProvider;
  localCli: LocalCli;
  strictLocalAi: boolean;
  codexModel: string;
  claudeModel: string;
  codexPath: string;
  claudePath: string;
  nodePath: string;
  openaiApiKey: string;
  openaiModel: string;
  userContext: string;
}

const DEFAULT_SETTINGS: BlipResurfacerSettings = {
  maxDailyResurface: 2,
  reviewIntervalDays: 2,
  aiProvider: 'local-cli',
  localCli: 'codex',
  strictLocalAi: true,
  codexModel: 'gpt-5-codex',
  claudeModel: 'sonnet',
  codexPath: '/Users/parashuram/.npm-global/bin/codex',
  claudePath: '/Users/parashuram/.local/bin/claude',
  nodePath: '/opt/homebrew/bin/node',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  userContext:
    'User is an experienced backend engineer. Prefer concrete, small next steps and practical mini-POCs.'
};

export default class BlipResurfacerPlugin extends Plugin {
  settings: BlipResurfacerSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'resurface-blips-now',
      name: 'Resurface blips now',
      callback: async () => {
        const count = await this.resurfaceNow();
        new Notice(`Blip Resurfacer: updated ${count} blip(s)`);
      }
    });

    this.addCommand({
      id: 'test-local-ai-backend',
      name: 'Test local AI backend (Codex/Claude)',
      callback: async () => {
        try {
          const pack = await this.generateViaLocalCli(
            'Backend connectivity test',
            'Create one insight and two practical steps about learning Kafka over TCP.'
          );
          new Notice(`Local AI OK (${this.settings.localCli}). Insight: ${pack.insight.slice(0, 80)}...`);
        } catch (e) {
          new Notice(`Local AI failed (${this.settings.localCli}): ${String((e as Error)?.message || e).slice(0, 140)}`);
        }
      }
    });

    this.addSettingTab(new BlipResurfacerSettingTab(this.app, this));
  }

  async loadSettings() {
    const loaded = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as BlipResurfacerSettings & {
      aiEnabled?: boolean;
    };

    // Legacy migration from v0.1.0 keys
    if (typeof loaded.aiEnabled === 'boolean') {
      if (!loaded.aiEnabled) loaded.aiProvider = 'fallback';
      else if (loaded.aiProvider === 'fallback') loaded.aiProvider = 'local-cli';
    }

    // Normalize known-bad local model names
    if (!loaded.codexModel?.trim() || loaded.codexModel.includes('gpt-5.3-codex')) {
      loaded.codexModel = 'gpt-5-codex';
    }
    if (!loaded.claudeModel?.trim()) {
      loaded.claudeModel = 'sonnet';
    }
    if (!loaded.codexPath?.trim()) {
      loaded.codexPath = '/Users/parashuram/.npm-global/bin/codex';
    }
    if (!loaded.claudePath?.trim()) {
      loaded.claudePath = '/Users/parashuram/.local/bin/claude';
    }
    if (!loaded.nodePath?.trim()) {
      loaded.nodePath = '/opt/homebrew/bin/node';
    }

    this.settings = loaded;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async resurfaceNow(): Promise<number> {
    const blips = await this.getBlipFiles();
    if (!blips.length) {
      new Notice('No notes with type: blip found.');
      return 0;
    }

    const selected = blips.slice(0, Math.max(1, this.settings.maxDailyResurface));

    for (const file of selected) {
      const text = await this.app.vault.read(file);
      const pack = await this.generateBlipPack(file.basename, text);
      await this.updateBlipFrontmatter(file);
      await this.appendBlipUpdate(file, pack);
    }

    return selected.length;
  }

  private async getBlipFiles(): Promise<TFile[]> {
    const all = this.app.vault.getMarkdownFiles();
    const withMeta: Array<{ file: TFile; reviewedAt: number }> = [];

    for (const file of all) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter as Record<string, unknown> | undefined;
      if (!fm || String(fm.type ?? '').toLowerCase() !== 'blip') continue;

      const reviewedRaw = String(fm.blip_last_reviewed ?? '');
      const reviewedTs = reviewedRaw ? Date.parse(reviewedRaw) : 0;
      withMeta.push({ file, reviewedAt: Number.isNaN(reviewedTs) ? 0 : reviewedTs });
    }

    return withMeta
      .sort((a, b) => {
        if (a.reviewedAt !== b.reviewedAt) return a.reviewedAt - b.reviewedAt;
        return a.file.stat.mtime - b.file.stat.mtime;
      })
      .map((x) => x.file);
  }

  private async updateBlipFrontmatter(file: TFile) {
    const today = this.formatDate(new Date());
    const next = new Date();
    next.setDate(next.getDate() + this.settings.reviewIntervalDays);

    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm.type = 'blip';
      fm.blip_status = fm.blip_status ?? 'awareness';
      fm.blip_created = fm.blip_created ?? today;
      fm.blip_last_reviewed = today;
      fm.blip_next_review = this.formatDate(next);
      fm.blip_resurface_count = Number(fm.blip_resurface_count ?? 0) + 1;
    });
  }

  private async appendBlipUpdate(file: TFile, pack: BlipPack) {
    const dateStr = this.formatDate(new Date());
    const sectionHeader = '## Blip updates (Clawd)';

    const entry = [
      `### ${dateStr}`,
      `- Generated by: ${this.settings.aiProvider === 'local-cli' ? this.settings.localCli : this.settings.aiProvider}`,
      `- Insight: ${pack.insight}`,
      `- Next quality steps:`,
      ...pack.nextSteps.map((s) => `  - ${s}`),
      `- Reminder: ${pack.reminder}`,
      ''
    ].join('\n');

    const content = await this.app.vault.read(file);

    if (content.includes(sectionHeader)) {
      await this.app.vault.modify(file, `${content.trimEnd()}\n\n${entry}`);
      return;
    }

    const updated = `${content.trimEnd()}\n\n${sectionHeader}\n\n${entry}`;
    await this.app.vault.modify(file, updated);
  }

  private async generateBlipPack(title: string, noteContent: string): Promise<BlipPack> {
    if (this.settings.aiProvider === 'local-cli') {
      try {
        return await this.generateViaLocalCli(title, noteContent);
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        console.error('Blip Resurfacer local CLI failed', e);
        new Notice(`Blip Resurfacer: local ${this.settings.localCli} failed (${msg.slice(0, 120)})`);
        if (this.settings.strictLocalAi) {
          throw e;
        }
      }
    }

    if (this.settings.aiProvider === 'openai' && this.settings.openaiApiKey.trim()) {
      try {
        return await this.generateViaOpenAI(title, noteContent);
      } catch (e) {
        console.error('Blip Resurfacer OpenAI failed, using fallback', e);
      }
    }

    return this.generateFallback(title, noteContent);
  }

  private buildPrompt(title: string, noteContent: string): string {
    return `You help resurface personal Obsidian blips in-place.

Context:
- ${this.settings.userContext}
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

  private async generateViaLocalCli(title: string, noteContent: string): Promise<BlipPack> {
    const prompt = this.buildPrompt(title, noteContent);
    const vaultPath = this.app.vault.adapter.getBasePath();

    let stdout = '';

    if (this.settings.localCli === 'codex') {
      const req = this.nodeRequire();
      const fs = req('fs') as typeof import('fs');
      const os = req('os') as typeof import('os');
      const path = req('path') as typeof import('path');
      const codexBin = this.resolveLocalCliBinary('codex', this.settings.codexPath);
      const outPath = path.join(os.tmpdir(), `blip-resurfacer-${Date.now()}.json`);
      const schemaPath = path.join(os.tmpdir(), `blip-resurfacer-schema-${Date.now()}.json`);
      fs.writeFileSync(
        schemaPath,
        JSON.stringify({
          type: 'object',
          additionalProperties: false,
          required: ['insight', 'nextSteps', 'reminder'],
          properties: {
            insight: { type: 'string' },
            nextSteps: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } },
            reminder: { type: 'string' }
          }
        })
      );

      const args = [
        'exec',
        '--skip-git-repo-check',
        '--output-schema',
        schemaPath,
        '-C',
        vaultPath,
        '--output-last-message',
        outPath,
        '-'
      ];
      if (this.settings.codexModel.trim()) {
        args.splice(1, 0, '--model', this.settings.codexModel.trim());
      }

      const nodeBin = this.resolveNodeBinary(this.settings.nodePath);
      await this.runCommand(nodeBin, [codexBin, ...args], prompt, vaultPath);
      stdout = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      if (fs.existsSync(schemaPath)) fs.unlinkSync(schemaPath);
    } else {
      const claudeBin = this.resolveLocalCliBinary('claude', this.settings.claudePath);
      const args = ['-p', '--output-format', 'text'];
      if (this.settings.claudeModel.trim()) {
        args.push('--model', this.settings.claudeModel.trim());
      }
      args.push(prompt);
      stdout = await this.runCommand(claudeBin, args, undefined, vaultPath);
    }

    return this.parsePackFromText(stdout);
  }

  private async generateViaOpenAI(title: string, noteContent: string): Promise<BlipPack> {
    const prompt = this.buildPrompt(title, noteContent);

    const res = await requestUrl({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.settings.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.settings.openaiModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    const raw = res.json?.choices?.[0]?.message?.content ?? '{}';
    return this.parsePackFromText(raw);
  }

  private parsePackFromText(rawText: string): BlipPack {
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
      nextSteps:
        parsed.nextSteps?.filter(Boolean).slice(0, 3) || [
          'Take one small concrete step and note the result.'
        ],
      reminder: parsed.reminder?.trim() || 'Small execution beats perfect planning.'
    };
  }

  private generateFallback(title: string, noteContent: string): BlipPack {
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

    if (text.includes('protein') || text.includes('soya') || text.includes('diet') || text.includes('food')) {
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

  private resolveLocalCliBinary(kind: LocalCli, configuredPath: string): string {
    const req = this.nodeRequire();
    const fs = req('fs') as typeof import('fs');
    const path = req('path') as typeof import('path');

    const candidates = [
      configuredPath,
      kind,
      path.join('/Users/parashuram/.npm-global/bin', kind),
      path.join('/Users/parashuram/.local/bin', kind),
      path.join(process.env.HOME || '', '.npm-global/bin', kind),
      path.join(process.env.HOME || '', '.local/bin', kind),
      `/opt/homebrew/bin/${kind}`,
      `/usr/local/bin/${kind}`,
      `/usr/bin/${kind}`
    ].filter(Boolean);

    for (const c of candidates) {
      if (!c) continue;
      if (c === kind) return c;
      if (fs.existsSync(c)) return c;
    }

    throw new Error(
      `${kind} binary not found (ENOENT). Set Blip Resurfacer ${kind === 'codex' ? 'Codex' : 'Claude'} path in settings.`
    );
  }

  private resolveNodeBinary(configuredPath: string): string {
    const req = this.nodeRequire();
    const fs = req('fs') as typeof import('fs');
    const candidates = [configuredPath, '/opt/homebrew/bin/node', '/usr/local/bin/node', 'node'];

    for (const c of candidates) {
      if (!c) continue;
      if (c === 'node') return c;
      if (fs.existsSync(c)) return c;
    }

    throw new Error('node binary not found. Set Node path in Blip Resurfacer settings.');
  }

  private async runCommand(
    command: string,
    args: string[],
    stdinText?: string,
    cwd?: string
  ): Promise<string> {
    const req = this.nodeRequire();
    const cp = req('child_process') as typeof import('child_process');

    return await new Promise((resolve, reject) => {
      const child = cp.spawn(command, args, {
        cwd,
        shell: false,
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
      child.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err?.code === 'ENOENT') {
          reject(new Error(`${command} not found (ENOENT). Check CLI path in plugin settings.`));
          return;
        }
        reject(err);
      });
      child.on('close', (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
      });

      if (stdinText && child.stdin) {
        child.stdin.write(stdinText);
      }
      child.stdin?.end();
    });
  }

  private nodeRequire() {
    const req = (window as unknown as { require?: NodeRequire }).require;
    if (!req) {
      throw new Error('Node require() unavailable. Local CLI mode needs desktop Obsidian.');
    }
    return req;
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}

class BlipResurfacerSettingTab extends PluginSettingTab {
  plugin: BlipResurfacerPlugin;

  constructor(app: App, plugin: BlipResurfacerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Blip Resurfacer' });

    new Setting(containerEl)
      .setName('Max daily resurfaced blips')
      .setDesc('How many blips to update in one run')
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.maxDailyResurface))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n > 0) {
              this.plugin.settings.maxDailyResurface = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Review interval days')
      .setDesc('How many days until next resurfacing recommendation')
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.reviewIntervalDays))
          .onChange(async (value) => {
            const n = Number(value);
            if (!Number.isNaN(n) && n > 0) {
              this.plugin.settings.reviewIntervalDays = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('AI provider')
      .setDesc('Use local Codex/Claude CLI by default (no API key needed).')
      .addDropdown((dd) =>
        dd
          .addOption('local-cli', 'Local CLI (Codex/Claude)')
          .addOption('openai', 'OpenAI API')
          .addOption('fallback', 'Fallback only (rules)')
          .setValue(this.plugin.settings.aiProvider)
          .onChange(async (value: AiProvider) => {
            this.plugin.settings.aiProvider = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.aiProvider === 'local-cli') {
      new Setting(containerEl)
        .setName('Local CLI')
        .setDesc('Select which installed CLI to use')
        .addDropdown((dd) =>
          dd
            .addOption('codex', 'Codex')
            .addOption('claude', 'Claude')
            .setValue(this.plugin.settings.localCli)
            .onChange(async (value: LocalCli) => {
              this.plugin.settings.localCli = value;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      new Setting(containerEl)
        .setName('Strict local AI mode')
        .setDesc('If local CLI fails, stop run instead of silently using generic fallback')
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.strictLocalAi)
            .onChange(async (value) => {
              this.plugin.settings.strictLocalAi = value;
              await this.plugin.saveSettings();
            })
        );

      if (this.plugin.settings.localCli === 'codex') {
        new Setting(containerEl)
          .setName('Codex binary path')
          .setDesc('Absolute path preferred (fixes ENOENT on some Obsidian PATH setups)')
          .addText((text) =>
            text
              .setPlaceholder('/Users/you/.npm-global/bin/codex')
              .setValue(this.plugin.settings.codexPath)
              .onChange(async (value) => {
                this.plugin.settings.codexPath = value.trim();
                await this.plugin.saveSettings();
              })
          );

        new Setting(containerEl)
          .setName('Node binary path (for Codex)')
          .setDesc('Used to run Codex JS entrypoint when env PATH is missing node')
          .addText((text) =>
            text
              .setPlaceholder('/opt/homebrew/bin/node')
              .setValue(this.plugin.settings.nodePath)
              .onChange(async (value) => {
                this.plugin.settings.nodePath = value.trim();
                await this.plugin.saveSettings();
              })
          );

        new Setting(containerEl)
          .setName('Codex model (optional)')
          .addText((text) =>
            text
              .setPlaceholder('e.g. gpt-5-codex')
              .setValue(this.plugin.settings.codexModel)
              .onChange(async (value) => {
                this.plugin.settings.codexModel = value.trim();
                await this.plugin.saveSettings();
              })
          );
      } else {
        new Setting(containerEl)
          .setName('Claude binary path')
          .setDesc('Absolute path preferred (fixes ENOENT on some Obsidian PATH setups)')
          .addText((text) =>
            text
              .setPlaceholder('/Users/you/.local/bin/claude')
              .setValue(this.plugin.settings.claudePath)
              .onChange(async (value) => {
                this.plugin.settings.claudePath = value.trim();
                await this.plugin.saveSettings();
              })
          );

        new Setting(containerEl)
          .setName('Claude model (optional)')
          .addText((text) =>
            text
              .setPlaceholder('e.g. sonnet')
              .setValue(this.plugin.settings.claudeModel)
              .onChange(async (value) => {
                this.plugin.settings.claudeModel = value.trim();
                await this.plugin.saveSettings();
              })
          );
      }
    }

    if (this.plugin.settings.aiProvider === 'openai') {
      new Setting(containerEl)
        .setName('OpenAI API key')
        .addText((text) =>
          text
            .setPlaceholder('sk-...')
            .setValue(this.plugin.settings.openaiApiKey)
            .onChange(async (value) => {
              this.plugin.settings.openaiApiKey = value.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('OpenAI model')
        .addText((text) =>
          text
            .setValue(this.plugin.settings.openaiModel)
            .onChange(async (value) => {
              this.plugin.settings.openaiModel = value.trim() || 'gpt-4o-mini';
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName('User context')
      .setDesc('Used to tailor next quality steps')
      .addTextArea((text) =>
        text
          .setValue(this.plugin.settings.userContext)
          .onChange(async (value) => {
            this.plugin.settings.userContext = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Run now')
      .setDesc('Manually resurface blips and update notes in-place')
      .addButton((btn) =>
        btn.setButtonText('Resurface now').onClick(async () => {
          const count = await this.plugin.resurfaceNow();
          new Notice(`Blip Resurfacer: updated ${count} blip(s)`);
        })
      );
  }
}
