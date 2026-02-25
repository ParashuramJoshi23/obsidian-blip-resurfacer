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

// lib.ts
async function detectBinary(name, exec, home = "") {
  const extraPaths = [
    home && `${home}/.npm-global/bin`,
    home && `${home}/.local/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin"
  ].filter(Boolean).join(":");
  try {
    const found = (await exec(`PATH="${extraPaths}:$PATH" which ${name}`)).trim();
    if (found) return found;
  } catch {
  }
  return name;
}
function parsePackFromText(rawText) {
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
function generateFallback(title, noteContent) {
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
function buildPrompt(userContext, title, noteContent) {
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
function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

// main.ts
var DEFAULT_SETTINGS = {
  maxDailyResurface: 3,
  reviewIntervalDays: 2,
  aiProvider: "local-cli",
  localCli: "claude",
  strictLocalAi: true,
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  userContext: "User is an experienced backend engineer. Prefer concrete, small next steps and practical mini-POCs."
};
var BlipResurfacerPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.binaryCache = /* @__PURE__ */ new Map();
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "resurface-blips-now",
      name: "Resurface current blip",
      callback: async () => {
        const name = await this.resurfaceCurrentBlip();
        if (!name) new import_obsidian.Notice("Blip Resurfacer: no blip file found.");
        else new import_obsidian.Notice(`Blip Resurfacer: updated "${name}"`);
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
          new import_obsidian.Notice(
            `Local AI OK (${this.settings.localCli}). Insight: ${pack.insight.slice(0, 80)}...`
          );
        } catch (e) {
          new import_obsidian.Notice(
            `Local AI failed (${this.settings.localCli}): ${String(e?.message || e).slice(0, 140)}`
          );
        }
      }
    });
    this.addSettingTab(new BlipResurfacerSettingTab(this.app, this));
  }
  async loadSettings() {
    const saved = await this.loadData();
    const loaded = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (typeof loaded.aiEnabled === "boolean") {
      if (!loaded.aiEnabled) loaded.aiProvider = "fallback";
      else if (loaded.aiProvider === "fallback") loaded.aiProvider = "local-cli";
    }
    this.settings = loaded;
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /**
   * Returns the file to resurface: the active file if it's a blip,
   * otherwise the oldest (least recently reviewed) blip in the vault.
   */
  async pickBlipFile() {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && this.isBlipFile(activeFile)) {
      return activeFile;
    }
    const blips = await this.getBlipFiles();
    return blips[0] ?? null;
  }
  isBlipFile(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return !!fm && String(fm.type ?? "").toLowerCase() === "blip";
  }
  async getBlipFiles() {
    const all = this.app.vault.getMarkdownFiles();
    const withMeta = [];
    for (const file of all) {
      if (!this.isBlipFile(file)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const reviewedRaw = String(fm?.blip_last_reviewed ?? "");
      const reviewedTs = reviewedRaw ? Date.parse(reviewedRaw) : 0;
      withMeta.push({ file, reviewedAt: Number.isNaN(reviewedTs) ? 0 : reviewedTs });
    }
    return withMeta.sort((a, b) => {
      if (a.reviewedAt !== b.reviewedAt) return a.reviewedAt - b.reviewedAt;
      return a.file.stat.mtime - b.file.stat.mtime;
    }).map((x) => x.file);
  }
  /** Resurface current blip: active file if it's a blip, else oldest unreviewed blip. */
  async resurfaceCurrentBlip() {
    const file = await this.pickBlipFile();
    if (!file) return null;
    await this.resurfaceFile(file);
    return file.basename;
  }
  async resurfaceFile(file) {
    const text = await this.app.vault.read(file);
    const pack = await this.generateBlipPack(file.basename, text);
    await this.updateBlipFrontmatter(file);
    await this.appendBlipUpdate(file, pack);
  }
  async updateBlipFrontmatter(file) {
    const today = formatDate(/* @__PURE__ */ new Date());
    const next = /* @__PURE__ */ new Date();
    next.setDate(next.getDate() + this.settings.reviewIntervalDays);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.type = "blip";
      fm.blip_status = fm.blip_status ?? "awareness";
      fm.blip_created = fm.blip_created ?? today;
      fm.blip_last_reviewed = today;
      fm.blip_next_review = formatDate(next);
      fm.blip_resurface_count = Number(fm.blip_resurface_count ?? 0) + 1;
    });
  }
  async appendBlipUpdate(file, pack) {
    const dateStr = formatDate(/* @__PURE__ */ new Date());
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
    await this.app.vault.modify(file, `${content.trimEnd()}

${sectionHeader}

${entry}`);
  }
  async generateBlipPack(title, noteContent) {
    if (this.settings.aiProvider === "local-cli") {
      try {
        return await this.generateViaLocalCli(title, noteContent);
      } catch (e) {
        const msg = String(e?.message || e);
        console.error("Blip Resurfacer local CLI failed", e);
        new import_obsidian.Notice(
          `Blip Resurfacer: local ${this.settings.localCli} failed (${msg.slice(0, 120)})`
        );
        if (this.settings.strictLocalAi) throw e;
      }
    }
    if (this.settings.aiProvider === "openai" && this.settings.openaiApiKey.trim()) {
      try {
        return await this.generateViaOpenAI(title, noteContent);
      } catch (e) {
        console.error("Blip Resurfacer OpenAI failed, using fallback", e);
      }
    }
    return generateFallback(title, noteContent);
  }
  async generateViaLocalCli(title, noteContent) {
    const prompt = buildPrompt(this.settings.userContext, title, noteContent);
    const vaultPath = this.app.vault.adapter.getBasePath();
    const req = this.nodeRequire();
    const fs = req("fs");
    let stdout = "";
    if (this.settings.localCli === "codex") {
      const os = req("os");
      const codexBin = await this.resolveBin("codex");
      const outPath = `${os.tmpdir()}/blip-resurfacer-${Date.now()}.json`;
      const schemaPath = `${os.tmpdir()}/blip-resurfacer-schema-${Date.now()}.json`;
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
      const nodeBin = await this.resolveBin("node");
      await this.runCommand(nodeBin, [codexBin, ...args], prompt, vaultPath);
      stdout = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      if (fs.existsSync(schemaPath)) fs.unlinkSync(schemaPath);
    } else {
      const claudeBin = await this.resolveBin("claude");
      stdout = await this.runCommand(claudeBin, ["-p", "--output-format", "text", prompt], void 0, vaultPath);
    }
    return parsePackFromText(stdout);
  }
  async generateViaOpenAI(title, noteContent) {
    const prompt = buildPrompt(this.settings.userContext, title, noteContent);
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
    return parsePackFromText(raw);
  }
  /** Resolve a binary once and cache for the lifetime of the plugin. */
  async resolveBin(name) {
    if (!this.binaryCache.has(name)) {
      const req = this.nodeRequire();
      const cp = req("child_process");
      const home = process.env.HOME ?? "";
      const found = await detectBinary(
        name,
        (cmd) => new Promise(
          (res, rej) => cp.exec(cmd, (err, stdout) => err ? rej(err) : res(stdout))
        ),
        home
      );
      this.binaryCache.set(name, found);
    }
    return this.binaryCache.get(name);
  }
  async runCommand(command, args, stdinText, cwd) {
    const req = this.nodeRequire();
    const cp = req("child_process");
    const env = { ...process.env };
    delete env["CLAUDECODE"];
    return new Promise((resolve, reject) => {
      const child = cp.spawn(command, args, { cwd, shell: false, env });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => stdout += d.toString("utf8"));
      child.stderr?.on("data", (d) => stderr += d.toString("utf8"));
      child.on("error", (err) => {
        if (err?.code === "ENOENT") {
          reject(new Error(`${command} not found (ENOENT). Check that ${command} is installed.`));
          return;
        }
        reject(err);
      });
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
      });
      if (stdinText && child.stdin) child.stdin.write(stdinText);
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
    new import_obsidian.Setting(containerEl).setName("Max daily resurfaced blips").setDesc("How many blips the scheduled cron job resurfaces per day").addText(
      (text) => text.setValue(String(this.plugin.settings.maxDailyResurface)).onChange(async (value) => {
        const n = Number(value);
        if (!Number.isNaN(n) && n > 0) {
          this.plugin.settings.maxDailyResurface = n;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("AI provider").setDesc("Local CLI uses Codex or Claude Code installed on this machine.").addDropdown(
      (dd) => dd.addOption("local-cli", "Local CLI (Codex / Claude)").addOption("openai", "OpenAI API").addOption("fallback", "Fallback only (rule-based)").setValue(this.plugin.settings.aiProvider).onChange(async (value) => {
        this.plugin.settings.aiProvider = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    if (this.plugin.settings.aiProvider === "local-cli") {
      new import_obsidian.Setting(containerEl).setName("Local CLI").setDesc("CLI binary to call. The plugin auto-detects the path via which.").addDropdown(
        (dd) => dd.addOption("claude", "Claude Code").addOption("codex", "Codex").setValue(this.plugin.settings.localCli).onChange(async (value) => {
          this.plugin.settings.localCli = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );
      new import_obsidian.Setting(containerEl).setName("Strict local AI mode").setDesc("Stop the run if the local CLI fails instead of falling back to rule-based output").addToggle(
        (toggle) => toggle.setValue(this.plugin.settings.strictLocalAi).onChange(async (value) => {
          this.plugin.settings.strictLocalAi = value;
          await this.plugin.saveSettings();
        })
      );
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
    new import_obsidian.Setting(containerEl).setName("User context").setDesc("Appended to every AI prompt to tailor next steps").addTextArea(
      (text) => text.setValue(this.plugin.settings.userContext).onChange(async (value) => {
        this.plugin.settings.userContext = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Resurface current blip").setDesc(
      "Resurfaces the currently open blip note, or the oldest unreviewed blip if none is open"
    ).addButton(
      (btn) => btn.setButtonText("Run now").onClick(async () => {
        const name = await this.plugin.resurfaceCurrentBlip();
        if (!name) new import_obsidian.Notice("Blip Resurfacer: no blip file found.");
        else new import_obsidian.Notice(`Blip Resurfacer: updated "${name}"`);
      })
    );
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyIsICJsaWIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgTm90aWNlLFxuICBQbHVnaW4sXG4gIFBsdWdpblNldHRpbmdUYWIsXG4gIFNldHRpbmcsXG4gIFRGaWxlLFxuICByZXF1ZXN0VXJsXG59IGZyb20gJ29ic2lkaWFuJztcbmltcG9ydCB7XG4gIEJsaXBQYWNrLFxuICBMb2NhbENsaSxcbiAgYnVpbGRQcm9tcHQsXG4gIGRldGVjdEJpbmFyeSxcbiAgZm9ybWF0RGF0ZSxcbiAgZ2VuZXJhdGVGYWxsYmFjayxcbiAgcGFyc2VQYWNrRnJvbVRleHRcbn0gZnJvbSAnLi9saWInO1xuXG50eXBlIEFpUHJvdmlkZXIgPSAnbG9jYWwtY2xpJyB8ICdvcGVuYWknIHwgJ2ZhbGxiYWNrJztcblxuaW50ZXJmYWNlIEJsaXBSZXN1cmZhY2VyU2V0dGluZ3Mge1xuICBtYXhEYWlseVJlc3VyZmFjZTogbnVtYmVyO1xuICByZXZpZXdJbnRlcnZhbERheXM6IG51bWJlcjtcbiAgYWlQcm92aWRlcjogQWlQcm92aWRlcjtcbiAgbG9jYWxDbGk6IExvY2FsQ2xpO1xuICBzdHJpY3RMb2NhbEFpOiBib29sZWFuO1xuICBvcGVuYWlBcGlLZXk6IHN0cmluZztcbiAgb3BlbmFpTW9kZWw6IHN0cmluZztcbiAgdXNlckNvbnRleHQ6IHN0cmluZztcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogQmxpcFJlc3VyZmFjZXJTZXR0aW5ncyA9IHtcbiAgbWF4RGFpbHlSZXN1cmZhY2U6IDMsXG4gIHJldmlld0ludGVydmFsRGF5czogMixcbiAgYWlQcm92aWRlcjogJ2xvY2FsLWNsaScsXG4gIGxvY2FsQ2xpOiAnY2xhdWRlJyxcbiAgc3RyaWN0TG9jYWxBaTogdHJ1ZSxcbiAgb3BlbmFpQXBpS2V5OiAnJyxcbiAgb3BlbmFpTW9kZWw6ICdncHQtNG8tbWluaScsXG4gIHVzZXJDb250ZXh0OlxuICAgICdVc2VyIGlzIGFuIGV4cGVyaWVuY2VkIGJhY2tlbmQgZW5naW5lZXIuIFByZWZlciBjb25jcmV0ZSwgc21hbGwgbmV4dCBzdGVwcyBhbmQgcHJhY3RpY2FsIG1pbmktUE9Dcy4nXG59O1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCbGlwUmVzdXJmYWNlclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHNldHRpbmdzOiBCbGlwUmVzdXJmYWNlclNldHRpbmdzID0gREVGQVVMVF9TRVRUSU5HUztcbiAgcHJpdmF0ZSBiaW5hcnlDYWNoZTogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogJ3Jlc3VyZmFjZS1ibGlwcy1ub3cnLFxuICAgICAgbmFtZTogJ1Jlc3VyZmFjZSBjdXJyZW50IGJsaXAnLFxuICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgbmFtZSA9IGF3YWl0IHRoaXMucmVzdXJmYWNlQ3VycmVudEJsaXAoKTtcbiAgICAgICAgaWYgKCFuYW1lKSBuZXcgTm90aWNlKCdCbGlwIFJlc3VyZmFjZXI6IG5vIGJsaXAgZmlsZSBmb3VuZC4nKTtcbiAgICAgICAgZWxzZSBuZXcgTm90aWNlKGBCbGlwIFJlc3VyZmFjZXI6IHVwZGF0ZWQgXCIke25hbWV9XCJgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogJ3Rlc3QtbG9jYWwtYWktYmFja2VuZCcsXG4gICAgICBuYW1lOiAnVGVzdCBsb2NhbCBBSSBiYWNrZW5kIChDb2RleC9DbGF1ZGUpJyxcbiAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcGFjayA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVWaWFMb2NhbENsaShcbiAgICAgICAgICAgICdCYWNrZW5kIGNvbm5lY3Rpdml0eSB0ZXN0JyxcbiAgICAgICAgICAgICdDcmVhdGUgb25lIGluc2lnaHQgYW5kIHR3byBwcmFjdGljYWwgc3RlcHMgYWJvdXQgbGVhcm5pbmcgS2Fma2Egb3ZlciBUQ1AuJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICAgIGBMb2NhbCBBSSBPSyAoJHt0aGlzLnNldHRpbmdzLmxvY2FsQ2xpfSkuIEluc2lnaHQ6ICR7cGFjay5pbnNpZ2h0LnNsaWNlKDAsIDgwKX0uLi5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgICBgTG9jYWwgQUkgZmFpbGVkICgke3RoaXMuc2V0dGluZ3MubG9jYWxDbGl9KTogJHtTdHJpbmcoKGUgYXMgRXJyb3IpPy5tZXNzYWdlIHx8IGUpLnNsaWNlKDAsIDE0MCl9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgQmxpcFJlc3VyZmFjZXJTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG4gIH1cblxuICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG4gICAgY29uc3Qgc2F2ZWQgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XG4gICAgY29uc3QgbG9hZGVkID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgc2F2ZWQpIGFzIEJsaXBSZXN1cmZhY2VyU2V0dGluZ3MgJiB7XG4gICAgICBhaUVuYWJsZWQ/OiBib29sZWFuO1xuICAgIH07XG5cbiAgICAvLyBMZWdhY3kgbWlncmF0aW9uIGZyb20gdjAuMS4wIGFpRW5hYmxlZCBrZXlcbiAgICBpZiAodHlwZW9mIGxvYWRlZC5haUVuYWJsZWQgPT09ICdib29sZWFuJykge1xuICAgICAgaWYgKCFsb2FkZWQuYWlFbmFibGVkKSBsb2FkZWQuYWlQcm92aWRlciA9ICdmYWxsYmFjayc7XG4gICAgICBlbHNlIGlmIChsb2FkZWQuYWlQcm92aWRlciA9PT0gJ2ZhbGxiYWNrJykgbG9hZGVkLmFpUHJvdmlkZXIgPSAnbG9jYWwtY2xpJztcbiAgICB9XG5cbiAgICB0aGlzLnNldHRpbmdzID0gbG9hZGVkO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgZmlsZSB0byByZXN1cmZhY2U6IHRoZSBhY3RpdmUgZmlsZSBpZiBpdCdzIGEgYmxpcCxcbiAgICogb3RoZXJ3aXNlIHRoZSBvbGRlc3QgKGxlYXN0IHJlY2VudGx5IHJldmlld2VkKSBibGlwIGluIHRoZSB2YXVsdC5cbiAgICovXG4gIHByaXZhdGUgYXN5bmMgcGlja0JsaXBGaWxlKCk6IFByb21pc2U8VEZpbGUgfCBudWxsPiB7XG4gICAgY29uc3QgYWN0aXZlRmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgaWYgKGFjdGl2ZUZpbGUgJiYgdGhpcy5pc0JsaXBGaWxlKGFjdGl2ZUZpbGUpKSB7XG4gICAgICByZXR1cm4gYWN0aXZlRmlsZTtcbiAgICB9XG4gICAgY29uc3QgYmxpcHMgPSBhd2FpdCB0aGlzLmdldEJsaXBGaWxlcygpO1xuICAgIHJldHVybiBibGlwc1swXSA/PyBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBpc0JsaXBGaWxlKGZpbGU6IFRGaWxlKTogYm9vbGVhbiB7XG4gICAgY29uc3QgZm0gPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKT8uZnJvbnRtYXR0ZXIgYXNcbiAgICAgIHwgUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbiAgICAgIHwgdW5kZWZpbmVkO1xuICAgIHJldHVybiAhIWZtICYmIFN0cmluZyhmbS50eXBlID8/ICcnKS50b0xvd2VyQ2FzZSgpID09PSAnYmxpcCc7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGdldEJsaXBGaWxlcygpOiBQcm9taXNlPFRGaWxlW10+IHtcbiAgICBjb25zdCBhbGwgPSB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCk7XG4gICAgY29uc3Qgd2l0aE1ldGE6IEFycmF5PHsgZmlsZTogVEZpbGU7IHJldmlld2VkQXQ6IG51bWJlciB9PiA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBmaWxlIG9mIGFsbCkge1xuICAgICAgaWYgKCF0aGlzLmlzQmxpcEZpbGUoZmlsZSkpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgZm0gPSB0aGlzLmFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKT8uZnJvbnRtYXR0ZXIgYXNcbiAgICAgICAgfCBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuICAgICAgICB8IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IHJldmlld2VkUmF3ID0gU3RyaW5nKGZtPy5ibGlwX2xhc3RfcmV2aWV3ZWQgPz8gJycpO1xuICAgICAgY29uc3QgcmV2aWV3ZWRUcyA9IHJldmlld2VkUmF3ID8gRGF0ZS5wYXJzZShyZXZpZXdlZFJhdykgOiAwO1xuICAgICAgd2l0aE1ldGEucHVzaCh7IGZpbGUsIHJldmlld2VkQXQ6IE51bWJlci5pc05hTihyZXZpZXdlZFRzKSA/IDAgOiByZXZpZXdlZFRzIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB3aXRoTWV0YVxuICAgICAgLnNvcnQoKGEsIGIpID0+IHtcbiAgICAgICAgaWYgKGEucmV2aWV3ZWRBdCAhPT0gYi5yZXZpZXdlZEF0KSByZXR1cm4gYS5yZXZpZXdlZEF0IC0gYi5yZXZpZXdlZEF0O1xuICAgICAgICByZXR1cm4gYS5maWxlLnN0YXQubXRpbWUgLSBiLmZpbGUuc3RhdC5tdGltZTtcbiAgICAgIH0pXG4gICAgICAubWFwKCh4KSA9PiB4LmZpbGUpO1xuICB9XG5cbiAgLyoqIFJlc3VyZmFjZSBjdXJyZW50IGJsaXA6IGFjdGl2ZSBmaWxlIGlmIGl0J3MgYSBibGlwLCBlbHNlIG9sZGVzdCB1bnJldmlld2VkIGJsaXAuICovXG4gIGFzeW5jIHJlc3VyZmFjZUN1cnJlbnRCbGlwKCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIGNvbnN0IGZpbGUgPSBhd2FpdCB0aGlzLnBpY2tCbGlwRmlsZSgpO1xuICAgIGlmICghZmlsZSkgcmV0dXJuIG51bGw7XG4gICAgYXdhaXQgdGhpcy5yZXN1cmZhY2VGaWxlKGZpbGUpO1xuICAgIHJldHVybiBmaWxlLmJhc2VuYW1lO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZXN1cmZhY2VGaWxlKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgY29uc3QgcGFjayA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVCbGlwUGFjayhmaWxlLmJhc2VuYW1lLCB0ZXh0KTtcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZUJsaXBGcm9udG1hdHRlcihmaWxlKTtcbiAgICBhd2FpdCB0aGlzLmFwcGVuZEJsaXBVcGRhdGUoZmlsZSwgcGFjayk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHVwZGF0ZUJsaXBGcm9udG1hdHRlcihmaWxlOiBURmlsZSkge1xuICAgIGNvbnN0IHRvZGF5ID0gZm9ybWF0RGF0ZShuZXcgRGF0ZSgpKTtcbiAgICBjb25zdCBuZXh0ID0gbmV3IERhdGUoKTtcbiAgICBuZXh0LnNldERhdGUobmV4dC5nZXREYXRlKCkgKyB0aGlzLnNldHRpbmdzLnJldmlld0ludGVydmFsRGF5cyk7XG5cbiAgICBhd2FpdCB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgKGZtOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4ge1xuICAgICAgZm0udHlwZSA9ICdibGlwJztcbiAgICAgIGZtLmJsaXBfc3RhdHVzID0gZm0uYmxpcF9zdGF0dXMgPz8gJ2F3YXJlbmVzcyc7XG4gICAgICBmbS5ibGlwX2NyZWF0ZWQgPSBmbS5ibGlwX2NyZWF0ZWQgPz8gdG9kYXk7XG4gICAgICBmbS5ibGlwX2xhc3RfcmV2aWV3ZWQgPSB0b2RheTtcbiAgICAgIGZtLmJsaXBfbmV4dF9yZXZpZXcgPSBmb3JtYXREYXRlKG5leHQpO1xuICAgICAgZm0uYmxpcF9yZXN1cmZhY2VfY291bnQgPSBOdW1iZXIoZm0uYmxpcF9yZXN1cmZhY2VfY291bnQgPz8gMCkgKyAxO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBhcHBlbmRCbGlwVXBkYXRlKGZpbGU6IFRGaWxlLCBwYWNrOiBCbGlwUGFjaykge1xuICAgIGNvbnN0IGRhdGVTdHIgPSBmb3JtYXREYXRlKG5ldyBEYXRlKCkpO1xuICAgIGNvbnN0IHNlY3Rpb25IZWFkZXIgPSAnIyMgQmxpcCB1cGRhdGVzIChDbGF3ZCknO1xuXG4gICAgY29uc3QgZW50cnkgPSBbXG4gICAgICBgIyMjICR7ZGF0ZVN0cn1gLFxuICAgICAgYC0gR2VuZXJhdGVkIGJ5OiAke3RoaXMuc2V0dGluZ3MuYWlQcm92aWRlciA9PT0gJ2xvY2FsLWNsaScgPyB0aGlzLnNldHRpbmdzLmxvY2FsQ2xpIDogdGhpcy5zZXR0aW5ncy5haVByb3ZpZGVyfWAsXG4gICAgICBgLSBJbnNpZ2h0OiAke3BhY2suaW5zaWdodH1gLFxuICAgICAgYC0gTmV4dCBxdWFsaXR5IHN0ZXBzOmAsXG4gICAgICAuLi5wYWNrLm5leHRTdGVwcy5tYXAoKHMpID0+IGAgIC0gJHtzfWApLFxuICAgICAgYC0gUmVtaW5kZXI6ICR7cGFjay5yZW1pbmRlcn1gLFxuICAgICAgJydcbiAgICBdLmpvaW4oJ1xcbicpO1xuXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG5cbiAgICBpZiAoY29udGVudC5pbmNsdWRlcyhzZWN0aW9uSGVhZGVyKSkge1xuICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIGAke2NvbnRlbnQudHJpbUVuZCgpfVxcblxcbiR7ZW50cnl9YCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIGAke2NvbnRlbnQudHJpbUVuZCgpfVxcblxcbiR7c2VjdGlvbkhlYWRlcn1cXG5cXG4ke2VudHJ5fWApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZUJsaXBQYWNrKHRpdGxlOiBzdHJpbmcsIG5vdGVDb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPEJsaXBQYWNrPiB7XG4gICAgaWYgKHRoaXMuc2V0dGluZ3MuYWlQcm92aWRlciA9PT0gJ2xvY2FsLWNsaScpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBhd2FpdCB0aGlzLmdlbmVyYXRlVmlhTG9jYWxDbGkodGl0bGUsIG5vdGVDb250ZW50KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc3QgbXNnID0gU3RyaW5nKChlIGFzIEVycm9yKT8ubWVzc2FnZSB8fCBlKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignQmxpcCBSZXN1cmZhY2VyIGxvY2FsIENMSSBmYWlsZWQnLCBlKTtcbiAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICBgQmxpcCBSZXN1cmZhY2VyOiBsb2NhbCAke3RoaXMuc2V0dGluZ3MubG9jYWxDbGl9IGZhaWxlZCAoJHttc2cuc2xpY2UoMCwgMTIwKX0pYFxuICAgICAgICApO1xuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5zdHJpY3RMb2NhbEFpKSB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLnNldHRpbmdzLmFpUHJvdmlkZXIgPT09ICdvcGVuYWknICYmIHRoaXMuc2V0dGluZ3Mub3BlbmFpQXBpS2V5LnRyaW0oKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuZ2VuZXJhdGVWaWFPcGVuQUkodGl0bGUsIG5vdGVDb250ZW50KTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignQmxpcCBSZXN1cmZhY2VyIE9wZW5BSSBmYWlsZWQsIHVzaW5nIGZhbGxiYWNrJywgZSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGdlbmVyYXRlRmFsbGJhY2sodGl0bGUsIG5vdGVDb250ZW50KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVWaWFMb2NhbENsaSh0aXRsZTogc3RyaW5nLCBub3RlQ29udGVudDogc3RyaW5nKTogUHJvbWlzZTxCbGlwUGFjaz4ge1xuICAgIGNvbnN0IHByb21wdCA9IGJ1aWxkUHJvbXB0KHRoaXMuc2V0dGluZ3MudXNlckNvbnRleHQsIHRpdGxlLCBub3RlQ29udGVudCk7XG4gICAgY29uc3QgdmF1bHRQYXRoID0gdGhpcy5hcHAudmF1bHQuYWRhcHRlci5nZXRCYXNlUGF0aCgpO1xuICAgIGNvbnN0IHJlcSA9IHRoaXMubm9kZVJlcXVpcmUoKTtcbiAgICBjb25zdCBmcyA9IHJlcSgnZnMnKSBhcyB0eXBlb2YgaW1wb3J0KCdmcycpO1xuXG4gICAgbGV0IHN0ZG91dCA9ICcnO1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubG9jYWxDbGkgPT09ICdjb2RleCcpIHtcbiAgICAgIGNvbnN0IG9zID0gcmVxKCdvcycpIGFzIHR5cGVvZiBpbXBvcnQoJ29zJyk7XG4gICAgICBjb25zdCBjb2RleEJpbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUJpbignY29kZXgnKTtcbiAgICAgIGNvbnN0IG91dFBhdGggPSBgJHtvcy50bXBkaXIoKX0vYmxpcC1yZXN1cmZhY2VyLSR7RGF0ZS5ub3coKX0uanNvbmA7XG4gICAgICBjb25zdCBzY2hlbWFQYXRoID0gYCR7b3MudG1wZGlyKCl9L2JsaXAtcmVzdXJmYWNlci1zY2hlbWEtJHtEYXRlLm5vdygpfS5qc29uYDtcblxuICAgICAgZnMud3JpdGVGaWxlU3luYyhcbiAgICAgICAgc2NoZW1hUGF0aCxcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICAgICAgICByZXF1aXJlZDogWydpbnNpZ2h0JywgJ25leHRTdGVwcycsICdyZW1pbmRlciddLFxuICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIGluc2lnaHQ6IHsgdHlwZTogJ3N0cmluZycgfSxcbiAgICAgICAgICAgIG5leHRTdGVwczogeyB0eXBlOiAnYXJyYXknLCBtaW5JdGVtczogMiwgbWF4SXRlbXM6IDMsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSxcbiAgICAgICAgICAgIHJlbWluZGVyOiB7IHR5cGU6ICdzdHJpbmcnIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICBjb25zdCBhcmdzID0gW1xuICAgICAgICAnZXhlYycsXG4gICAgICAgICctLXNraXAtZ2l0LXJlcG8tY2hlY2snLFxuICAgICAgICAnLS1vdXRwdXQtc2NoZW1hJyxcbiAgICAgICAgc2NoZW1hUGF0aCxcbiAgICAgICAgJy1DJyxcbiAgICAgICAgdmF1bHRQYXRoLFxuICAgICAgICAnLS1vdXRwdXQtbGFzdC1tZXNzYWdlJyxcbiAgICAgICAgb3V0UGF0aCxcbiAgICAgICAgJy0nXG4gICAgICBdO1xuXG4gICAgICBjb25zdCBub2RlQmluID0gYXdhaXQgdGhpcy5yZXNvbHZlQmluKCdub2RlJyk7XG4gICAgICBhd2FpdCB0aGlzLnJ1bkNvbW1hbmQobm9kZUJpbiwgW2NvZGV4QmluLCAuLi5hcmdzXSwgcHJvbXB0LCB2YXVsdFBhdGgpO1xuICAgICAgc3Rkb3V0ID0gZnMuZXhpc3RzU3luYyhvdXRQYXRoKSA/IGZzLnJlYWRGaWxlU3luYyhvdXRQYXRoLCAndXRmOCcpIDogJyc7XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhvdXRQYXRoKSkgZnMudW5saW5rU3luYyhvdXRQYXRoKTtcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNjaGVtYVBhdGgpKSBmcy51bmxpbmtTeW5jKHNjaGVtYVBhdGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBjbGF1ZGVCaW4gPSBhd2FpdCB0aGlzLnJlc29sdmVCaW4oJ2NsYXVkZScpO1xuICAgICAgc3Rkb3V0ID0gYXdhaXQgdGhpcy5ydW5Db21tYW5kKGNsYXVkZUJpbiwgWyctcCcsICctLW91dHB1dC1mb3JtYXQnLCAndGV4dCcsIHByb21wdF0sIHVuZGVmaW5lZCwgdmF1bHRQYXRoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcGFyc2VQYWNrRnJvbVRleHQoc3Rkb3V0KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgZ2VuZXJhdGVWaWFPcGVuQUkodGl0bGU6IHN0cmluZywgbm90ZUNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8QmxpcFBhY2s+IHtcbiAgICBjb25zdCBwcm9tcHQgPSBidWlsZFByb21wdCh0aGlzLnNldHRpbmdzLnVzZXJDb250ZXh0LCB0aXRsZSwgbm90ZUNvbnRlbnQpO1xuXG4gICAgY29uc3QgcmVzID0gYXdhaXQgcmVxdWVzdFVybCh7XG4gICAgICB1cmw6ICdodHRwczovL2FwaS5vcGVuYWkuY29tL3YxL2NoYXQvY29tcGxldGlvbnMnLFxuICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHt0aGlzLnNldHRpbmdzLm9wZW5haUFwaUtleX1gLFxuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtb2RlbDogdGhpcy5zZXR0aW5ncy5vcGVuYWlNb2RlbCxcbiAgICAgICAgbWVzc2FnZXM6IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogcHJvbXB0IH1dLFxuICAgICAgICB0ZW1wZXJhdHVyZTogMC4yLFxuICAgICAgICByZXNwb25zZV9mb3JtYXQ6IHsgdHlwZTogJ2pzb25fb2JqZWN0JyB9XG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgY29uc3QgcmF3ID0gcmVzLmpzb24/LmNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudCA/PyAne30nO1xuICAgIHJldHVybiBwYXJzZVBhY2tGcm9tVGV4dChyYXcpO1xuICB9XG5cbiAgLyoqIFJlc29sdmUgYSBiaW5hcnkgb25jZSBhbmQgY2FjaGUgZm9yIHRoZSBsaWZldGltZSBvZiB0aGUgcGx1Z2luLiAqL1xuICBwcml2YXRlIGFzeW5jIHJlc29sdmVCaW4obmFtZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBpZiAoIXRoaXMuYmluYXJ5Q2FjaGUuaGFzKG5hbWUpKSB7XG4gICAgICBjb25zdCByZXEgPSB0aGlzLm5vZGVSZXF1aXJlKCk7XG4gICAgICBjb25zdCBjcCA9IHJlcSgnY2hpbGRfcHJvY2VzcycpIGFzIHR5cGVvZiBpbXBvcnQoJ2NoaWxkX3Byb2Nlc3MnKTtcbiAgICAgIGNvbnN0IGhvbWUgPSBwcm9jZXNzLmVudi5IT01FID8/ICcnO1xuICAgICAgY29uc3QgZm91bmQgPSBhd2FpdCBkZXRlY3RCaW5hcnkobmFtZSwgKGNtZCkgPT5cbiAgICAgICAgbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PlxuICAgICAgICAgIGNwLmV4ZWMoY21kLCAoZXJyLCBzdGRvdXQpID0+IChlcnIgPyByZWooZXJyKSA6IHJlcyhzdGRvdXQpKSlcbiAgICAgICAgKSxcbiAgICAgICAgaG9tZVxuICAgICAgKTtcbiAgICAgIHRoaXMuYmluYXJ5Q2FjaGUuc2V0KG5hbWUsIGZvdW5kKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYmluYXJ5Q2FjaGUuZ2V0KG5hbWUpITtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcnVuQ29tbWFuZChcbiAgICBjb21tYW5kOiBzdHJpbmcsXG4gICAgYXJnczogc3RyaW5nW10sXG4gICAgc3RkaW5UZXh0Pzogc3RyaW5nLFxuICAgIGN3ZD86IHN0cmluZ1xuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IHJlcSA9IHRoaXMubm9kZVJlcXVpcmUoKTtcbiAgICBjb25zdCBjcCA9IHJlcSgnY2hpbGRfcHJvY2VzcycpIGFzIHR5cGVvZiBpbXBvcnQoJ2NoaWxkX3Byb2Nlc3MnKTtcblxuICAgIC8vIFN0cmlwIENMQVVERUNPREUgc28gbmVzdGVkIGNsYXVkZSBDTEkgaW52b2NhdGlvbnMgZG9uJ3QgcmVmdXNlIHRvIGxhdW5jaC5cbiAgICBjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52IH07XG4gICAgZGVsZXRlIGVudlsnQ0xBVURFQ09ERSddO1xuXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGNvbnN0IGNoaWxkID0gY3Auc3Bhd24oY29tbWFuZCwgYXJncywgeyBjd2QsIHNoZWxsOiBmYWxzZSwgZW52IH0pO1xuXG4gICAgICBsZXQgc3Rkb3V0ID0gJyc7XG4gICAgICBsZXQgc3RkZXJyID0gJyc7XG5cbiAgICAgIGNoaWxkLnN0ZG91dD8ub24oJ2RhdGEnLCAoZDogQnVmZmVyKSA9PiAoc3Rkb3V0ICs9IGQudG9TdHJpbmcoJ3V0ZjgnKSkpO1xuICAgICAgY2hpbGQuc3RkZXJyPy5vbignZGF0YScsIChkOiBCdWZmZXIpID0+IChzdGRlcnIgKz0gZC50b1N0cmluZygndXRmOCcpKSk7XG4gICAgICBjaGlsZC5vbignZXJyb3InLCAoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IHtcbiAgICAgICAgaWYgKGVycj8uY29kZSA9PT0gJ0VOT0VOVCcpIHtcbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKGAke2NvbW1hbmR9IG5vdCBmb3VuZCAoRU5PRU5UKS4gQ2hlY2sgdGhhdCAke2NvbW1hbmR9IGlzIGluc3RhbGxlZC5gKSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSk7XG4gICAgICBjaGlsZC5vbignY2xvc2UnLCAoY29kZSkgPT4ge1xuICAgICAgICBpZiAoY29kZSA9PT0gMCkgcmVzb2x2ZShzdGRvdXQudHJpbSgpKTtcbiAgICAgICAgZWxzZSByZWplY3QobmV3IEVycm9yKGAke2NvbW1hbmR9IGV4aXRlZCAke2NvZGV9OiAke3N0ZGVyciB8fCBzdGRvdXR9YCkpO1xuICAgICAgfSk7XG5cbiAgICAgIGlmIChzdGRpblRleHQgJiYgY2hpbGQuc3RkaW4pIGNoaWxkLnN0ZGluLndyaXRlKHN0ZGluVGV4dCk7XG4gICAgICBjaGlsZC5zdGRpbj8uZW5kKCk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIG5vZGVSZXF1aXJlKCkge1xuICAgIGNvbnN0IHJlcSA9ICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IHJlcXVpcmU/OiBOb2RlUmVxdWlyZSB9KS5yZXF1aXJlO1xuICAgIGlmICghcmVxKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vZGUgcmVxdWlyZSgpIHVuYXZhaWxhYmxlLiBMb2NhbCBDTEkgbW9kZSBuZWVkcyBkZXNrdG9wIE9ic2lkaWFuLicpO1xuICAgIH1cbiAgICByZXR1cm4gcmVxO1xuICB9XG59XG5cbmNsYXNzIEJsaXBSZXN1cmZhY2VyU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IEJsaXBSZXN1cmZhY2VyUGx1Z2luO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IEJsaXBSZXN1cmZhY2VyUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnQmxpcCBSZXN1cmZhY2VyJyB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ01heCBkYWlseSByZXN1cmZhY2VkIGJsaXBzJylcbiAgICAgIC5zZXREZXNjKCdIb3cgbWFueSBibGlwcyB0aGUgc2NoZWR1bGVkIGNyb24gam9iIHJlc3VyZmFjZXMgcGVyIGRheScpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dFxuICAgICAgICAgIC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4RGFpbHlSZXN1cmZhY2UpKVxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG4gPSBOdW1iZXIodmFsdWUpO1xuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4obikgJiYgbiA+IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubWF4RGFpbHlSZXN1cmZhY2UgPSBuO1xuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoJ0FJIHByb3ZpZGVyJylcbiAgICAgIC5zZXREZXNjKCdMb2NhbCBDTEkgdXNlcyBDb2RleCBvciBDbGF1ZGUgQ29kZSBpbnN0YWxsZWQgb24gdGhpcyBtYWNoaW5lLicpXG4gICAgICAuYWRkRHJvcGRvd24oKGRkKSA9PlxuICAgICAgICBkZFxuICAgICAgICAgIC5hZGRPcHRpb24oJ2xvY2FsLWNsaScsICdMb2NhbCBDTEkgKENvZGV4IC8gQ2xhdWRlKScpXG4gICAgICAgICAgLmFkZE9wdGlvbignb3BlbmFpJywgJ09wZW5BSSBBUEknKVxuICAgICAgICAgIC5hZGRPcHRpb24oJ2ZhbGxiYWNrJywgJ0ZhbGxiYWNrIG9ubHkgKHJ1bGUtYmFzZWQpJylcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlQcm92aWRlcilcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBBaVByb3ZpZGVyKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5haVByb3ZpZGVyID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmFpUHJvdmlkZXIgPT09ICdsb2NhbC1jbGknKSB7XG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgLnNldE5hbWUoJ0xvY2FsIENMSScpXG4gICAgICAgIC5zZXREZXNjKCdDTEkgYmluYXJ5IHRvIGNhbGwuIFRoZSBwbHVnaW4gYXV0by1kZXRlY3RzIHRoZSBwYXRoIHZpYSB3aGljaC4nKVxuICAgICAgICAuYWRkRHJvcGRvd24oKGRkKSA9PlxuICAgICAgICAgIGRkXG4gICAgICAgICAgICAuYWRkT3B0aW9uKCdjbGF1ZGUnLCAnQ2xhdWRlIENvZGUnKVxuICAgICAgICAgICAgLmFkZE9wdGlvbignY29kZXgnLCAnQ29kZXgnKVxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvY2FsQ2xpKVxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogTG9jYWxDbGkpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9jYWxDbGkgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgIC5zZXROYW1lKCdTdHJpY3QgbG9jYWwgQUkgbW9kZScpXG4gICAgICAgIC5zZXREZXNjKCdTdG9wIHRoZSBydW4gaWYgdGhlIGxvY2FsIENMSSBmYWlscyBpbnN0ZWFkIG9mIGZhbGxpbmcgYmFjayB0byBydWxlLWJhc2VkIG91dHB1dCcpXG4gICAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgICB0b2dnbGVcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdHJpY3RMb2NhbEFpKVxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdHJpY3RMb2NhbEFpID0gdmFsdWU7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuYWlQcm92aWRlciA9PT0gJ29wZW5haScpIHtcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAuc2V0TmFtZSgnT3BlbkFJIEFQSSBrZXknKVxuICAgICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgICB0ZXh0XG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJ3NrLS4uLicpXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mub3BlbmFpQXBpS2V5KVxuICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuYWlBcGlLZXkgPSB2YWx1ZS50cmltKCk7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgIC5zZXROYW1lKCdPcGVuQUkgbW9kZWwnKVxuICAgICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgICB0ZXh0XG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mub3BlbmFpTW9kZWwpXG4gICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5haU1vZGVsID0gdmFsdWUudHJpbSgpIHx8ICdncHQtNG8tbWluaSc7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKCdVc2VyIGNvbnRleHQnKVxuICAgICAgLnNldERlc2MoJ0FwcGVuZGVkIHRvIGV2ZXJ5IEFJIHByb21wdCB0byB0YWlsb3IgbmV4dCBzdGVwcycpXG4gICAgICAuYWRkVGV4dEFyZWEoKHRleHQpID0+XG4gICAgICAgIHRleHRcbiAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckNvbnRleHQpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudXNlckNvbnRleHQgPSB2YWx1ZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZSgnUmVzdXJmYWNlIGN1cnJlbnQgYmxpcCcpXG4gICAgICAuc2V0RGVzYyhcbiAgICAgICAgJ1Jlc3VyZmFjZXMgdGhlIGN1cnJlbnRseSBvcGVuIGJsaXAgbm90ZSwgb3IgdGhlIG9sZGVzdCB1bnJldmlld2VkIGJsaXAgaWYgbm9uZSBpcyBvcGVuJ1xuICAgICAgKVxuICAgICAgLmFkZEJ1dHRvbigoYnRuKSA9PlxuICAgICAgICBidG4uc2V0QnV0dG9uVGV4dCgnUnVuIG5vdycpLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IG5hbWUgPSBhd2FpdCB0aGlzLnBsdWdpbi5yZXN1cmZhY2VDdXJyZW50QmxpcCgpO1xuICAgICAgICAgIGlmICghbmFtZSkgbmV3IE5vdGljZSgnQmxpcCBSZXN1cmZhY2VyOiBubyBibGlwIGZpbGUgZm91bmQuJyk7XG4gICAgICAgICAgZWxzZSBuZXcgTm90aWNlKGBCbGlwIFJlc3VyZmFjZXI6IHVwZGF0ZWQgXCIke25hbWV9XCJgKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gIH1cbn1cbiIsICIvLyBQdXJlIGZ1bmN0aW9ucyBcdTIwMTMgbm8gT2JzaWRpYW4gb3IgcnVudGltZS1zcGVjaWZpYyBkZXBlbmRlbmNpZXMuXG5cbmV4cG9ydCB0eXBlIEJsaXBQYWNrID0ge1xuICBpbnNpZ2h0OiBzdHJpbmc7XG4gIG5leHRTdGVwczogc3RyaW5nW107XG4gIHJlbWluZGVyOiBzdHJpbmc7XG59O1xuXG5leHBvcnQgdHlwZSBMb2NhbENsaSA9ICdjb2RleCcgfCAnY2xhdWRlJztcblxuLy8gXHUyNTAwXHUyNTAwIEJpbmFyeSBkZXRlY3Rpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbi8qKlxuICogTG9jYXRlIGEgQ0xJIGJpbmFyeSBieSBydW5uaW5nIGB3aGljaGAgd2l0aCBhbiBhdWdtZW50ZWQgUEFUSCB0aGF0IGNvdmVyc1xuICogY29tbW9uIGluc3RhbGwgbG9jYXRpb25zLiBGYWxscyBiYWNrIHRvIHRoZSBiYXJlIG5hbWUgc28gdGhlIE9TIFBBVEggY2FuXG4gKiBoYW5kbGUgaXQgYXQgc3Bhd24gdGltZS5cbiAqXG4gKiBAcGFyYW0gbmFtZSAgQmluYXJ5IG5hbWUsIGUuZy4gXCJjbGF1ZGVcIiBvciBcIm5vZGVcIlxuICogQHBhcmFtIGV4ZWMgIFJ1bnMgYSBzaGVsbCBjb21tYW5kIGFuZCByZXNvbHZlcyB3aXRoIHN0ZG91dCAoaW5qZWN0YWJsZSBmb3IgdGVzdHMpXG4gKiBAcGFyYW0gaG9tZSAgVmFsdWUgb2YgJEhPTUUgKHBhc3MgYHByb2Nlc3MuZW52LkhPTUUgfHwgJydgKVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGV0ZWN0QmluYXJ5KFxuICBuYW1lOiBzdHJpbmcsXG4gIGV4ZWM6IChjbWQ6IHN0cmluZykgPT4gUHJvbWlzZTxzdHJpbmc+LFxuICBob21lID0gJydcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGV4dHJhUGF0aHMgPSBbXG4gICAgaG9tZSAmJiBgJHtob21lfS8ubnBtLWdsb2JhbC9iaW5gLFxuICAgIGhvbWUgJiYgYCR7aG9tZX0vLmxvY2FsL2JpbmAsXG4gICAgJy9vcHQvaG9tZWJyZXcvYmluJyxcbiAgICAnL3Vzci9sb2NhbC9iaW4nLFxuICAgICcvdXNyL2JpbicsXG4gICAgJy9iaW4nXG4gIF1cbiAgICAuZmlsdGVyKEJvb2xlYW4pXG4gICAgLmpvaW4oJzonKTtcblxuICB0cnkge1xuICAgIGNvbnN0IGZvdW5kID0gKGF3YWl0IGV4ZWMoYFBBVEg9XCIke2V4dHJhUGF0aHN9OiRQQVRIXCIgd2hpY2ggJHtuYW1lfWApKS50cmltKCk7XG4gICAgaWYgKGZvdW5kKSByZXR1cm4gZm91bmQ7XG4gIH0gY2F0Y2gge1xuICAgIC8vIGJpbmFyeSBub3QgZm91bmQgdmlhIHdoaWNoXG4gIH1cblxuICByZXR1cm4gbmFtZTsgLy8gbGFzdCByZXNvcnQ6IGxldCBzcGF3biBkZWxlZ2F0ZSB0byBPUyBQQVRIXG59XG5cbi8vIFx1MjUwMFx1MjUwMCBUZXh0IC8gSlNPTiBoZWxwZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VQYWNrRnJvbVRleHQocmF3VGV4dDogc3RyaW5nKTogQmxpcFBhY2sge1xuICBjb25zdCByYXcgPSByYXdUZXh0Py50cmltKCkgfHwgJ3t9JztcbiAgbGV0IHBhcnNlZDogUGFydGlhbDxCbGlwUGFjaz4gPSB7fTtcblxuICB0cnkge1xuICAgIHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBQYXJ0aWFsPEJsaXBQYWNrPjtcbiAgfSBjYXRjaCB7XG4gICAgY29uc3QgZmlyc3QgPSByYXcuaW5kZXhPZigneycpO1xuICAgIGNvbnN0IGxhc3QgPSByYXcubGFzdEluZGV4T2YoJ30nKTtcbiAgICBpZiAoZmlyc3QgPj0gMCAmJiBsYXN0ID4gZmlyc3QpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHBhcnNlZCA9IEpTT04ucGFyc2UocmF3LnNsaWNlKGZpcnN0LCBsYXN0ICsgMSkpIGFzIFBhcnRpYWw8QmxpcFBhY2s+O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHBhcnNlZCA9IHt9O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgaW5zaWdodDogcGFyc2VkLmluc2lnaHQ/LnRyaW0oKSB8fCAnUmVmaW5lIHRoaXMgYmxpcCBpbnRvIGEgY29uY3JldGUgbmV4dCBhY3Rpb24uJyxcbiAgICBuZXh0U3RlcHM6IHBhcnNlZC5uZXh0U3RlcHM/LmZpbHRlcihCb29sZWFuKS5zbGljZSgwLCAzKSB8fCBbXG4gICAgICAnVGFrZSBvbmUgc21hbGwgY29uY3JldGUgc3RlcCBhbmQgbm90ZSB0aGUgcmVzdWx0LidcbiAgICBdLFxuICAgIHJlbWluZGVyOiBwYXJzZWQucmVtaW5kZXI/LnRyaW0oKSB8fCAnU21hbGwgZXhlY3V0aW9uIGJlYXRzIHBlcmZlY3QgcGxhbm5pbmcuJ1xuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVGYWxsYmFjayh0aXRsZTogc3RyaW5nLCBub3RlQ29udGVudDogc3RyaW5nKTogQmxpcFBhY2sge1xuICBjb25zdCB0ZXh0ID0gYCR7dGl0bGV9XFxuJHtub3RlQ29udGVudH1gLnRvTG93ZXJDYXNlKCk7XG5cbiAgaWYgKHRleHQuaW5jbHVkZXMoJ2thZmthJykgfHwgdGV4dC5pbmNsdWRlcygndGNwJykgfHwgdGV4dC5pbmNsdWRlcygncXVldWUnKSkge1xuICAgIHJldHVybiB7XG4gICAgICBpbnNpZ2h0OlxuICAgICAgICAnVGhpcyBibGlwIGhhcyBzdHJvbmcgaW1wbGVtZW50YXRpb24gdmFsdWU7IGNvbnZlcnQgaXQgaW50byBvbmUgdGlueSBleHBlcmltZW50IGJlZm9yZSByZWFkaW5nIG1vcmUuJyxcbiAgICAgIG5leHRTdGVwczogW1xuICAgICAgICAnUmVhZCBvbmUgcHJhY3RpY2FsIGFydGljbGUgb24gS2Fma2Egb3ZlciBUQ1AgaW50ZXJuYWxzICgxNVx1MjAxMzIwIG1pbiBjYXApLicsXG4gICAgICAgICdCdWlsZCBhIG1pbmkgUG9DOiBzaW5nbGUgcHJvZHVjZXIgKyBjb25zdW1lciB3aXRoIG9uZSBvYnNlcnZhYmxlIG1ldHJpYyAobGF0ZW5jeSBvciByZXRyaWVzKS4nLFxuICAgICAgICAnV3JpdGUgNSBidWxsZXQgbGVhcm5pbmdzIGluIHRoaXMgc2FtZSBub3RlIGFuZCBsaW5rIHRvIG9uZSByZWxhdGVkIHN5c3RlbS1kZXNpZ24gbm90ZS4nXG4gICAgICBdLFxuICAgICAgcmVtaW5kZXI6ICdTaGlwIG9uZSBhcnRpZmFjdCwgbm90IGp1c3Qgb25lIHJlYWRpbmcuJ1xuICAgIH07XG4gIH1cblxuICBpZiAoXG4gICAgdGV4dC5pbmNsdWRlcygncHJvdGVpbicpIHx8XG4gICAgdGV4dC5pbmNsdWRlcygnc295YScpIHx8XG4gICAgdGV4dC5pbmNsdWRlcygnZGlldCcpIHx8XG4gICAgdGV4dC5pbmNsdWRlcygnZm9vZCcpXG4gICkge1xuICAgIHJldHVybiB7XG4gICAgICBpbnNpZ2h0OlxuICAgICAgICAnVGhpcyBpcyBhIGJlaGF2aW9yLWNoYW5nZSBibGlwOyB0aGUgZmFzdGVzdCBjbGFyaXR5IGNvbWVzIGZyb20gYSA3LWRheSBtZWFzdXJlZCB0cmlhbC4nLFxuICAgICAgbmV4dFN0ZXBzOiBbXG4gICAgICAgICdQaWNrIG9uZSBkYWlseSBzb3lhL3Byb3RlaW4gcGxhbiBhbmQgcnVuIGl0IGZvciA3IGRheXMuJyxcbiAgICAgICAgJ1RyYWNrIHNhdGlldHksIGRpZ2VzdGlvbiwgYW5kIGVuZXJneSBpbiBvbmUgbGluZSBwZXIgZGF5IGluIHRoaXMgbm90ZS4nLFxuICAgICAgICAnQXQgZGF5IDcsIGtlZXAvYWRqdXN0L2Ryb3AgYmFzZWQgb24gZXZpZGVuY2UsIG5vdCBtb29kLidcbiAgICAgIF0sXG4gICAgICByZW1pbmRlcjogJ09uZSBjb250cm9sbGVkIGV4cGVyaW1lbnQgYmVhdHMgZW5kbGVzcyBudXRyaXRpb24gYnJvd3NpbmcuJ1xuICAgIH07XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGluc2lnaHQ6ICdOYXJyb3cgdGhpcyBpbnRvIGEgY29uY3JldGUgbmV4dCBhY3Rpb24gdG8gcHJlc2VydmUgbW9tZW50dW0uJyxcbiAgICBuZXh0U3RlcHM6IFtcbiAgICAgICdEZWZpbmUgdGhlIHNtYWxsZXN0IHRlc3RhYmxlIGFjdGlvbiAoPD0yNSBtaW4pLicsXG4gICAgICAnRG8gaXQgb25jZSB0aGlzIHdlZWsgYW5kIGNhcHR1cmUgb3V0Y29tZSBpbiB0aGlzIG5vdGUuJyxcbiAgICAgICdBZGQgb25lIGxpbmsgdG8gYSByZWxhdGVkIG5vdGUgZm9yIGNvbnRleHQgY29udGludWl0eS4nXG4gICAgXSxcbiAgICByZW1pbmRlcjogJ1ByZWZlciBjb21wbGV0aW9uIGFydGlmYWN0cyBvdmVyIG1vcmUgaW5wdXRzLidcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkUHJvbXB0KHVzZXJDb250ZXh0OiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIG5vdGVDb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYFlvdSBoZWxwIHJlc3VyZmFjZSBwZXJzb25hbCBPYnNpZGlhbiBibGlwcyBpbi1wbGFjZS5cblxuQ29udGV4dDpcbi0gJHt1c2VyQ29udGV4dH1cbi0gS2VlcCBvdXRwdXQgcHJhY3RpY2FsLCBzbWFsbCwgYW5kIGV4ZWN1dGlvbi1maXJzdC5cbi0gT3V0cHV0IG11c3QgYmUgdmFsaWQgSlNPTiBvbmx5LlxuXG5CbGlwIHRpdGxlOiAke3RpdGxlfVxuQmxpcCBjb250ZW50IGV4Y2VycHQ6XG4ke25vdGVDb250ZW50LnNsaWNlKDAsIDM1MDApfVxuXG5SZXR1cm4gSlNPTiBleGFjdGx5IHdpdGgga2V5czpcbntcbiAgXCJpbnNpZ2h0XCI6IFwic3RyaW5nIChtYXggMiBsaW5lcylcIixcbiAgXCJuZXh0U3RlcHNcIjogW1wiMi0zIGNvbmNyZXRlIHN0ZXBzXCJdLFxuICBcInJlbWluZGVyXCI6IFwib25lIHNob3J0IHJlbWluZGVyXCJcbn1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RGF0ZShkOiBEYXRlKTogc3RyaW5nIHtcbiAgcmV0dXJuIGQudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFRTzs7O0FDYVAsZUFBc0IsYUFDcEIsTUFDQSxNQUNBLE9BQU8sSUFDVTtBQUNqQixRQUFNLGFBQWE7QUFBQSxJQUNqQixRQUFRLEdBQUcsSUFBSTtBQUFBLElBQ2YsUUFBUSxHQUFHLElBQUk7QUFBQSxJQUNmO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRixFQUNHLE9BQU8sT0FBTyxFQUNkLEtBQUssR0FBRztBQUVYLE1BQUk7QUFDRixVQUFNLFNBQVMsTUFBTSxLQUFLLFNBQVMsVUFBVSxpQkFBaUIsSUFBSSxFQUFFLEdBQUcsS0FBSztBQUM1RSxRQUFJLE1BQU8sUUFBTztBQUFBLEVBQ3BCLFFBQVE7QUFBQSxFQUVSO0FBRUEsU0FBTztBQUNUO0FBSU8sU0FBUyxrQkFBa0IsU0FBMkI7QUFDM0QsUUFBTSxNQUFNLFNBQVMsS0FBSyxLQUFLO0FBQy9CLE1BQUksU0FBNEIsQ0FBQztBQUVqQyxNQUFJO0FBQ0YsYUFBUyxLQUFLLE1BQU0sR0FBRztBQUFBLEVBQ3pCLFFBQVE7QUFDTixVQUFNLFFBQVEsSUFBSSxRQUFRLEdBQUc7QUFDN0IsVUFBTSxPQUFPLElBQUksWUFBWSxHQUFHO0FBQ2hDLFFBQUksU0FBUyxLQUFLLE9BQU8sT0FBTztBQUM5QixVQUFJO0FBQ0YsaUJBQVMsS0FBSyxNQUFNLElBQUksTUFBTSxPQUFPLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDaEQsUUFBUTtBQUNOLGlCQUFTLENBQUM7QUFBQSxNQUNaO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFFQSxTQUFPO0FBQUEsSUFDTCxTQUFTLE9BQU8sU0FBUyxLQUFLLEtBQUs7QUFBQSxJQUNuQyxXQUFXLE9B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
