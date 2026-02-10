"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BlipResurfacerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  maxDailyResurface: 2,
  reviewIntervalDays: 2,
  aiProvider: "local-cli",
  localCli: "codex",
  strictLocalAi: true,
  codexModel: "gpt-5-codex",
  claudeModel: "sonnet",
  codexPath: "/Users/parashuram/.npm-global/bin/codex",
  claudePath: "/Users/parashuram/.local/bin/claude",
  nodePath: "/opt/homebrew/bin/node",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  userContext: "User is an experienced backend engineer. Prefer concrete, small next steps and practical mini-POCs."
};
var BlipResurfacerPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "resurface-blips-now",
      name: "Resurface blips now",
      callback: async () => {
        const count = await this.resurfaceNow();
        new import_obsidian.Notice(`Blip Resurfacer: updated ${count} blip(s)`);
      }
    });
    this.addCommand({
      id: "test-local-ai-backend",
      name: "Test local AI backend (Codex/Claude)",
      callback: async () => {
        try {
          const pack = await this.generateViaLocalCli(
            "Backend connectivity test",
            "Create one insight and two practical steps about learning Kafka over TCP."
          );
          new import_obsidian.Notice(`Local AI OK (${this.settings.localCli}). Insight: ${pack.insight.slice(0, 80)}...`);
        } catch (e) {
          new import_obsidian.Notice(`Local AI failed (${this.settings.localCli}): ${String(e?.message || e).slice(0, 140)}`);
        }
      }
    });
    this.addSettingTab(new BlipResurfacerSettingTab(this.app, this));
  }
  async loadSettings() {
    const loaded = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (typeof loaded.aiEnabled === "boolean") {
      if (!loaded.aiEnabled) loaded.aiProvider = "fallback";
      else if (loaded.aiProvider === "fallback") loaded.aiProvider = "local-cli";
    }
    if (!loaded.codexModel?.trim() || loaded.codexModel.includes("gpt-5.3-codex")) {
      loaded.codexModel = "gpt-5-codex";
    }
    if (!loaded.claudeModel?.trim()) {
      loaded.claudeModel = "sonnet";
    }
    if (!loaded.codexPath?.trim()) {
      loaded.codexPath = "/Users/parashuram/.npm-global/bin/codex";
    }
    if (!loaded.claudePath?.trim()) {
      loaded.claudePath = "/Users/parashuram/.local/bin/claude";
    }
    if (!loaded.nodePath?.trim()) {
      loaded.nodePath = "/opt/homebrew/bin/node";
    }
    this.settings = loaded;
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async resurfaceNow() {
    const blips = await this.getBlipFiles();
    if (!blips.length) {
      new import_obsidian.Notice("No notes with type: blip found.");
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
  async getBlipFiles() {
    const all = this.app.vault.getMarkdownFiles();
    const withMeta = [];
    for (const file of all) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (!fm || String(fm.type ?? "").toLowerCase() !== "blip") continue;
      const reviewedRaw = String(fm.blip_last_reviewed ?? "");
      const reviewedTs = reviewedRaw ? Date.parse(reviewedRaw) : 0;
      withMeta.push({ file, reviewedAt: Number.isNaN(reviewedTs) ? 0 : reviewedTs });
    }
    return withMeta.sort((a, b) => {
      if (a.reviewedAt !== b.reviewedAt) return a.reviewedAt - b.reviewedAt;
      return a.file.stat.mtime - b.file.stat.mtime;
    }).map((x) => x.file);
  }
  async updateBlipFrontmatter(file) {
    const today = this.formatDate(/* @__PURE__ */ new Date());
    const next = /* @__PURE__ */ new Date();
    next.setDate(next.getDate() + this.settings.reviewIntervalDays);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.type = "blip";
      fm.blip_status = fm.blip_status ?? "awareness";
      fm.blip_created = fm.blip_created ?? today;
      fm.blip_last_reviewed = today;
      fm.blip_next_review = this.formatDate(next);
      fm.blip_resurface_count = Number(fm.blip_resurface_count ?? 0) + 1;
    });
  }
  async appendBlipUpdate(file, pack) {
    const dateStr = this.formatDate(/* @__PURE__ */ new Date());
    const sectionHeader = "## Blip updates (Clawd)";
    const entry = [
      `### ${dateStr}`,
      `- Generated by: ${this.settings.aiProvider === "local-cli" ? this.settings.localCli : this.settings.aiProvider}`,
      `- Insight: ${pack.insight}`,
      `- Next quality steps:`,
      ...pack.nextSteps.map((s) => `  - ${s}`),
      `- Reminder: ${pack.reminder}`,
      ""
    ].join("\n");
    const content = await this.app.vault.read(file);
    if (content.includes(sectionHeader)) {
      await this.app.vault.modify(file, `${content.trimEnd()}

${entry}`);
      return;
    }
    const updated = `${content.trimEnd()}

${sectionHeader}

${entry}`;
    await this.app.vault.modify(file, updated);
  }
  async generateBlipPack(title, noteContent) {
    if (this.settings.aiProvider === "local-cli") {
      try {
        return await this.generateViaLocalCli(title, noteContent);
      } catch (e) {
        const msg = String(e?.message || e);
        console.error("Blip Resurfacer local CLI failed", e);
        new import_obsidian.Notice(`Blip Resurfacer: local ${this.settings.localCli} failed (${msg.slice(0, 120)})`);
        if (this.settings.strictLocalAi) {
          throw e;
        }
      }
    }
    if (this.settings.aiProvider === "openai" && this.settings.openaiApiKey.trim()) {
      try {
        return await this.generateViaOpenAI(title, noteContent);
      } catch (e) {
        console.error("Blip Resurfacer OpenAI failed, using fallback", e);
      }
    }
    return this.generateFallback(title, noteContent);
  }
  buildPrompt(title, noteContent) {
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
  async generateViaLocalCli(title, noteContent) {
    const prompt = this.buildPrompt(title, noteContent);
    const vaultPath = this.app.vault.adapter.getBasePath();
    let stdout = "";
    if (this.settings.localCli === "codex") {
      const req = this.nodeRequire();
      const fs = req("fs");
      const os = req("os");
      const path = req("path");
      const codexBin = this.resolveLocalCliBinary("codex", this.settings.codexPath);
      const outPath = path.join(os.tmpdir(), `blip-resurfacer-${Date.now()}.json`);
      const schemaPath = path.join(os.tmpdir(), `blip-resurfacer-schema-${Date.now()}.json`);
      fs.writeFileSync(
        schemaPath,
        JSON.stringify({
          type: "object",
          additionalProperties: false,
          required: ["insight", "nextSteps", "reminder"],
          properties: {
            insight: { type: "string" },
            nextSteps: { type: "array", minItems: 2, maxItems: 3, items: { type: "string" } },
            reminder: { type: "string" }
          }
        })
      );
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--output-schema",
        schemaPath,
        "-C",
        vaultPath,
        "--output-last-message",
        outPath,
        "-"
      ];
      if (this.settings.codexModel.trim()) {
        args.splice(1, 0, "--model", this.settings.codexModel.trim());
      }
      const nodeBin = this.resolveNodeBinary(this.settings.nodePath);
      await this.runCommand(nodeBin, [codexBin, ...args], prompt, vaultPath);
      stdout = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      if (fs.existsSync(schemaPath)) fs.unlinkSync(schemaPath);
    } else {
      const claudeBin = this.resolveLocalCliBinary("claude", this.settings.claudePath);
      const args = ["-p", "--output-format", "text"];
      if (this.settings.claudeModel.trim()) {
        args.push("--model", this.settings.claudeModel.trim());
      }
      args.push(prompt);
      stdout = await this.runCommand(claudeBin, args, void 0, vaultPath);
    }
    return this.parsePackFromText(stdout);
  }
  async generateViaOpenAI(title, noteContent) {
    const prompt = this.buildPrompt(title, noteContent);
    const res = await (0, import_obsidian.requestUrl)({
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.settings.openaiModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });
    const raw = res.json?.choices?.[0]?.message?.content ?? "{}";
    return this.parsePackFromText(raw);
  }
  parsePackFromText(rawText) {
    const raw = rawText?.trim() || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first >= 0 && last > first) {
        try {
          parsed = JSON.parse(raw.slice(first, last + 1));
        } catch {
          parsed = {};
        }
      }
    }
    return {
      insight: parsed.insight?.trim() || "Refine this blip into a concrete next action.",
      nextSteps: parsed.nextSteps?.filter(Boolean).slice(0, 3) || [
        "Take one small concrete step and note the result."
      ],
      reminder: parsed.reminder?.trim() || "Small execution beats perfect planning."
    };
  }
  generateFallback(title, noteContent) {
    const text = `${title}
${noteContent}`.toLowerCase();
    if (text.includes("kafka") || text.includes("tcp") || text.includes("queue")) {
      return {
        insight: "This blip has strong implementation value; convert it into one tiny experiment before reading more.",
        nextSteps: [
          "Read one practical article on Kafka over TCP internals (15\u201320 min cap).",
          "Build a mini PoC: single producer + consumer with one observable metric (latency or retries).",
          "Write 5 bullet learnings in this same note and link to one related system-design note."
        ],
        reminder: "Ship one artifact, not just one reading."
      };
    }
    if (text.includes("protein") || text.includes("soya") || text.includes("diet") || text.includes("food")) {
      return {
        insight: "This is a behavior-change blip; the fastest clarity comes from a 7-day measured trial.",
        nextSteps: [
          "Pick one daily soya/protein plan and run it for 7 days.",
          "Track satiety, digestion, and energy in one line per day in this note.",
          "At day 7, keep/adjust/drop based on evidence, not mood."
        ],
        reminder: "One controlled experiment beats endless nutrition browsing."
      };
    }
    return {
      insight: "Narrow this into a concrete next action to preserve momentum.",
      nextSteps: [
        "Define the smallest testable action (<=25 min).",
        "Do it once this week and capture outcome in this note.",
        "Add one link to a related note for context continuity."
      ],
      reminder: "Prefer completion artifacts over more inputs."
    };
  }
  resolveLocalCliBinary(kind, configuredPath) {
    const req = this.nodeRequire();
    const fs = req("fs");
    const path = req("path");
    const candidates = [
      configuredPath,
      kind,
      path.join("/Users/parashuram/.npm-global/bin", kind),
      path.join("/Users/parashuram/.local/bin", kind),
      path.join(process.env.HOME || "", ".npm-global/bin", kind),
      path.join(process.env.HOME || "", ".local/bin", kind),
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
      `${kind} binary not found (ENOENT). Set Blip Resurfacer ${kind === "codex" ? "Codex" : "Claude"} path in settings.`
    );
  }
  resolveNodeBinary(configuredPath) {
    const req = this.nodeRequire();
    const fs = req("fs");
    const candidates = [configuredPath, "/opt/homebrew/bin/node", "/usr/local/bin/node", "node"];
    for (const c of candidates) {
      if (!c) continue;
      if (c === "node") return c;
      if (fs.existsSync(c)) return c;
    }
    throw new Error("node binary not found. Set Node path in Blip Resurfacer settings.");
  }
  async runCommand(command, args, stdinText, cwd) {
    const req = this.nodeRequire();
    const cp = req("child_process");
    return await new Promise((resolve, reject) => {
      const child = cp.spawn(command, args, {
        cwd,
        shell: false,
        env: process.env
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => stdout += d.toString("utf8"));
      child.stderr?.on("data", (d) => stderr += d.toString("utf8"));
      child.on("error", (err) => {
        if (err?.code === "ENOENT") {
          reject(new Error(`${command} not found (ENOENT). Check CLI path in plugin settings.`));
          return;
        }
        reject(err);
      });
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
      });
      if (stdinText && child.stdin) {
        child.stdin.write(stdinText);
      }
      child.stdin?.end();
    });
  }
  nodeRequire() {
    const req = window.require;
    if (!req) {
      throw new Error("Node require() unavailable. Local CLI mode needs desktop Obsidian.");
    }
    return req;
  }
  formatDate(d) {
    return d.toISOString().slice(0, 10);
  }
};
var BlipResurfacerSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Blip Resurfacer" });
    new import_obsidian.Setting(containerEl).setName("Max daily resurfaced blips").setDesc("How many blips to update in one run").addText(
      (text) => text.setValue(String(this.plugin.settings.maxDailyResurface)).onChange(async (value) => {
        const n = Number(value);
        if (!Number.isNaN(n) && n > 0) {
          this.plugin.settings.maxDailyResurface = n;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("Review interval days").setDesc("How many days until next resurfacing recommendation").addText(
      (text) => text.setValue(String(this.plugin.settings.reviewIntervalDays)).onChange(async (value) => {
        const n = Number(value);
        if (!Number.isNaN(n) && n > 0) {
          this.plugin.settings.reviewIntervalDays = n;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("AI provider").setDesc("Use local Codex/Claude CLI by default (no API key needed).").addDropdown(
      (dd) => dd.addOption("local-cli", "Local CLI (Codex/Claude)").addOption("openai", "OpenAI API").addOption("fallback", "Fallback only (rules)").setValue(this.plugin.settings.aiProvider).onChange(async (value) => {
        this.plugin.settings.aiProvider = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.aiProvider === "local-cli") {
      new import_obsidian.Setting(containerEl).setName("Local CLI").setDesc("Select which installed CLI to use").addDropdown(
        (dd) => dd.addOption("codex", "Codex").addOption("claude", "Claude").setValue(this.plugin.settings.localCli).onChange(async (value) => {
          this.plugin.settings.localCli = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );
      new import_obsidian.Setting(containerEl).setName("Strict local AI mode").setDesc("If local CLI fails, stop run instead of silently using generic fallback").addToggle(
        (toggle) => toggle.setValue(this.plugin.settings.strictLocalAi).onChange(async (value) => {
          this.plugin.settings.strictLocalAi = value;
          await this.plugin.saveSettings();
        })
      );
      if (this.plugin.settings.localCli === "codex") {
        new import_obsidian.Setting(containerEl).setName("Codex binary path").setDesc("Absolute path preferred (fixes ENOENT on some Obsidian PATH setups)").addText(
          (text) => text.setPlaceholder("/Users/you/.npm-global/bin/codex").setValue(this.plugin.settings.codexPath).onChange(async (value) => {
            this.plugin.settings.codexPath = value.trim();
            await this.plugin.saveSettings();
          })
        );
        new import_obsidian.Setting(containerEl).setName("Node binary path (for Codex)").setDesc("Used to run Codex JS entrypoint when env PATH is missing node").addText(
          (text) => text.setPlaceholder("/opt/homebrew/bin/node").setValue(this.plugin.settings.nodePath).onChange(async (value) => {
            this.plugin.settings.nodePath = value.trim();
            await this.plugin.saveSettings();
          })
        );
        new import_obsidian.Setting(containerEl).setName("Codex model (optional)").addText(
          (text) => text.setPlaceholder("e.g. gpt-5-codex").setValue(this.plugin.settings.codexModel).onChange(async (value) => {
            this.plugin.settings.codexModel = value.trim();
            await this.plugin.saveSettings();
          })
        );
      } else {
        new import_obsidian.Setting(containerEl).setName("Claude binary path").setDesc("Absolute path preferred (fixes ENOENT on some Obsidian PATH setups)").addText(
          (text) => text.setPlaceholder("/Users/you/.local/bin/claude").setValue(this.plugin.settings.claudePath).onChange(async (value) => {
            this.plugin.settings.claudePath = value.trim();
            await this.plugin.saveSettings();
          })
        );
        new import_obsidian.Setting(containerEl).setName("Claude model (optional)").addText(
          (text) => text.setPlaceholder("e.g. sonnet").setValue(this.plugin.settings.claudeModel).onChange(async (value) => {
            this.plugin.settings.claudeModel = value.trim();
            await this.plugin.saveSettings();
          })
        );
      }
    }
    if (this.plugin.settings.aiProvider === "openai") {
      new import_obsidian.Setting(containerEl).setName("OpenAI API key").addText(
        (text) => text.setPlaceholder("sk-...").setValue(this.plugin.settings.openaiApiKey).onChange(async (value) => {
          this.plugin.settings.openaiApiKey = value.trim();
          await this.plugin.saveSettings();
        })
      );
      new import_obsidian.Setting(containerEl).setName("OpenAI model").addText(
        (text) => text.setValue(this.plugin.settings.openaiModel).onChange(async (value) => {
          this.plugin.settings.openaiModel = value.trim() || "gpt-4o-mini";
          await this.plugin.saveSettings();
        })
      );
    }
    new import_obsidian.Setting(containerEl).setName("User context").setDesc("Used to tailor next quality steps").addTextArea(
      (text) => text.setValue(this.plugin.settings.userContext).onChange(async (value) => {
        this.plugin.settings.userContext = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Run now").setDesc("Manually resurface blips and update notes in-place").addButton(
      (btn) => btn.setButtonText("Resurface now").onClick(async () => {
        const count = await this.plugin.resurfaceNow();
        new import_obsidian.Notice(`Blip Resurfacer: updated ${count} blip(s)`);
      })
    );
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHtcbiAgQXBwLFxuICBOb3RpY2UsXG4gIFBsdWdpbixcbiAgUGx1Z2luU2V0dGluZ1RhYixcbiAgU2V0dGluZyxcbiAgVEZpbGUsXG4gIHJlcXVlc3RVcmxcbn0gZnJvbSAnb2JzaWRpYW4nO1xuXG50eXBlIEJsaXBQYWNrID0ge1xuICBpbnNpZ2h0OiBzdHJpbmc7XG4gIG5leHRTdGVwczogc3RyaW5nW107XG4gIHJlbWluZGVyOiBzdHJpbmc7XG59O1xuXG50eXBlIEFpUHJvdmlkZXIgPSAnbG9jYWwtY2xpJyB8ICdvcGVuYWknIHwgJ2ZhbGxiYWNrJztcbnR5cGUgTG9jYWxDbGkgPSAnY29kZXgnIHwgJ2NsYXVkZSc7XG5cbmludGVyZmFjZSBCbGlwUmVzdXJmYWNlclNldHRpbmdzIHtcbiAgbWF4RGFpbHlSZXN1cmZhY2U6IG51bWJlcjtcbiAgcmV2aWV3SW50ZXJ2YWxEYXlzOiBudW1iZXI7XG4gIGFpUHJvdmlkZXI6IEFpUHJvdmlkZXI7XG4gIGxvY2FsQ2xpOiBMb2NhbENsaTtcbiAgc3RyaWN0TG9jYWxBaTogYm9vbGVhbjtcbiAgY29kZXhNb2RlbDogc3RyaW5nO1xuICBjbGF1ZGVNb2RlbDogc3RyaW5nO1xuICBjb2RleFBhdGg6IHN0cmluZztcbiAgY2xhdWRlUGF0aDogc3RyaW5nO1xuICBub2RlUGF0aDogc3RyaW5nO1xuICBvcGVuYWlBcGlLZXk6IHN0cmluZztcbiAgb3BlbmFpTW9kZWw6IHN0cmluZztcbiAgdXNlckNvbnRleHQ6IHN0cmluZztcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogQmxpcFJlc3VyZmFjZXJTZXR0aW5ncyA9IHtcbiAgbWF4RGFpbHlSZXN1cmZhY2U6IDIsXG4gIHJldmlld0ludGVydmFsRGF5czogMixcbiAgYWlQcm92aWRlcjogJ2xvY2FsLWNsaScsXG4gIGxvY2FsQ2xpOiAnY29kZXgnLFxuICBzdHJpY3RMb2NhbEFpOiB0cnVlLFxuICBjb2RleE1vZGVsOiAnZ3B0LTUtY29kZXgnLFxuICBjbGF1ZGVNb2RlbDogJ3Nvbm5ldCcsXG4gIGNvZGV4UGF0aDogJy9Vc2Vycy9wYXJhc2h1cmFtLy5ucG0tZ2xvYmFsL2Jpbi9jb2RleCcsXG4gIGNsYXVkZVBhdGg6ICcvVXNlcnMvcGFyYXNodXJhbS8ubG9jYWwvYmluL2NsYXVkZScsXG4gIG5vZGVQYXRoOiAnL29wdC9ob21lYnJldy9iaW4vbm9kZScsXG4gIG9wZW5haUFwaUtleTogJycsXG4gIG9wZW5haU1vZGVsOiAnZ3B0LTRvLW1pbmknLFxuICB1c2VyQ29udGV4dDpcbiAgICAnVXNlciBpcyBhbiBleHBlcmllbmNlZCBiYWNrZW5kIGVuZ2luZWVyLiBQcmVmZXIgY29uY3JldGUsIHNtYWxsIG5leHQgc3RlcHMgYW5kIHByYWN0aWNhbCBtaW5pLVBPQ3MuJ1xufTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQmxpcFJlc3VyZmFjZXJQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogQmxpcFJlc3VyZmFjZXJTZXR0aW5ncyA9IERFRkFVTFRfU0VUVElOR1M7XG5cbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6ICdyZXN1cmZhY2UtYmxpcHMtbm93JyxcbiAgICAgIG5hbWU6ICdSZXN1cmZhY2UgYmxpcHMgbm93JyxcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IGNvdW50ID0gYXdhaXQgdGhpcy5yZXN1cmZhY2VOb3coKTtcbiAgICAgICAgbmV3IE5vdGljZShgQmxpcCBSZXN1cmZhY2VyOiB1cGRhdGVkICR7Y291bnR9IGJsaXAocylgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogJ3Rlc3QtbG9jYWwtYWktYmFja2VuZCcsXG4gICAgICBuYW1lOiAnVGVzdCBsb2NhbCBBSSBiYWNrZW5kIChDb2RleC9DbGF1ZGUpJyxcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcGFjayA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVWaWFMb2NhbENsaShcbiAgICAgICAgICAgICdCYWNrZW5kIGNvbm5lY3Rpdml0eSB0ZXN0JyxcbiAgICAgICAgICAgICdDcmVhdGUgb25lIGluc2lnaHQgYW5kIHR3byBwcmFjdGljYWwgc3RlcHMgYWJvdXQgbGVhcm5pbmcgS2Fma2Egb3ZlciBUQ1AuJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgbmV3IE5vdGljZShgTG9jYWwgQUkgT0sgKCR7dGhpcy5zZXR0aW5ncy5sb2NhbENsaX0pLiBJbnNpZ2h0OiAke3BhY2suaW5zaWdodC5zbGljZSgwLCA4MCl9Li4uYCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBuZXcgTm90aWNlKGBMb2NhbCBBSSBmYWlsZWQgKCR7dGhpcy5zZXR0aW5ncy5sb2NhbENsaX0pOiAke1N0cmluZygoZSBhcyBFcnJvcik/Lm1lc3NhZ2UgfHwgZSkuc2xpY2UoMCwgMTQwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBCbGlwUmVzdXJmYWNlclNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICBjb25zdCBsb2FkZWQgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpIGFzIEJsaXBSZXN1cmZhY2VyU2V0dGluZ3MgJiB7XG4gICAgICBhaUVuYWJsZWQ/OiBib29sZWFuO1xuICAgIH07XG5cbiAgICAvLyBMZWdhY3kgbWlncmF0aW9uIGZyb20gdjAuMS4wIGtleXNcbiAgICBpZiAodHlwZW9mIGxvYWRlZC5haUVuYWJsZWQgPT09ICdib29sZWFuJykge1xuICAgICAgaWYgKCFsb2FkZWQuYWlFbmFibGVkKSBsb2FkZWQuYWlQcm92aWRlciA9ICdmYWxsYmFjayc7XG4gICAgICBlbHNlIGlmIChsb2FkZWQuYWlQcm92aWRlciA9PT0gJ2ZhbGxiYWNrJykgbG9hZGVkLmFpUHJvdmlkZXIgPSAnbG9jYWwtY2xpJztcbiAgICB9XG5cbiAgICAvLyBOb3JtYWxpemUga25vd24tYmFkIGxvY2FsIG1vZGVsIG5hbWVzXG4gICAgaWYgKCFsb2FkZWQuY29kZXhNb2RlbD8udHJpbSgpIHx8IGxvYWRlZC5jb2RleE1vZGVsLmluY2x1ZGVzKCdncHQtNS4zLWNvZGV4JykpIHtcbiAgICAgIGxvYWRlZC5jb2RleE1vZGVsID0gJ2dwdC01LWNvZGV4JztcbiAgICB9XG4gICAgaWYgKCFsb2FkZWQuY2xhdWRlTW9kZWw/LnRyaW0oKSkge1xuICAgICAgbG9hZGVkLmNsYXVkZU1vZGVsID0gJ3Nvbm5ldCc7XG4gICAgfVxuICAgIGlmICghbG9hZGVkLmNvZGV4UGF0aD8udHJpbSgpKSB7XG4gICAgICBsb2FkZWQuY29kZXhQYXRoID0gJy9Vc2Vycy9wYXJhc2h1cmFtLy5ucG0tZ2xvYmFsL2Jpbi9jb2RleCc7XG4gICAgfVxuICAgIGlmICghbG9hZGVkLmNsYXVkZVBhdGg/LnRyaW0oKSkge1xuICAgICAgbG9hZGVkLmNsYXVkZVBhdGggPSAnL1VzZXJzL3BhcmFzaHVyYW0vLmxvY2FsL2Jpbi9jbGF1ZGUnO1xuICAgIH1cbiAgICBpZiAoIWxvYWRlZC5ub2RlUGF0aD8udHJpbSgpKSB7XG4gICAgICBsb2FkZWQubm9kZVBhdGggPSAnL29wdC9ob21lYnJldy9iaW4vbm9kZSc7XG4gICAgfVxuXG4gICAgdGhpcy5zZXR0aW5ncyA9IGxvYWRlZDtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xuICB9XG5cbiAgYXN5bmMgcmVzdXJmYWNlTm93KCk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgY29uc3QgYmxpcHMgPSBhd2FpdCB0aGlzLmdldEJsaXBGaWxlcygpO1xuICAgIGlmICghYmxpcHMubGVuZ3RoKSB7XG4gICAgICBuZXcgTm90aWNlKCdObyBub3RlcyB3aXRoIHR5cGU6IGJsaXAgZm91bmQuJyk7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBjb25zdCBzZWxlY3RlZCA9IGJsaXBzLnNsaWNlKDAsIE1hdGgubWF4KDEsIHRoaXMuc2V0dGluZ3MubWF4RGFpbHlSZXN1cmZhY2UpKTtcblxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBzZWxlY3RlZCkge1xuICAgICAgY29uc3QgdGV4dCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICBjb25zdCBwYWNrID0gYXdhaXQgdGhpcy5nZW5lcmF0ZUJsaXBQYWNrKGZpbGUuYmFzZW5hbWUsIHRleHQpO1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVCbGlwRnJvbnRtYXR0ZXIoZmlsZSk7XG4gICAgICBhd2FpdCB0aGlzLmFwcGVuZEJsaXBVcGRhdGUoZmlsZSwgcGFjayk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGVjdGVkLmxlbmd0aDtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2V0QmxpcEZpbGVzKCk6IFByb21pc2U8VEZpbGVbXT4ge1xuICAgIGNvbnN0IGFsbCA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTtcbiAgICBjb25zdCB3aXRoTWV0YTogQXJyYXk8eyBmaWxlOiBURmlsZTsgcmV2aWV3ZWRBdDogbnVtYmVyIH0+ID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgYWxsKSB7XG4gICAgICBjb25zdCBjYWNoZSA9IHRoaXMuYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpO1xuICAgICAgY29uc3QgZm0gPSBjYWNoZT8uZnJvbnRtYXR0ZXIgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG4gICAgICBpZiAoIWZtIHx8IFN0cmluZyhmbS50eXBlID8/ICcnKS50b0xvd2VyQ2FzZSgpICE9PSAnYmxpcCcpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCByZXZpZXdlZFJhdyA9IFN0cmluZyhmbS5ibGlwX2xhc3RfcmV2aWV3ZWQgPz8gJycpO1xuICAgICAgY29uc3QgcmV2aWV3ZWRUcyA9IHJldmlld2VkUmF3ID8gRGF0ZS5wYXJzZShyZXZpZXdlZFJhdykgOiAwO1xuICAgICAgd2l0aE1ldGEucHVzaCh7IGZpbGUsIHJldmlld2VkQXQ6IE51bWJlci5pc05hTihyZXZpZXdlZFRzKSA/IDAgOiByZXZpZXdlZFRzIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB3aXRoTWV0YVxuICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgaWYgKGEucmV2aWV3ZWRBdCAhPT0gYi5yZXZpZXdlZEF0KSByZXR1cm4gYS5yZXZpZXdlZEF0IC0gYi5yZXZpZXdlZEF0O1xuICAgICAgICByZXR1cm4gYS5maWxlLnN0YXQubXRpbWUgLSBiLmZpbGUuc3RhdC5tdGltZTtcbiAgICAgIH0pXG4gICAgICAubWFwKCh4KSA9PiB4LmZpbGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGVCbGlwRnJvbnRtYXR0ZXIoZmlsZTogVEZpbGUpIHtcbiAgICBjb25zdCB0b2RheSA9IHRoaXMuZm9ybWF0RGF0ZShuZXcgRGF0ZSgpKTtcbiAgICBjb25zdCBuZXh0ID0gbmV3IERhdGUoKTtcbiAgICBuZXh0LnNldERhdGUobmV4dC5nZXREYXRlKCkgKyB0aGlzLnNldHRpbmdzLnJldmlld0ludGVydmFsRGF5cyk7XG5cbiAgICBhd2FpdCB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgKGZtOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICAgICAgZm0udHlwZSA9ICdibGlwJztcbiAgICAgIGZtLmJsaXBfc3RhdHVzID0gZm0uYmxpcF9zdGF0dXMgPz8gJ2F3YXJlbmVzcyc7XG4gICAgICBmbS5ibGlwX2NyZWF0ZWQgPSBmbS5ibGlwX2NyZWF0ZWQgPz8gdG9kYXk7XG4gICAgICBmbS5ibGlwX2xhc3RfcmV2aWV3ZWQgPSB0b2RheTtcbiAgICAgIGZtLmJsaXBfbmV4dF9yZXZpZXcgPSB0aGlzLmZvcm1hdERhdGUobmV4dCk7XG4gICAgICBmbS5ibGlwX3Jlc3VyZmFjZV9jb3VudCA9IE51bWJlcihmbS5ibGlwX3Jlc3VyZmFjZV9jb3VudCA/PyAwKSArIDE7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGFwcGVuZEJsaXBVcGRhdGUoZmlsZTogVEZpbGUsIHBhY2s6IEJsaXBQYWNrKSB7XG4gICAgY29uc3QgZGF0ZVN0ciA9IHRoaXMuZm9ybWF0RGF0ZShuZXcgRGF0ZSgpKTtcbiAgICBjb25zdCBzZWN0aW9uSGVhZGVyID0gJyMjIEJsaXAgdXBkYXRlcyAoQ2xhd2QpJztcblxuICAgIGNvbnN0IGVudHJ5ID0gW1xuICAgICAgYCMjIyAke2RhdGVTdHJ9YCxcbiAgICAgIGAtIEdlbmVyYXRlZCBieTogJHt0aGlzLnNldHRpbmdzLmFpUHJvdmlkZXIgPT09ICdsb2NhbC1jbGknID8gdGhpcy5zZXR0aW5ncy5sb2NhbENsaSA6IHRoaXMuc2V0dGluZ3MuYWlQcm92aWRlcn1gLFxuICAgICAgYC0gSW5zaWdodDogJHtwYWNrLmluc2lnaHR9YCxcbiAgICAgIGAtIE5leHQgcXVhbGl0eSBzdGVwczpgLFxuICAgICAgLi4ucGFjay5uZXh0U3RlcHMubWFwKChzKSA9PiBgICAtICR7c31gKSxcbiAgICAgIGAtIFJlbWluZGVyOiAke3BhY2sucmVtaW5kZXJ9YCxcbiAgICAgICcnXG4gICAgXS5qb2luKCdcXG4nKTtcblxuICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuXG4gICAgaWYgKGNvbnRlbnQuaW5jbHVkZXMoc2VjdGlvbkhlYWRlcikpIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBgJHtjb250ZW50LnRyaW1FbmQoKX1cXG5cXG4ke2VudHJ5fWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHVwZGF0ZWQgPSBgJHtjb250ZW50LnRyaW1FbmQoKX1cXG5cXG4ke3NlY3Rpb25IZWFkZXJ9XFxuXFxuJHtlbnRyeX1gO1xuICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCB1cGRhdGVkKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVCbGlwUGFjayh0aXRsZTogc3RyaW5nLCBub3RlQ29udGVudDogc3RyaW5nKTogUHJvbWlzZTxCbGlwUGFjaz4ge1xuICAgIGlmICh0aGlzLnNldHRpbmdzLmFpUHJvdmlkZXIgPT09ICdsb2NhbC1jbGknKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5nZW5lcmF0ZVZpYUxvY2FsQ2xpKHRpdGxlLCBub3RlQ29udGVudCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IG1zZyA9IFN0cmluZygoZSBhcyBFcnJvcik/Lm1lc3NhZ2UgfHwgZSk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0JsaXAgUmVzdXJmYWNlciBsb2NhbCBDTEkgZmFpbGVkJywgZSk7XG4gICAgICAgIG5ldyBOb3RpY2UoYEJsaXAgUmVzdXJmYWNlcjogbG9jYWwgJHt0aGlzLnNldHRpbmdzLmxvY2FsQ2xpfSBmYWlsZWQgKCR7bXNnLnNsaWNlKDAsIDEyMCl9KWApO1xuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5zdHJpY3RMb2NhbEFpKSB7XG4gICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLnNldHRpbmdzLmFpUHJvdmlkZXIgPT09ICdvcGVuYWknICYmIHRoaXMuc2V0dGluZ3Mub3BlbmFpQXBpS2V5LnRyaW0oKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2VuZXJhdGVWaWFPcGVuQUkodGl0bGUsIG5vdGVDb250ZW50KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignQmxpcCBSZXN1cmZhY2VyIE9wZW5BSSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrJywgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuZ2VuZXJhdGVGYWxsYmFjayh0aXRsZSwgbm90ZUNvbnRlbnQpO1xuICB9XG5cbiAgcHJpdmF0ZSBidWlsZFByb21wdCh0aXRsZTogc3RyaW5nLCBub3RlQ29udGVudDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYFlvdSBoZWxwIHJlc3VyZmFjZSBwZXJzb25hbCBPYnNpZGlhbiBibGlwcyBpbi1wbGFjZS5cblxuQ29udGV4dDpcbi0gJHt0aGlzLnNldHRpbmdzLnVzZXJDb250ZXh0fVxuLSBLZWVwIG91dHB1dCBwcmFjdGljYWwsIHNtYWxsLCBhbmQgZXhlY3V0aW9uLWZpcnN0LlxuLSBPdXRwdXQgbXVzdCBiZSB2YWxpZCBKU09OIG9ubHkuXG5cbkJsaXAgdGl0bGU6ICR7dGl0bGV9XG5CbGlwIGNvbnRlbnQgZXhjZXJwdDpcbiR7bm90ZUNvbnRlbnQuc2xpY2UoMCwgMzUwMCl9XG5cblJldHVybiBKU09OIGV4YWN0bHkgd2l0aCBrZXlzOlxue1xuICBcImluc2lnaHRcIjogXCJzdHJpbmcgKG1heCAyIGxpbmVzKVwiLFxuICBcIm5leHRTdGVwc1wiOiBbXCIyLTMgY29uY3JldGUgc3RlcHNcIl0sXG4gIFwicmVtaW5kZXJcIjogXCJvbmUgc2hvcnQgcmVtaW5kZXJcIlxufWA7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlVmlhTG9jYWxDbGkodGl0bGU6IHN0cmluZywgbm90ZUNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8QmxpcFBhY2s+IHtcbiAgICBjb25zdCBwcm9tcHQgPSB0aGlzLmJ1aWxkUHJvbXB0KHRpdGxlLCBub3RlQ29udGVudCk7XG4gICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5hcHAudmF1bHQuYWRhcHRlci5nZXRCYXNlUGF0aCgpO1xuXG4gICAgbGV0IHN0ZG91dCA9ICcnO1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubG9jYWxDbGkgPT09ICdjb2RleCcpIHtcbiAgICAgIGNvbnN0IHJlcSA9IHRoaXMubm9kZVJlcXVpcmUoKTtcbiAgICAgIGNvbnN0IGZzID0gcmVxKCdmcycpIGFzIHR5cGVvZiBpbXBvcnQoJ2ZzJyk7XG4gICAgICBjb25zdCBvcyA9IHJlcSgnb3MnKSBhcyB0eXBlb2YgaW1wb3J0KCdvcycpO1xuICAgICAgY29uc3QgcGF0aCA9IHJlcSgncGF0aCcpIGFzIHR5cGVvZiBpbXBvcnQoJ3BhdGgnKTtcbiAgICAgIGNvbnN0IGNvZGV4QmluID0gdGhpcy5yZXNvbHZlTG9jYWxDbGlCaW5hcnkoJ2NvZGV4JywgdGhpcy5zZXR0aW5ncy5jb2RleFBhdGgpO1xuICAgICAgY29uc3Qgb3V0UGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgYGJsaXAtcmVzdXJmYWNlci0ke0RhdGUubm93KCl9Lmpzb25gKTtcbiAgICAgIGNvbnN0IHNjaGVtYVBhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBibGlwLXJlc3VyZmFjZXItc2NoZW1hLSR7RGF0ZS5ub3coKX0uanNvbmApO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhcbiAgICAgICAgc2NoZW1hUGF0aCxcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgICAgICByZXF1aXJlZDogWydpbnNpZ2h0JywgJ25leHRTdGVwcycsICdyZW1pbmRlciddLFxuICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIGluc2lnaHQ6IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgICAgIG5leHRTdGVwczogeyB0eXBlOiAnYXJyYXknLCBtaW5JdGVtczogMiwgbWF4SXRlbXM6IDMsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSxcbiAgICAgICAgICAgIHJlbWluZGVyOiB7IHR5cGU6ICdzdHJpbmcnIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICBjb25zdCBhcmdzID0gW1xuICAgICAgICAnZXhlYycsXG4gICAgICAgICctLXNraXAtZ2l0LXJlcG8tY2hlY2snLFxuICAgICAgICAnLS1vdXRwdXQtc2NoZW1hJyxcbiAgICAgICAgc2NoZW1hUGF0aCxcbiAgICAgICAgJy1DJyxcbiAgICAgICAgdmF1bHRQYXRoLFxuICAgICAgICAnLS1vdXRwdXQtbGFzdC1tZXNzYWdlJyxcbiAgICAgICAgb3V0UGF0aCxcbiAgICAgICAgJy0nXG4gICAgICBdO1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuY29kZXhNb2RlbC50cmltKCkpIHtcbiAgICAgICAgYXJncy5zcGxpY2UoMSwgMCwgJy0tbW9kZWwnLCB0aGlzLnNldHRpbmdzLmNvZGV4TW9kZWwudHJpbSgpKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgbm9kZUJpbiA9IHRoaXMucmVzb2x2ZU5vZGVCaW5hcnkodGhpcy5zZXR0aW5ncy5ub2RlUGF0aCk7XG4gICAgICBhd2FpdCB0aGlzLnJ1bkNvbW1hbmQobm9kZUJpbiwgW2NvZGV4QmluLCAuLi5hcmdzXSwgcHJvbXB0LCB2YXVsdFBhdGgpO1xuICAgICAgc3Rkb3V0ID0gZnMuZXhpc3RzU3luYyhvdXRQYXRoKSA/IGZzLnJlYWRGaWxlU3luYyhvdXRQYXRoLCAndXRmOCcpIDogJyc7XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhvdXRQYXRoKSkgZnMudW5saW5rU3luYyhvdXRQYXRoKTtcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNjaGVtYVBhdGgpKSBmcy51bmxpbmtTeW5jKHNjaGVtYVBhdGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBjbGF1ZGVCaW4gPSB0aGlzLnJlc29sdmVMb2NhbENsaUJpbmFyeSgnY2xhdWRlJywgdGhpcy5zZXR0aW5ncy5jbGF1ZGVQYXRoKTtcbiAgICAgIGNvbnN0IGFyZ3MgPSBbJy1wJywgJy0tb3V0cHV0LWZvcm1hdCcsICd0ZXh0J107XG4gICAgICBpZiAodGhpcy5zZXR0aW5ncy5jbGF1ZGVNb2RlbC50cmltKCkpIHtcbiAgICAgICAgYXJncy5wdXNoKCctLW1vZGVsJywgdGhpcy5zZXR0aW5ncy5jbGF1ZGVNb2RlbC50cmltKCkpO1xuICAgICAgfVxuICAgICAgYXJncy5wdXNoKHByb21wdCk7XG4gICAgICBzdGRvdXQgPSBhd2FpdCB0aGlzLnJ1bkNvbW1hbmQoY2xhdWRlQmluLCBhcmdzLCB1bmRlZmluZWQsIHZhdWx0UGF0aCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMucGFyc2VQYWNrRnJvbVRleHQoc3Rkb3V0KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVWaWFPcGVuQUkodGl0bGU6IHN0cmluZywgbm90ZUNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8QmxpcFBhY2s+IHtcbiAgICBjb25zdCBwcm9tcHQgPSB0aGlzLmJ1aWxkUHJvbXB0KHRpdGxlLCBub3RlQ29udGVudCk7XG5cbiAgICBjb25zdCByZXMgPSBhd2FpdCByZXF1ZXN0VXJsKHtcbiAgICAgIHVybDogJ2h0dHBzOi8vYXBpLm9wZW5haS5jb20vdjEvY2hhdC9jb21wbGV0aW9ucycsXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3RoaXMuc2V0dGluZ3Mub3BlbmFpQXBpS2V5fWAsXG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIG1vZGVsOiB0aGlzLnNldHRpbmdzLm9wZW5haU1vZGVsLFxuICAgICAgICBtZXNzYWdlczogW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiBwcm9tcHQgfV0sXG4gICAgICAgIHRlbXBlcmF0dXJlOiAwLjIsXG4gICAgICAgIHJlc3BvbnNlX2Zvcm1hdDogeyB0eXBlOiAnanNvbl9vYmplY3QnIH1cbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICBjb25zdCByYXcgPSByZXMuanNvbj8uY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50ID8/ICd7fSc7XG4gICAgcmV0dXJuIHRoaXMucGFyc2VQYWNrRnJvbVRleHQocmF3KTtcbiAgfVxuXG4gIHByaXZhdGUgcGFyc2VQYWNrRnJvbVRleHQocmF3VGV4dDogc3RyaW5nKTogQmxpcFBhY2sge1xuICAgIGNvbnN0IHJhdyA9IHJhd1RleHQ/LnRyaW0oKSB8fCAne30nO1xuICAgIGxldCBwYXJzZWQ6IFBhcnRpYWw8QmxpcFBhY2s+ID0ge307XG5cbiAgICB0cnkge1xuICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIFBhcnRpYWw8QmxpcFBhY2s+O1xuICAgIH0gY2F0Y2gge1xuICAgICAgY29uc3QgZmlyc3QgPSByYXcuaW5kZXhPZigneycpO1xuICAgICAgY29uc3QgbGFzdCA9IHJhdy5sYXN0SW5kZXhPZignfScpO1xuICAgICAgaWYgKGZpcnN0ID49IDAgJiYgbGFzdCA+IGZpcnN0KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcuc2xpY2UoZmlyc3QsIGxhc3QgKyAxKSkgYXMgUGFydGlhbDxCbGlwUGFjaz47XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIHBhcnNlZCA9IHt9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGluc2lnaHQ6IHBhcnNlZC5pbnNpZ2h0Py50cmltKCkgfHwgJ1JlZmluZSB0aGlzIGJsaXAgaW50byBhIGNvbmNyZXRlIG5leHQgYWN0aW9uLicsXG4gICAgICBuZXh0U3RlcHM6XG4gICAgICAgIHBhcnNlZC5uZXh0U3RlcHM/LmZpbHRlcihCb29sZWFuKS5zbGljZSgwLCAzKSB8fCBbXG4gICAgICAgICAgJ1Rha2Ugb25lIHNtYWxsIGNvbmNyZXRlIHN0ZXAgYW5kIG5vdGUgdGhlIHJlc3VsdC4nXG4gICAgICAgIF0sXG4gICAgICByZW1pbmRlcjogcGFyc2VkLnJlbWluZGVyPy50cmltKCkgfHwgJ1NtYWxsIGV4ZWN1dGlvbiBiZWF0cyBwZXJmZWN0IHBsYW5uaW5nLidcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBnZW5lcmF0ZUZhbGxiYWNrKHRpdGxlOiBzdHJpbmcsIG5vdGVDb250ZW50OiBzdHJpbmcpOiBCbGlwUGFjayB7XG4gICAgY29uc3QgdGV4dCA9IGAke3RpdGxlfVxcbiR7bm90ZUNvbnRlbnR9YC50b0xvd2VyQ2FzZSgpO1xuXG4gICAgaWYgKHRleHQuaW5jbHVkZXMoJ2thZmthJykgfHwgdGV4dC5pbmNsdWRlcygndGNwJykgfHwgdGV4dC5pbmNsdWRlcygncXVldWUnKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaW5zaWdodDpcbiAgICAgICAgICAnVGhpcyBibGlwIGhhcyBzdHJvbmcgaW1wbGVtZW50YXRpb24gdmFsdWU7IGNvbnZlcnQgaXQgaW50byBvbmUgdGlueSBleHBlcmltZW50IGJlZm9yZSByZWFkaW5nIG1vcmUuJyxcbiAgICAgICAgbmV4dFN0ZXBzOiBbXG4gICAgICAgICAgJ1JlYWQgb25lIHByYWN0aWNhbCBhcnRpY2xlIG9uIEthZmthIG92ZXIgVENQIGludGVybmFscyAoMTVcdTIwMTMyMCBtaW4gY2FwKS4nLFxuICAgICAgICAgICdCdWlsZCBhIG1pbmkgUG9DOiBzaW5nbGUgcHJvZHVjZXIgKyBjb25zdW1lciB3aXRoIG9uZSBvYnNlcnZhYmxlIG1ldHJpYyAobGF0ZW5jeSBvciByZXRyaWVzKS4nLFxuICAgICAgICAgICdXcml0ZSA1IGJ1bGxldCBsZWFybmluZ3MgaW4gdGhpcyBzYW1lIG5vdGUgYW5kIGxpbmsgdG8gb25lIHJlbGF0ZWQgc3lzdGVtLWRlc2lnbiBub3RlLidcbiAgICAgICAgXSxcbiAgICAgICAgcmVtaW5kZXI6ICdTaGlwIG9uZSBhcnRpZmFjdCwgbm90IGp1c3Qgb25lIHJlYWRpbmcuJ1xuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAodGV4dC5pbmNsdWRlcygncHJvdGVpbicpIHx8IHRleHQuaW5jbHVkZXMoJ3NveWEnKSB8fCB0ZXh0LmluY2x1ZGVzKCdkaWV0JykgfHwgdGV4dC5pbmNsdWRlcygnZm9vZCcpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpbnNpZ2h0OlxuICAgICAgICAgICdUaGlzIGlzIGEgYmVoYXZpb3ItY2hhbmdlIGJsaXA7IHRoZSBmYXN0ZXN0IGNsYXJpdHkgY29tZXMgZnJvbSBhIDctZGF5IG1lYXN1cmVkIHRyaWFsLicsXG4gICAgICAgIG5leHRTdGVwczogW1xuICAgICAgICAgICdQaWNrIG9uZSBkYWlseSBzb3lhL3Byb3RlaW4gcGxhbiBhbmQgcnVuIGl0IGZvciA3IGRheXMuJyxcbiAgICAgICAgICAnVHJhY2sgc2F0aWV0eSwgZGlnZXN0aW9uLCBhbmQgZW5lcmd5IGluIG9uZSBsaW5lIHBlciBkYXkgaW4gdGhpcyBub3RlLicsXG4gICAgICAgICAgJ0F0IGRheSA3LCBrZWVwL2FkanVzdC9kcm9wIGJhc2VkIG9uIGV2aWRlbmNlLCBub3QgbW9vZC4nXG4gICAgICAgIF0sXG4gICAgICAgIHJlbWluZGVyOiAnT25lIGNvbnRyb2xsZWQgZXhwZXJpbWVudCBiZWF0cyBlbmRsZXNzIG51dHJpdGlvbiBicm93c2luZy4nXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBpbnNpZ2h0OiAnTmFycm93IHRoaXMgaW50byBhIGNvbmNyZXRlIG5leHQgYWN0aW9uIHRvIHByZXNlcnZlIG1vbWVudHVtLicsXG4gICAgICBuZXh0U3RlcHM6IFtcbiAgICAgICAgJ0RlZmluZSB0aGUgc21hbGxlc3QgdGVzdGFibGUgYWN0aW9uICg8PTI1IG1pbikuJyxcbiAgICAgICAgJ0RvIGl0IG9uY2UgdGhpcyB3ZWVrIGFuZCBjYXB0dXJlIG91dGNvbWUgaW4gdGhpcyBub3RlLicsXG4gICAgICAgICdBZGQgb25lIGxpbmsgdG8gYSByZWxhdGVkIG5vdGUgZm9yIGNvbnRleHQgY29udGludWl0eS4nXG4gICAgICBdLFxuICAgICAgcmVtaW5kZXI6ICdQcmVmZXIgY29tcGxldGlvbiBhcnRpZmFjdHMgb3ZlciBtb3JlIGlucHV0cy4nXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgcmVzb2x2ZUxvY2FsQ2xpQmluYXJ5KGtpbmQ6IExvY2FsQ2xpLCBjb25maWd1cmVkUGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCByZXEgPSB0aGlzLm5vZGVSZXF1aXJlKCk7XG4gICAgY29uc3QgZnMgPSByZXEoJ2ZzJykgYXMgdHlwZW9mIGltcG9ydCgnZnMnKTtcbiAgICBjb25zdCBwYXRoID0gcmVxKCdwYXRoJykgYXMgdHlwZW9mIGltcG9ydCgncGF0aCcpO1xuXG4gICAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICAgIGNvbmZpZ3VyZWRQYXRoLFxuICAgICAga2luZCxcbiAgICAgIHBhdGguam9pbignL1VzZXJzL3BhcmFzaHVyYW0vLm5wbS1nbG9iYWwvYmluJywga2luZCksXG4gICAgICBwYXRoLmpvaW4oJy9Vc2Vycy9wYXJhc2h1cmFtLy5sb2NhbC9iaW4nLCBraW5kKSxcbiAgICAgIHBhdGguam9pbihwcm9jZXNzLmVudi5IT01FIHx8ICcnLCAnLm5wbS1nbG9iYWwvYmluJywga2luZCksXG4gICAgICBwYXRoLmpvaW4ocHJvY2Vzcy5lbnYuSE9NRSB8fCAnJywgJy5sb2NhbC9iaW4nLCBraW5kKSxcbiAgICAgIGAvb3B0L2hvbWVicmV3L2Jpbi8ke2tpbmR9YCxcbiAgICAgIGAvdXNyL2xvY2FsL2Jpbi8ke2tpbmR9YCxcbiAgICAgIGAvdXNyL2Jpbi8ke2tpbmR9YFxuICAgIF0uZmlsdGVyKEJvb2xlYW4pO1xuXG4gICAgZm9yIChjb25zdCBjIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGlmICghYykgY29udGludWU7XG4gICAgICBpZiAoYyA9PT0ga2luZCkgcmV0dXJuIGM7XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhjKSkgcmV0dXJuIGM7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgYCR7a2luZH0gYmluYXJ5IG5vdCBmb3VuZCAoRU5PRU5UKS4gU2V0IEJsaXAgUmVzdXJmYWNlciAke2tpbmQgPT09ICdjb2RleCcgPyAnQ29kZXgnIDogJ0NsYXVkZSd9IHBhdGggaW4gc2V0dGluZ3MuYFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIHJlc29sdmVOb2RlQmluYXJ5KGNvbmZpZ3VyZWRQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHJlcSA9IHRoaXMubm9kZVJlcXVpcmUoKTtcbiAgICBjb25zdCBmcyA9IHJlcSgnZnMnKSBhcyB0eXBlb2YgaW1wb3J0KCdmcycpO1xuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbY29uZmlndXJlZFBhdGgsICcvb3B0L2hvbWVicmV3L2Jpbi9ub2RlJywgJy91c3IvbG9jYWwvYmluL25vZGUnLCAnbm9kZSddO1xuXG4gICAgZm9yIChjb25zdCBjIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgIGlmICghYykgY29udGludWU7XG4gICAgICBpZiAoYyA9PT0gJ25vZGUnKSByZXR1cm4gYztcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKGMpKSByZXR1cm4gYztcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoJ25vZGUgYmluYXJ5IG5vdCBmb3VuZC4gU2V0IE5vZGUgcGF0aCBpbiBCbGlwIFJlc3VyZmFjZXIgc2V0dGluZ3MuJyk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bkNvbW1hbmQoXG4gICAgY29tbWFuZDogc3RyaW5nLFxuICAgIGFyZ3M6IHN0cmluZ1tdLFxuICAgIHN0ZGluVGV4dD86IHN0cmluZyxcbiAgICBjd2Q/OiBzdHJpbmdcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCByZXEgPSB0aGlzLm5vZGVSZXF1aXJlKCk7XG4gICAgY29uc3QgY3AgPSByZXEoJ2NoaWxkX3Byb2Nlc3MnKSBhcyB0eXBlb2YgaW1wb3J0KCdjaGlsZF9wcm9jZXNzJyk7XG5cbiAgICByZXR1cm4gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgY29uc3QgY2hpbGQgPSBjcC5zcGF3bihjb21tYW5kLCBhcmdzLCB7XG4gICAgICAgIGN3ZCxcbiAgICAgICAgc2hlbGw6IGZhbHNlLFxuICAgICAgICBlbnY6IHByb2Nlc3MuZW52XG4gICAgICB9KTtcblxuICAgICAgbGV0IHN0ZG91dCA9ICcnO1xuICAgICAgbGV0IHN0ZGVyciA9ICcnO1xuXG4gICAgICBjaGlsZC5zdGRvdXQ/Lm9uKCdkYXRhJywgKGQ6IEJ1ZmZlcikgPT4gKHN0ZG91dCArPSBkLnRvU3RyaW5nKCd1dGY4JykpKTtcbiAgICAgIGNoaWxkLnN0ZGVycj8ub24oJ2RhdGEnLCAoZDogQnVmZmVyKSA9PiAoc3RkZXJyICs9IGQudG9TdHJpbmcoJ3V0ZjgnKSkpO1xuICAgICAgY2hpbGQub24oJ2Vycm9yJywgKGVycjogTm9kZUpTLkVycm5vRXhjZXB0aW9uKSA9PiB7XG4gICAgICAgIGlmIChlcnI/LmNvZGUgPT09ICdFTk9FTlQnKSB7XG4gICAgICAgICAgcmVqZWN0KG5ldyBFcnJvcihgJHtjb21tYW5kfSBub3QgZm91bmQgKEVOT0VOVCkuIENoZWNrIENMSSBwYXRoIGluIHBsdWdpbiBzZXR0aW5ncy5gKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG4gICAgICBjaGlsZC5vbignY2xvc2UnLCAoY29kZSkgPT4ge1xuICAgICAgICBpZiAoY29kZSA9PT0gMCkgcmVzb2x2ZShzdGRvdXQudHJpbSgpKTtcbiAgICAgICAgZWxzZSByZWplY3QobmV3IEVycm9yKGAke2NvbW1hbmR9IGV4aXRlZCAke2NvZGV9OiAke3N0ZGVyciB8fCBzdGRvdXR9YCkpO1xuICAgICAgfSk7XG5cbiAgICAgIGlmIChzdGRpblRleHQgJiYgY2hpbGQuc3RkaW4pIHtcbiAgICAgICAgY2hpbGQuc3RkaW4ud3JpdGUoc3RkaW5UZXh0KTtcbiAgICAgIH1cbiAgICAgIGNoaWxkLnN0ZGluPy5lbmQoKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgbm9kZVJlcXVpcmUoKSB7XG4gICAgY29uc3QgcmVxID0gKHdpbmRvdyBhcyB1bmtub3duIGFzIHsgcmVxdWlyZT86IE5vZGVSZXF1aXJlIH0pLnJlcXVpcmU7XG4gICAgaWYgKCFyZXEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm9kZSByZXF1aXJlKCkgdW5hdmFpbGFibGUuIExvY2FsIENMSSBtb2RlIG5lZWRzIGRlc2t0b3AgT2JzaWRpYW4uJyk7XG4gICAgfVxuICAgIHJldHVybiByZXE7XG4gIH1cblxuICBwcml2YXRlIGZvcm1hdERhdGUoZDogRGF0ZSk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIH1cbn1cblxuY2xhc3MgQmxpcFJlc3VyZmFjZXJTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIHBsdWdpbjogQmxpcFJlc3VyZmFjZXJQbHVnaW47XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogQmxpcFJlc3VyZmFjZXJQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ0JsaXAgUmVzdXJmYWNlcicgfSk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdNYXggZGFpbHkgcmVzdXJmYWNlZCBibGlwcycpXG4gICAgICAuc2V0RGVzYygnSG93IG1hbnkgYmxpcHMgdG8gdXBkYXRlIGluIG9uZSBydW4nKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLm1heERhaWx5UmVzdXJmYWNlKSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBuID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKG4pICYmIG4gPiAwKSB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm1heERhaWx5UmVzdXJmYWNlID0gbjtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdSZXZpZXcgaW50ZXJ2YWwgZGF5cycpXG4gICAgICAuc2V0RGVzYygnSG93IG1hbnkgZGF5cyB1bnRpbCBuZXh0IHJlc3VyZmFjaW5nIHJlY29tbWVuZGF0aW9uJylcbiAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZXZpZXdJbnRlcnZhbERheXMpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG4gPSBOdW1iZXIodmFsdWUpO1xuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4obikgJiYgbiA+IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucmV2aWV3SW50ZXJ2YWxEYXlzID0gbjtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdBSSBwcm92aWRlcicpXG4gICAgICAuc2V0RGVzYygnVXNlIGxvY2FsIENvZGV4L0NsYXVkZSBDTEkgYnkgZGVmYXVsdCAobm8gQVBJIGtleSBuZWVkZWQpLicpXG4gICAgICAuYWRkRHJvcGRvd24oKGRkKSA9PlxuICAgICAgICBkZFxuICAgICAgICAgIC5hZGRPcHRpb24oJ2xvY2FsLWNsaScsICdMb2NhbCBDTEkgKENvZGV4L0NsYXVkZSknKVxuICAgICAgICAgIC5hZGRPcHRpb24oJ29wZW5haScsICdPcGVuQUkgQVBJJylcbiAgICAgICAgICAuYWRkT3B0aW9uKCdmYWxsYmFjaycsICdGYWxsYmFjayBvbmx5IChydWxlcyknKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5haVByb3ZpZGVyKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWU6IEFpUHJvdmlkZXIpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmFpUHJvdmlkZXIgPSB2YWx1ZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlQcm92aWRlciA9PT0gJ2xvY2FsLWNsaScpIHtcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAuc2V0TmFtZSgnTG9jYWwgQ0xJJylcbiAgICAgICAgLnNldERlc2MoJ1NlbGVjdCB3aGljaCBpbnN0YWxsZWQgQ0xJIHRvIHVzZScpXG4gICAgICAgIC5hZGREcm9wZG93bigoZGQpID0+XG4gICAgICAgICAgZGRcbiAgICAgICAgICAgIC5hZGRPcHRpb24oJ2NvZGV4JywgJ0NvZGV4JylcbiAgICAgICAgICAgIC5hZGRPcHRpb24oJ2NsYXVkZScsICdDbGF1ZGUnKVxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsQ2xpKVxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogTG9jYWxDbGkpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxDbGkgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgIC5zZXROYW1lKCdTdHJpY3QgbG9jYWwgQUkgbW9kZScpXG4gICAgICAgIC5zZXREZXNjKCdJZiBsb2NhbCBDTEkgZmFpbHMsIHN0b3AgcnVuIGluc3RlYWQgb2Ygc2lsZW50bHkgdXNpbmcgZ2VuZXJpYyBmYWxsYmFjaycpXG4gICAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgICB0b2dnbGVcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdHJpY3RMb2NhbEFpKVxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdHJpY3RMb2NhbEFpID0gdmFsdWU7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsQ2xpID09PSAnY29kZXgnKSB7XG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgIC5zZXROYW1lKCdDb2RleCBiaW5hcnkgcGF0aCcpXG4gICAgICAgICAgLnNldERlc2MoJ0Fic29sdXRlIHBhdGggcHJlZmVycmVkIChmaXhlcyBFTk9FTlQgb24gc29tZSBPYnNpZGlhbiBQQVRIIHNldHVwcyknKVxuICAgICAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICAgICAgdGV4dFxuICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJy9Vc2Vycy95b3UvLm5wbS1nbG9iYWwvYmluL2NvZGV4JylcbiAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvZGV4UGF0aClcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNvZGV4UGF0aCA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICApO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgIC5zZXROYW1lKCdOb2RlIGJpbmFyeSBwYXRoIChmb3IgQ29kZXgpJylcbiAgICAgICAgICAuc2V0RGVzYygnVXNlZCB0byBydW4gQ29kZXggSlMgZW50cnlwb2ludCB3aGVuIGVudiBQQVRIIGlzIG1pc3Npbmcgbm9kZScpXG4gICAgICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgICAgICB0ZXh0XG4gICAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcignL29wdC9ob21lYnJldy9iaW4vbm9kZScpXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5ub2RlUGF0aClcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm5vZGVQYXRoID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgLnNldE5hbWUoJ0NvZGV4IG1vZGVsIChvcHRpb25hbCknKVxuICAgICAgICAgIC5hZGRUZXh0KCh0ZXh0KSA9PlxuICAgICAgICAgICAgdGV4dFxuICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJ2UuZy4gZ3B0LTUtY29kZXgnKVxuICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuY29kZXhNb2RlbClcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNvZGV4TW9kZWwgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgIC5zZXROYW1lKCdDbGF1ZGUgYmluYXJ5IHBhdGgnKVxuICAgICAgICAgIC5zZXREZXNjKCdBYnNvbHV0ZSBwYXRoIHByZWZlcnJlZCAoZml4ZXMgRU5PRU5UIG9uIHNvbWUgT2JzaWRpYW4gUEFUSCBzZXR1cHMpJylcbiAgICAgICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCcvVXNlcnMveW91Ly5sb2NhbC9iaW4vY2xhdWRlJylcbiAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNsYXVkZVBhdGgpXG4gICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5jbGF1ZGVQYXRoID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgLnNldE5hbWUoJ0NsYXVkZSBtb2RlbCAob3B0aW9uYWwpJylcbiAgICAgICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdlLmcuIHNvbm5ldCcpXG4gICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jbGF1ZGVNb2RlbClcbiAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmNsYXVkZU1vZGVsID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmFpUHJvdmlkZXIgPT09ICdvcGVuYWknKSB7XG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgLnNldE5hbWUoJ09wZW5BSSBBUEkga2V5JylcbiAgICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgICAgdGV4dFxuICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKCdzay0uLi4nKVxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5haUFwaUtleSlcbiAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mub3BlbmFpQXBpS2V5ID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG5cbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAuc2V0TmFtZSgnT3BlbkFJIG1vZGVsJylcbiAgICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgICAgdGV4dFxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5haU1vZGVsKVxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuYWlNb2RlbCA9IHZhbHVlLnRyaW0oKSB8fCAnZ3B0LTRvLW1pbmknO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnVXNlciBjb250ZXh0JylcbiAgICAgIC5zZXREZXNjKCdVc2VkIHRvIHRhaWxvciBuZXh0IHF1YWxpdHkgc3RlcHMnKVxuICAgICAgLmFkZFRleHRBcmVhKCh0ZXh0KSA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJDb250ZXh0KVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnVzZXJDb250ZXh0ID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ1J1biBub3cnKVxuICAgICAgLnNldERlc2MoJ01hbnVhbGx5IHJlc3VyZmFjZSBibGlwcyBhbmQgdXBkYXRlIG5vdGVzIGluLXBsYWNlJylcbiAgICAgIC5hZGRCdXR0b24oKGJ0bikgPT5cbiAgICAgICAgYnRuLnNldEJ1dHRvblRleHQoJ1Jlc3VyZmFjZSBub3cnKS5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICBjb25zdCBjb3VudCA9IGF3YWl0IHRoaXMucGx1Z2luLnJlc3VyZmFjZU5vdygpO1xuICAgICAgICAgIG5ldyBOb3RpY2UoYEJsaXAgUmVzdXJmYWNlcjogdXBkYXRlZCAke2NvdW50fSBibGlwKHMpYCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFRTztBQTJCUCxJQUFNLG1CQUEyQztBQUFBLEVBQy9DLG1CQUFtQjtBQUFBLEVBQ25CLG9CQUFvQjtBQUFBLEVBQ3BCLFlBQVk7QUFBQSxFQUNaLFVBQVU7QUFBQSxFQUNWLGVBQWU7QUFBQSxFQUNmLFlBQVk7QUFBQSxFQUNaLGFBQWE7QUFBQSxFQUNiLFdBQVc7QUFBQSxFQUNYLFlBQVk7QUFBQSxFQUNaLFVBQVU7QUFBQSxFQUNWLGNBQWM7QUFBQSxFQUNkLGFBQWE7QUFBQSxFQUNiLGFBQ0U7QUFDSjtBQUVBLElBQXFCLHVCQUFyQixjQUFrRCx1QkFBTztBQUFBLEVBQXpEO0FBQUE7QUFDRSxvQkFBbUM7QUFBQTtBQUFBLEVBRW5DLE1BQU0sU0FBUztBQUNiLFVBQU0sS0FBSyxhQUFhO0FBRXhCLFNBQUssV0FBVztBQUFBLE1BQ2QsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sVUFBVSxZQUFZO0FBQ3BCLGNBQU0sUUFBUSxNQUFNLEtBQUssYUFBYTtBQUN0QyxZQUFJLHVCQUFPLDRCQUE0QixLQUFLLFVBQVU7QUFBQSxNQUN4RDtBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssV0FBVztBQUFBLE1BQ2QsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sVUFBVSxZQUFZO0FBQ3BCLFlBQUk7QUFDRixnQkFBTSxPQUFPLE1BQU0sS0FBSztBQUFBLFlBQ3RCO0FBQUEsWUFDQTtBQUFBLFVBQ0Y7QUFDQSxjQUFJLHVCQUFPLGdCQUFnQixLQUFLLFNBQVMsUUFBUSxlQUFlLEtBQUssUUFBUSxNQUFNLEdBQUcsRUFBRSxDQUFDLEtBQUs7QUFBQSxRQUNoRyxTQUFTLEdBQUc7QUFDVixjQUFJLHVCQUFPLG9CQUFvQixLQUFLLFNBQVMsUUFBUSxNQUFNLE9BQVEsR0FBYSxXQUFXLENBQUMsRUFBRSxNQUFNLEdBQUcsR0FBRyxDQUFDLEVBQUU7QUFBQSxRQUMvRztBQUFBLE1BQ0Y7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLGNBQWMsSUFBSSx5QkFBeUIsS0FBSyxLQUFLLElBQUksQ0FBQztBQUFBLEVBQ2pFO0FBQUEsRUFFQSxNQUFNLGVBQWU7QUFDbkIsVUFBTSxTQUFTLE9BQU8sT0FBTyxDQUFDLEdBQUcsa0JBQWtCLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFLeEUsUUFBSSxPQUFPLE9BQU8sY0FBYyxXQUFXO0FBQ3pDLFVBQUksQ0FBQyxPQUFPLFVBQVcsUUFBTyxhQUFhO0FBQUEsZUFDbEMsT0FBTyxlQUFlLFdBQVksUUFBTyxhQUFhO0FBQUEsSUFDakU7QUFHQSxRQUFJLENBQUMsT0FBTyxZQUFZLEtBQUssS0FBSyxPQUFPLFdBQVcsU0FBUyxlQUFlLEdBQUc7QUFDN0UsYUFBTyxhQUFhO0FBQUEsSUFDdEI7QUFDQSxRQUFJLENBQUMsT0FBTyxhQUFhLEtBQUssR0FBRztBQUMvQixhQUFPLGNBQWM7QUFBQSxJQUN2QjtBQUNBLFFBQUksQ0FBQyxPQUFPLFdBQVcsS0FBSyxHQUFHO0FBQzdCLGFBQU8sWUFBWTtBQUFBLElBQ3JCO0FBQ0EsUUFBSSxDQUFDLE9BQU8sWUFBWSxLQUFLLEdBQUc7QUFDOUIsYUFBTyxhQUFhO0FBQUEsSUFDdEI7QUFDQSxRQUFJLENBQUMsT0FBTyxVQUFVLEtBQUssR0FBRztBQUM1QixhQUFPLFdBQVc7QUFBQSxJQUNwQjtBQUVBLFNBQUssV0FBVztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxNQUFNLGVBQWU7QUFDbkIsVUFBTSxLQUFLLFNBQVMsS0FBSyxRQUFRO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE1BQU0sZUFBZ0M7QUFDcEMsVUFBTSxRQUFRLE1BQU0sS0FBSyxhQUFhO0FBQ3RDLFFBQUksQ0FBQyxNQUFNLFFBQVE7QUFDakIsVUFBSSx1QkFBTyxpQ0FBaUM7QUFDNUMsYUFBTztBQUFBLElBQ1Q7QUFFQSxVQUFNLFdBQVcsTUFBTSxNQUFNLEdBQUcsS0FBSyxJQUFJLEdBQUcsS0FBSyxTQUFTLGlCQUFpQixDQUFDO0FBRTVFLGVBQVcsUUFBUSxVQUFVO0FBQzNCLFlBQU0sT0FBTyxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUMzQyxZQUFNLE9BQU8sTUFBTSxLQUFLLGlCQUFpQixLQUFLLFVBQVUsSUFBSTtBQUM1RCxZQUFNLEtBQUssc0JBQXNCLElBQUk7QUFDckMsWUFBTSxLQUFLLGlCQUFpQixNQUFNLElBQUk7QUFBQSxJQUN4QztBQUVBLFdBQU8sU0FBUztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxNQUFjLGVBQWlDO0FBQzdDLFVBQU0sTUFBTSxLQUFLLElBQUksTUFBTSxpQkFBaUI7QUFDNUMsVUFBTSxXQUF1RCxDQUFDO0FBRTlELGVBQVcsUUFBUSxLQUFLO0FBQ3RCLFlBQU0sUUFBUSxLQUFLLElBQUksY0FBYyxhQUFhLElBQUk7QUFDdEQsWUFBTSxLQUFLLE9BQU87QUFDbEIsVUFBSSxDQUFDLE1BQU0sT0FBTyxHQUFHLFFBQVEsRUFBRSxFQUFFLFlBQVksTUFBTSxPQUFRO0FBRTNELFlBQU0sY0FBYyxPQUFPLEdBQUcsc0JBQXNCLEVBQUU7QUFDdEQsWUFBTSxhQUFhLGNBQWMsS0FBSyxNQUFNLFdBQVcsSUFBSTtBQUMzRCxlQUFTLEtBQUssRUFBRSxNQUFNLFlBQVksT0FBTyxNQUFNLFVBQVUsSUFBSSxJQUFJLFdBQVcsQ0FBQztBQUFBLElBQy9FO0FBRUEsV0FBTyxTQUNKLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDZCxVQUFJLEVBQUUsZUFBZSxFQUFFLFdBQVksUUFBTyxFQUFFLGFBQWEsRUFBRTtBQUMzRCxhQUFPLEVBQUUsS0FBSyxLQUFLLFFBQVEsRUFBRSxLQUFLLEtBQUs7QUFBQSxJQUN6QyxDQUFDLEVBQ0EsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJO0FBQUEsRUFDdEI7QUFBQSxFQUVBLE1BQWMsc0JBQXNCLE1BQWE7QUFDL0MsVUFBTSxRQUFRLEtBQUssV0FBVyxvQkFBSSxLQUFLLENBQUM7QUFDeEMsVUFBTSxPQUFPLG9CQUFJLEtBQUs7QUFDdEIsU0FBSyxRQUFRLEtBQUssUUFBUSxJQUFJLEtBQUssU0FBUyxrQkFBa0I7QUFFOUQsVUFBTSxLQUFLLElBQUksWUFBWSxtQkFBbUIsTUFBTSxDQUFDLE9BQWdDO0FBQ25GLFNBQUcsT0FBTztBQUNWLFNBQUcsY0FBYyxHQUFHLGVBQWU7QUFDbkMsU0FBRyxlQUFlLEdBQUcsZ0JBQWdCO0FBQ3JDLFNBQUcscUJBQXFCO0FBQ3hCLFNBQUcsbUJBQW1CLEtBQUssV0FBVyxJQUFJO0FBQzFDLFNBQUcsdUJBQXVCLE9BQU8sR0FBRyx3QkFBd0IsQ0FBQyxJQUFJO0FBQUEsSUFDbkUsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLE1BQWEsTUFBZ0I7QUFDMUQsVUFBTSxVQUFVLEtBQUssV0FBVyxvQkFBSSxLQUFLLENBQUM7QUFDMUMsVUFBTSxnQkFBZ0I7QUFFdEIsVUFBTSxRQUFRO0FBQUEsTUFDWixPQUFPLE9BQU87QUFBQSxNQUNkLG1CQUFtQixLQUFLLFNBQVMsZUFBZSxjQUFjLEtBQUssU0FBUyxXQUFXLEtBQUssU0FBUyxVQUFVO0FBQUEsTUFDL0csY0FBYyxLQUFLLE9BQU87QUFBQSxNQUMxQjtBQUFBLE1BQ0EsR0FBRyxLQUFLLFVBQVUsSUFBSSxDQUFDLE1BQU0sT0FBTyxDQUFDLEVBQUU7QUFBQSxNQUN2QyxlQUFlLEtBQUssUUFBUTtBQUFBLE1BQzVCO0FBQUEsSUFDRixFQUFFLEtBQUssSUFBSTtBQUVYLFVBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUU5QyxRQUFJLFFBQVEsU0FBUyxhQUFhLEdBQUc7QUFDbkMsWUFBTSxLQUFLLElBQUksTUFBTSxPQUFPLE1BQU0sR0FBRyxRQUFRLFFBQVEsQ0FBQztBQUFBO0FBQUEsRUFBTyxLQUFLLEVBQUU7QUFDcEU7QUFBQSxJQUNGO0FBRUEsVUFBTSxVQUFVLEdBQUcsUUFBUSxRQUFRLENBQUM7QUFBQTtBQUFBLEVBQU8sYUFBYTtBQUFBO0FBQUEsRUFBTyxLQUFLO0FBQ3BFLFVBQU0sS0FBSyxJQUFJLE1BQU0sT0FBTyxNQUFNLE9BQU87QUFBQSxFQUMzQztBQUFBLEVBRUEsTUFBYyxpQkFBaUIsT0FBZSxhQUF3QztBQUNwRixRQUFJLEtBQUssU0FBUyxlQUFlLGFBQWE7QUFDNUMsVUFBSTtBQUNGLGVBQU8sTUFBTSxLQUFLLG9CQUFvQixPQUFPLFdBQVc7QUFBQSxNQUMxRCxTQUFTLEdBQUc7QUFDVixjQUFNLE1BQU0sT0FBUSxHQUFhLFdBQVcsQ0FBQztBQUM3QyxnQkFBUSxNQUFNLG9DQUFvQyxDQUFDO0FBQ25ELFlBQUksdUJBQU8sMEJBQTBCLEtBQUssU0FBUyxRQUFRLFlBQVksSUFBSSxNQUFNLEdBQUcsR0FBRyxDQUFDLEdBQUc7QUFDM0YsWUFBSSxLQUFLLFNBQVMsZUFBZTtBQUMvQixnQkFBTTtBQUFBLFFBQ1I7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUVBLFFBQUksS0FBSyxTQUFTLGVBQWUsWUFBWSxLQUFLLFNBQVMsYUFBYSxLQUFLLEdBQUc7QUFDOUUsVUFBSTtBQUNGLGVBQU8sTUFBTSxLQUFLLGtCQUFrQixPQUFPLFdBQVc7QUFBQSxNQUN4RCxTQUFTLEdBQUc7QUFDVixnQkFBUSxNQUFNLGlEQUFpRCxDQUFDO0FBQUEsTUFDbEU7QUFBQSxJQUNGO0FBRUEsV0FBTyxLQUFLLGlCQUFpQixPQUFPLFdBQVc7QUFBQSxFQUNqRDtBQUFBLEVBRVEsWUFBWSxPQUFlLGFBQTZCO0FBQzlELFdBQU87QUFBQTtBQUFBO0FBQUEsSUFHUCxLQUFLLFNBQVMsV0FBVztBQUFBO0FBQUE7QUFBQTtBQUFBLGNBSWYsS0FBSztBQUFBO0FBQUEsRUFFakIsWUFBWSxNQUFNLEdBQUcsSUFBSSxDQUFDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVExQjtBQUFBLEVBRUEsTUFBYyxvQkFBb0IsT0FBZSxhQUF3QztBQUN2RixVQUFNLFNBQVMsS0FBSyxZQUFZLE9BQU8sV0FBVztBQUNsRCxVQUFNLFlBQVksS0FBSyxJQUFJLE1BQU0sUUFBUSxZQUFZO0FBRXJELFFBQUksU0FBUztBQUViLFFBQUksS0FBSyxTQUFTLGFBQWEsU0FBUztBQUN0QyxZQUFNLE1BQU0sS0FBSyxZQUFZO0FBQzdCLFlBQU0sS0FBSyxJQUFJLElBQUk7QUFDbkIsWUFBTSxLQUFLLElBQUksSUFBSTtBQUNuQixZQUFNLE9BQU8sSUFBSSxNQUFNO0FBQ3ZCLFlBQU0sV0FBVyxLQUFLLHNCQUFzQixTQUFTLEtBQUssU0FBUyxTQUFTO0FBQzVFLFlBQU0sVUFBVSxLQUFLLEtBQUssR0FBRyxPQUFPLEdBQUcsbUJBQW1CLEtBQUssSUFBSSxDQUFDLE9BQU87QUFDM0UsWUFBTSxhQUFhLEtBQUssS0FBSyxHQUFHLE9BQU8sR0FBRywwQkFBMEIsS0FBSyxJQUFJLENBQUMsT0FBTztBQUNyRixTQUFHO0FBQUEsUUFDRDtBQUFBLFFBQ0EsS0FBSyxVQUFVO0FBQUEsVUFDYixNQUFNO0FBQUEsVUFDTixzQkFBc0I7QUFBQSxVQUN0QixVQUFVLENBQUMsV0FBVyxhQUFhLFVBQVU7QUFBQSxVQUM3QyxZQUFZO0FBQUEsWUFDVixTQUFTLEVBQUUsTUFBTSxTQUFTO0FBQUEsWUFDMUIsV0FBVyxFQUFFLE1BQU0sU0FBUyxVQUFVLEdBQUcsVUFBVSxHQUFHLE9BQU8sRUFBRSxNQUFNLFNBQVMsRUFBRTtBQUFBLFlBQ2hGLFVBQVUsRUFBRSxNQUFNLFNBQVM7QUFBQSxVQUM3QjtBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0g7QUFFQSxZQUFNLE9BQU87QUFBQSxRQUNYO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQ0EsVUFBSSxLQUFLLFNBQVMsV0FBVyxLQUFLLEdBQUc7QUFDbkMsYUFBSyxPQUFPLEdBQUcsR0FBRyxXQUFXLEtBQUssU0FBUyxXQUFXLEtBQUssQ0FBQztBQUFBLE1BQzlEO0FBRUEsWUFBTSxVQUFVLEtBQUssa0JBQWtCLEtBQUssU0FBUyxRQUFRO0FBQzdELFlBQU0sS0FBSyxXQUFXLFNBQVMsQ0FBQyxVQUFVLEdBQUcsSUFBSSxHQUFHLFFBQVEsU0FBUztBQUNyRSxlQUFTLEdBQUcsV0FBVyxPQUFPLElBQUksR0FBRyxhQUFhLFNBQVMsTUFBTSxJQUFJO0FBQ3JFLFVBQUksR0FBRyxXQUFXLE9BQU8sRUFBRyxJQUFHLFdBQVcsT0FBTztBQUNqRCxVQUFJLEdBQUcsV0FBVyxVQUFVLEVBQUcsSUFBRyxXQUFXLFVBQVU7QUFBQSxJQUN6RCxPQUFPO0FBQ0wsWUFBTSxZQUFZLEtBQUssc0JBQXNCLFVBQVUsS0FBSyxTQUFTLFVBQVU7QUFDL0UsWUFBTSxPQUFPLENBQUMsTUFBTSxtQkFBbUIsTUFBTTtBQUM3QyxVQUFJLEtBQUssU0FBUyxZQUFZLEtBQUssR0FBRztBQUNwQyxhQUFLLEtBQUssV0FBVyxLQUFLLFNBQVMsWUFBWSxLQUFLLENBQUM7QUFBQSxNQUN2RDtBQUNBLFdBQUssS0FBSyxNQUFNO0FBQ2hCLGVBQVMsTUFBTSxLQUFLLFdBQVcsV0FBVyxNQUFNLFFBQVcsU0FBUztBQUFBLElBQ3RFO0FBRUEsV0FBTyxLQUFLLGtCQUFrQixNQUFNO0FBQUEsRUFDdEM7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLE9BQWUsYUFBd0M7QUFDckYsVUFBTSxTQUFTLEtBQUssWUFBWSxPQUFPLFdBQVc7QUFFbEQsVUFBTSxNQUFNLFVBQU0sNEJBQVc7QUFBQSxNQUMzQixLQUFLO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUixTQUFTO0FBQUEsUUFDUCxlQUFlLFVBQVUsS0FBSyxTQUFTLFlBQVk7QUFBQSxRQUNuRCxnQkFBZ0I7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsTUFBTSxLQUFLLFVBQVU7QUFBQSxRQUNuQixPQUFPLEtBQUssU0FBUztBQUFBLFFBQ3JCLFVBQVUsQ0FBQyxFQUFFLE1BQU0sUUFBUSxTQUFTLE9BQU8sQ0FBQztBQUFBLFFBQzVDLGFBQWE7QUFBQSxRQUNiLGlCQUFpQixFQUFFLE1BQU0sY0FBYztBQUFBLE1BQ3pDLENBQUM7QUFBQSxJQUNILENBQUM7QUFFRCxVQUFNLE1BQU0sSUFBSSxNQUFNLFVBQVUsQ0FBQyxHQUFHLFNBQVMsV0FBVztBQUN4RCxXQUFPLEtBQUssa0JBQWtCLEdBQUc7QUFBQSxFQUNuQztBQUFBLEVBRVEsa0JBQWtCLFNBQTJCO0FBQ25ELFVBQU0sTUFBTSxTQUFTLEtBQUssS0FBSztBQUMvQixRQUFJLFNBQTRCLENBQUM7QUFFakMsUUFBSTtBQUNGLGVBQVMsS0FBSyxNQUFNLEdBQUc7QUFBQSxJQUN6QixRQUFRO0FBQ04sWUFBTSxRQUFRLElBQUksUUFBUSxHQUFHO0FBQzdCLFlBQU0sT0FBTyxJQUFJLFlBQVksR0FBRztBQUNoQyxVQUFJLFNBQVMsS0FBSyxPQUFPLE9BQU87QUFDOUIsWUFBSTtBQUNGLG1CQUFTLEtBQUssTUFBTSxJQUFJLE1BQU0sT0FBTyxPQUFPLENBQUMsQ0FBQztBQUFBLFFBQ2hELFFBQVE7QUFDTixtQkFBUyxDQUFDO0FBQUEsUUFDWjtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLE1BQ0wsU0FBUyxPQUFPLFNBQVMsS0FBSyxLQUFLO0FBQUEsTUFDbkMsV0FDRSxPQUFPLFdBQVcsT0FBTyxPQUFPLEVBQUUsTUFBTSxHQUFHLENBQUMsS0FBSztBQUFBLFFBQy9DO0FBQUEsTUFDRjtBQUFBLE1BQ0YsVUFBVSxPQUFPLFVBQVUsS0FBSyxLQUFLO0FBQUEsSUFDdkM7QUFBQSxFQUNGO0FBQUEsRUFFUSxpQkFBaUIsT0FBZSxhQUErQjtBQUNyRSxVQUFNLE9BQU8sR0FBRyxLQUFLO0FBQUEsRUFBSyxXQUFXLEdBQUcsWUFBWTtBQUVwRCxRQUFJLEtBQUssU0FBUyxPQUFPLEtBQUssS0FBSyxTQUFTLEtBQUssS0FBSyxLQUFLLFNBQVMsT0FBTyxHQUFHO0FBQzVFLGFBQU87QUFBQSxRQUNMLFNBQ0U7QUFBQSxRQUNGLFdBQVc7QUFBQSxVQUNUO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNGO0FBQUEsUUFDQSxVQUFVO0FBQUEsTUFDWjtBQUFBLElBQ0Y7QUFFQSxRQUFJLEtBQUssU0FBUyxTQUFTLEtBQUssS0FBSyxTQUFTLE1BQU0sS0FBSyxLQUFLLFNBQVMsTUFBTSxLQUFLLEtBQUssU0FBUyxNQUFNLEdBQUc7QUFDdkcsYUFBTztBQUFBLFFBQ0wsU0FDRTtBQUFBLFFBQ0YsV0FBVztBQUFBLFVBQ1Q7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Y7QUFBQSxRQUNBLFVBQVU7QUFBQSxNQUNaO0FBQUEsSUFDRjtBQUVBLFdBQU87QUFBQSxNQUNMLFNBQVM7QUFBQSxNQUNULFdBQVc7QUFBQSxRQUNUO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNGO0FBQUEsTUFDQSxVQUFVO0FBQUEsSUFDWjtBQUFBLEVBQ0Y7QUFBQSxFQUVRLHNCQUFzQixNQUFnQixnQkFBZ0M7QUFDNUUsVUFBTSxNQUFNLEtBQUssWUFBWTtBQUM3QixVQUFNLEtBQUssSUFBSSxJQUFJO0FBQ25CLFVBQU0sT0FBTyxJQUFJLE1BQU07QUFFdkIsVUFBTSxhQUFhO0FBQUEsTUFDakI7QUFBQSxNQUNBO0FBQUEsTUFDQSxLQUFLLEtBQUsscUNBQXFDLElBQUk7QUFBQSxNQUNuRCxLQUFLLEtBQUssZ0NBQWdDLElBQUk7QUFBQSxNQUM5QyxLQUFLLEtBQUssUUFBUSxJQUFJLFFBQVEsSUFBSSxtQkFBbUIsSUFBSTtBQUFBLE1BQ3pELEtBQUssS0FBSyxRQUFRLElBQUksUUFBUSxJQUFJLGNBQWMsSUFBSTtBQUFBLE1BQ3BELHFCQUFxQixJQUFJO0FBQUEsTUFDekIsa0JBQWtCLElBQUk7QUFBQSxNQUN0QixZQUFZLElBQUk7QUFBQSxJQUNsQixFQUFFLE9BQU8sT0FBTztBQUVoQixlQUFXLEtBQUssWUFBWTtBQUMxQixVQUFJLENBQUMsRUFBRztBQUNSLFVBQUksTUFBTSxLQUFNLFFBQU87QUFDdkIsVUFBSSxHQUFHLFdBQVcsQ0FBQyxFQUFHLFFBQU87QUFBQSxJQUMvQjtBQUVBLFVBQU0sSUFBSTtBQUFBLE1BQ1IsR0FBRyxJQUFJLG1EQUFtRCxTQUFTLFVBQVUsVUFBVSxRQUFRO0FBQUEsSUFDakc7QUFBQSxFQUNGO0FBQUEsRUFFUSxrQkFBa0IsZ0JBQWdDO0FBQ3hELFVBQU0sTUFBTSxLQUFLLFlBQVk7QUFDN0IsVUFBTSxLQUFLLElBQUksSUFBSTtBQUNuQixVQUFNLGFBQWEsQ0FBQyxnQkFBZ0IsMEJBQTBCLHVCQUF1QixNQUFNO0FBRTNGLGVBQVcsS0FBSyxZQUFZO0FBQzFCLFVBQUksQ0FBQyxFQUFHO0FBQ1IsVUFBSSxNQUFNLE9BQVEsUUFBTztBQUN6QixVQUFJLEdBQUcsV0FBVyxDQUFDLEVBQUcsUUFBTztBQUFBLElBQy9CO0FBRUEsVUFBTSxJQUFJLE1BQU0sbUVBQW1FO0FBQUEsRUFDckY7QUFBQSxFQUVBLE1BQWMsV0FDWixTQUNBLE1BQ0EsV0FDQSxLQUNpQjtBQUNqQixVQUFNLE1BQU0sS0FBSyxZQUFZO0FBQzdCLFVBQU0sS0FBSyxJQUFJLGVBQWU7QUFFOUIsV0FBTyxNQUFNLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUM1QyxZQUFNLFFBQVEsR0FBRyxNQUFNLFNBQVMsTUFBTTtBQUFBLFFBQ3BDO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxLQUFLLFFBQVE7QUFBQSxNQUNmLENBQUM7QUFFRCxVQUFJLFNBQVM7QUFDYixVQUFJLFNBQVM7QUFFYixZQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBZSxVQUFVLEVBQUUsU0FBUyxNQUFNLENBQUU7QUFDdEUsWUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQWUsVUFBVSxFQUFFLFNBQVMsTUFBTSxDQUFFO0FBQ3RFLFlBQU0sR0FBRyxTQUFTLENBQUMsUUFBK0I7QUFDaEQsWUFBSSxLQUFLLFNBQVMsVUFBVTtBQUMxQixpQkFBTyxJQUFJLE1BQU0sR0FBRyxPQUFPLHlEQUF5RCxDQUFDO0FBQ3JGO0FBQUEsUUFDRjtBQUNBLGVBQU8sR0FBRztBQUFBLE1BQ1osQ0FBQztBQUNELFlBQU0sR0FBRyxTQUFTLENBQUMsU0FBUztBQUMxQixZQUFJLFNBQVMsRUFBRyxTQUFRLE9BQU8sS0FBSyxDQUFDO0FBQUEsWUFDaEMsUUFBTyxJQUFJLE1BQU0sR0FBRyxPQUFPLFdBQVcsSUFBSSxLQUFLLFVBQVUsTUFBTSxFQUFFLENBQUM7QUFBQSxNQUN6RSxDQUFDO0FBRUQsVUFBSSxhQUFhLE1BQU0sT0FBTztBQUM1QixjQUFNLE1BQU0sTUFBTSxTQUFTO0FBQUEsTUFDN0I7QUFDQSxZQUFNLE9BQU8sSUFBSTtBQUFBLElBQ25CLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxjQUFjO0FBQ3BCLFVBQU0sTUFBTyxPQUFnRDtBQUM3RCxRQUFJLENBQUMsS0FBSztBQUNSLFlBQU0sSUFBSSxNQUFNLG9FQUFvRTtBQUFBLElBQ3RGO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFBQSxFQUVRLFdBQVcsR0FBaUI7QUFDbEMsV0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEdBQUcsRUFBRTtBQUFBLEVBQ3BDO0FBQ0Y7QUFFQSxJQUFNLDJCQUFOLGNBQXVDLGlDQUFpQjtBQUFBLEVBR3RELFlBQVksS0FBVSxRQUE4QjtBQUNsRCxVQUFNLEtBQUssTUFBTTtBQUNqQixTQUFLLFNBQVM7QUFBQSxFQUNoQjtBQUFBLEVBRUEsVUFBZ0I7QUFDZCxVQUFNLEVBQUUsWUFBWSxJQUFJO0FBQ3hCLGdCQUFZLE1BQU07QUFFbEIsZ0JBQVksU0FBUyxNQUFNLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUV0RCxRQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSw0QkFBNEIsRUFDcEMsUUFBUSxxQ0FBcUMsRUFDN0M7QUFBQSxNQUFRLENBQUMsU0FDUixLQUNHLFNBQVMsT0FBTyxLQUFLLE9BQU8sU0FBUyxpQkFBaUIsQ0FBQyxFQUN2RCxTQUFTLE9BQU8sVUFBVTtBQUN6QixjQUFNLElBQUksT0FBTyxLQUFLO0FBQ3RCLFlBQUksQ0FBQyxPQUFPLE1BQU0sQ0FBQyxLQUFLLElBQUksR0FBRztBQUM3QixlQUFLLE9BQU8sU0FBUyxvQkFBb0I7QUFDekMsZ0JBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxRQUNqQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0w7QUFFRixRQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxzQkFBc0IsRUFDOUIsUUFBUSxxREFBcUQsRUFDN0Q7QUFBQSxNQUFRLENBQUMsU0FDUixLQUNHLFNBQVMsT0FBTyxLQUFLLE9BQU8sU0FBUyxrQkFBa0IsQ0FBQyxFQUN4RCxTQUFTLE9BQU8sVUFBVTtBQUN6QixjQUFNLElBQUksT0FBTyxLQUFLO0FBQ3RCLFlBQUksQ0FBQyxPQUFPLE1BQU0sQ0FBQyxLQUFLLElBQUksR0FBRztBQUM3QixlQUFLLE9BQU8sU0FBUyxxQkFBcUI7QUFDMUMsZ0JBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxRQUNqQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0w7QUFFRixRQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxhQUFhLEVBQ3JCLFFBQVEsNERBQTRELEVBQ3BFO0FBQUEsTUFBWSxDQUFDLE9BQ1osR0FDRyxVQUFVLGFBQWEsMEJBQTBCLEVBQ2pELFVBQVUsVUFBVSxZQUFZLEVBQ2hDLFVBQVUsWUFBWSx1QkFBdUIsRUFDN0MsU0FBUyxLQUFLLE9BQU8sU0FBUyxVQUFVLEVBQ3hDLFNBQVMsT0FBTyxVQUFzQjtBQUNyQyxhQUFLLE9BQU8sU0FBUyxhQUFhO0FBQ2xDLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFDL0IsYUFBSyxRQUFRO0FBQUEsTUFDZixDQUFDO0FBQUEsSUFDTDtBQUVGLFFBQUksS0FBSyxPQUFPLFNBQVMsZUFBZSxhQUFhO0FBQ25ELFVBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLFdBQVcsRUFDbkIsUUFBUSxtQ0FBbUMsRUFDM0M7QUFBQSxRQUFZLENBQUMsT0FDWixHQUNHLFVBQVUsU0FBUyxPQUFPLEVBQzFCLFVBQVUsVUFBVSxRQUFRLEVBQzVCLFNBQVMsS0FBSyxPQUFPLFNBQVMsUUFBUSxFQUN0QyxTQUFTLE9BQU8sVUFBb0I7QUFDbkMsZUFBSyxPQUFPLFNBQVMsV0FBVztBQUNoQyxnQkFBTSxLQUFLLE9BQU8sYUFBYTtBQUMvQixlQUFLLFFBQVE7QUFBQSxRQUNmLENBQUM7QUFBQSxNQUNMO0FBRUYsVUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsc0JBQXNCLEVBQzlCLFFBQVEseUVBQXlFLEVBQ2pGO0FBQUEsUUFBVSxDQUFDLFdBQ1YsT0FDRyxTQUFTLEtBQUssT0FBTyxTQUFTLGFBQWEsRUFDM0MsU0FBUyxPQUFPLFVBQVU7QUFDekIsZUFBSyxPQUFPLFNBQVMsZ0JBQWdCO0FBQ3JDLGdCQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsUUFDakMsQ0FBQztBQUFBLE1BQ0w7QUFFRixVQUFJLEtBQUssT0FBTyxTQUFTLGFBQWEsU0FBUztBQUM3QyxZQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxtQkFBbUIsRUFDM0IsUUFBUSxxRUFBcUUsRUFDN0U7QUFBQSxVQUFRLENBQUMsU0FDUixLQUNHLGVBQWUsa0NBQWtDLEVBQ2pELFNBQVMsS0FBSyxPQUFPLFNBQVMsU0FBUyxFQUN2QyxTQUFTLE9BQU8sVUFBVTtBQUN6QixpQkFBSyxPQUFPLFNBQVMsWUFBWSxNQUFNLEtBQUs7QUFDNUMsa0JBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxVQUNqQyxDQUFDO0FBQUEsUUFDTDtBQUVGLFlBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLDhCQUE4QixFQUN0QyxRQUFRLCtEQUErRCxFQUN2RTtBQUFBLFVBQVEsQ0FBQyxTQUNSLEtBQ0csZUFBZSx3QkFBd0IsRUFDdkMsU0FBUyxLQUFLLE9BQU8sU0FBUyxRQUFRLEVBQ3RDLFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGlCQUFLLE9BQU8sU0FBUyxXQUFXLE1BQU0sS0FBSztBQUMzQyxrQkFBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLFVBQ2pDLENBQUM7QUFBQSxRQUNMO0FBRUYsWUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsd0JBQXdCLEVBQ2hDO0FBQUEsVUFBUSxDQUFDLFNBQ1IsS0FDRyxlQUFlLGtCQUFrQixFQUNqQyxTQUFTLEtBQUssT0FBTyxTQUFTLFVBQVUsRUFDeEMsU0FBUyxPQUFPLFVBQVU7QUFDekIsaUJBQUssT0FBTyxTQUFTLGFBQWEsTUFBTSxLQUFLO0FBQzdDLGtCQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsVUFDakMsQ0FBQztBQUFBLFFBQ0w7QUFBQSxNQUNKLE9BQU87QUFDTCxZQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxvQkFBb0IsRUFDNUIsUUFBUSxxRUFBcUUsRUFDN0U7QUFBQSxVQUFRLENBQUMsU0FDUixLQUNHLGVBQWUsOEJBQThCLEVBQzdDLFNBQVMsS0FBSyxPQUFPLFNBQVMsVUFBVSxFQUN4QyxTQUFTLE9BQU8sVUFBVTtBQUN6QixpQkFBSyxPQUFPLFNBQVMsYUFBYSxNQUFNLEtBQUs7QUFDN0Msa0JBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxVQUNqQyxDQUFDO0FBQUEsUUFDTDtBQUVGLFlBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLHlCQUF5QixFQUNqQztBQUFBLFVBQVEsQ0FBQyxTQUNSLEtBQ0csZUFBZSxhQUFhLEVBQzVCLFNBQVMsS0FBSyxPQUFPLFNBQVMsV0FBVyxFQUN6QyxTQUFTLE9BQU8sVUFBVTtBQUN6QixpQkFBSyxPQUFPLFNBQVMsY0FBYyxNQUFNLEtBQUs7QUFDOUMsa0JBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxVQUNqQyxDQUFDO0FBQUEsUUFDTDtBQUFBLE1BQ0o7QUFBQSxJQUNGO0FBRUEsUUFBSSxLQUFLLE9BQU8sU0FBUyxlQUFlLFVBQVU7QUFDaEQsVUFBSSx3QkFBUSxXQUFXLEVBQ3BCLFFBQVEsZ0JBQWdCLEVBQ3hCO0FBQUEsUUFBUSxDQUFDLFNBQ1IsS0FDRyxlQUFlLFFBQVEsRUFDdkIsU0FBUyxLQUFLLE9BQU8sU0FBUyxZQUFZLEVBQzFDLFNBQVMsT0FBTyxVQUFVO0FBQ3pCLGVBQUssT0FBTyxTQUFTLGVBQWUsTUFBTSxLQUFLO0FBQy9DLGdCQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsUUFDakMsQ0FBQztBQUFBLE1BQ0w7QUFFRixVQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxjQUFjLEVBQ3RCO0FBQUEsUUFBUSxDQUFDLFNBQ1IsS0FDRyxTQUFTLEtBQUssT0FBTyxTQUFTLFdBQVcsRUFDekMsU0FBUyxPQUFPLFVBQVU7QUFDekIsZUFBSyxPQUFPLFNBQVMsY0FBYyxNQUFNLEtBQUssS0FBSztBQUNuRCxnQkFBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLFFBQ2pDLENBQUM7QUFBQSxNQUNMO0FBQUEsSUFDSjtBQUVBLFFBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLGNBQWMsRUFDdEIsUUFBUSxtQ0FBbUMsRUFDM0M7QUFBQSxNQUFZLENBQUMsU0FDWixLQUNHLFNBQVMsS0FBSyxPQUFPLFNBQVMsV0FBVyxFQUN6QyxTQUFTLE9BQU8sVUFBVTtBQUN6QixhQUFLLE9BQU8sU0FBUyxjQUFjO0FBQ25DLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDTDtBQUVGLFFBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLFNBQVMsRUFDakIsUUFBUSxvREFBb0QsRUFDNUQ7QUFBQSxNQUFVLENBQUMsUUFDVixJQUFJLGNBQWMsZUFBZSxFQUFFLFFBQVEsWUFBWTtBQUNyRCxjQUFNLFFBQVEsTUFBTSxLQUFLLE9BQU8sYUFBYTtBQUM3QyxZQUFJLHVCQUFPLDRCQUE0QixLQUFLLFVBQVU7QUFBQSxNQUN4RCxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0o7QUFDRjsiLAogICJuYW1lcyI6IFtdCn0K
