import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(SKILL_DIR, "runs");
const KEYWORD_PATTERNS = [
  /\bai\b/i,
  /artificial intelligence/i,
  /\bopenai\b/i,
  /\banthropic\b/i,
  /\bchatgpt\b/i,
  /\bclaude\b/i,
  /\bgemini\b/i,
  /\bgrok\b/i,
  /\bdeepmind\b/i,
  /\bllm\b/i,
  /\bmodels?\b/i,
  /\binference\b/i,
  /\bgpu\b/i,
  /\bnvidia\b/i,
  /\bchips?\b/i,
  /\bdatacenter\b/i,
  /\bagentic\b/i,
  /\bagents?\b/i,
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function makeRunDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(RUNS_DIR, stamp);
  ensureDir(runDir);
  return runDir;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function parsePublishedAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isAiRelated(item) {
  const haystack = [item.title, item.source, item.locationName].filter(Boolean).join(" ");
  return KEYWORD_PATTERNS.some((pattern) => pattern.test(haystack));
}

function dedupe(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = `${normalizeText(item.title)}|${item.link || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function toBrief(items, fetchedAt) {
  const lines = [
    `# World Monitor 24h AI Source Brief`,
    ``,
    `Fetched at: ${fetchedAt}`,
    `Total items: ${items.length}`,
    ``,
  ];

  items.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.title}`);
    lines.push(`- Source: ${item.source || "Unknown"}`);
    lines.push(`- Published At: ${item.publishedAtIso || "Unknown"}`);
    lines.push(`- Link: ${item.link}`);
    if (item.locationName) lines.push(`- Location: ${item.locationName}`);
    if (item.threatSummary) lines.push(`- Threat: ${item.threatSummary}`);
    lines.push(`- Alert: ${item.isAlert ? "yes" : "no"}`);
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

async function main() {
  ensureDir(RUNS_DIR);
  const runDir = process.argv[2] ? path.resolve(process.argv[2]) : makeRunDir();
  ensureDir(runDir);

  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const url = "https://www.worldmonitor.app/api/news/v1/list-feed-digest?variant=tech&lang=en";
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://www.worldmonitor.app",
      "Referer": "https://www.worldmonitor.app/",
    },
  });

  if (!response.ok) {
    throw new Error(`World Monitor request failed: ${response.status}`);
  }

  const payload = await response.json();
  const categories = payload?.categories || {};
  const aiItems = Array.isArray(categories.ai?.items) ? categories.ai.items : [];
  const techItems = Array.isArray(categories.tech?.items) ? categories.tech.items : [];

  const merged = [
    ...aiItems.map((item) => ({ ...item, category: "ai" })),
    ...techItems.filter(isAiRelated).map((item) => ({ ...item, category: "tech" })),
  ];

  const filtered = merged
    .filter((item) => item?.title && item?.link)
    .filter((item) => {
      const publishedAt = parsePublishedAt(item.publishedAt);
      if (!publishedAt) return false;
      return publishedAt >= cutoff && publishedAt <= now;
    })
    .map((item) => ({
      ...item,
      publishedAtIso: new Date(item.publishedAt).toISOString(),
      threatSummary: item?.threat?.category
        ? `${item.threat.category}/${item.threat.level || "unknown"}`
        : "",
    }))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const deduped = dedupe(filtered);
  const output = {
    fetchedAt: now.toISOString(),
    cutoffAt: cutoff.toISOString(),
    count: deduped.length,
    items: deduped,
  };

  const jsonPath = path.join(runDir, "worldmonitor_ai_news.json");
  const briefPath = path.join(runDir, "source_brief.md");
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf8");
  fs.writeFileSync(briefPath, toBrief(deduped, output.fetchedAt), "utf8");

  process.stdout.write(JSON.stringify({ runDir, jsonPath, briefPath, count: deduped.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
