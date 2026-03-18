import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, "..");
const RUNS_DIR = path.join(SKILL_DIR, "runs");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function findLatestRunDir() {
  ensureDir(RUNS_DIR);
  const dirs = fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(RUNS_DIR, entry.name))
    .sort();
  if (dirs.length === 0) {
    throw new Error("No run directory found. Run fetch_worldmonitor_ai_news.mjs first.");
  }
  return dirs[dirs.length - 1];
}

function parseArgs(argv) {
  const args = {
    runDir: "",
    limit: 8,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[i + 1]) || 8;
      i += 1;
      continue;
    }
    if (!arg.startsWith("--") && !args.runDir) {
      args.runDir = path.resolve(arg);
    }
  }
  if (!args.runDir) {
    args.runDir = findLatestRunDir();
  }
  return args;
}

function slugify(value, maxLength = 70) {
  return String(value || "item")
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength) || "item";
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMetaImage(html, pageUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image:src["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return new URL(match[1], pageUrl).toString();
      } catch {
        return match[1];
      }
    }
  }
  return "";
}

function extractMetaTitle(html) {
  const patterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
    /<title>([^<]+)<\/title>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1]).trim();
    }
  }
  return "";
}

function resolveExtension(contentType, imageUrl) {
  const lower = String(contentType || "").toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return ".jpg";
  if (lower.includes("png")) return ".png";
  if (lower.includes("webp")) return ".webp";
  if (lower.includes("gif")) return ".gif";
  if (lower.includes("svg")) return ".svg";
  try {
    const pathname = new URL(imageUrl).pathname.toLowerCase();
    const ext = path.extname(pathname);
    if (ext) return ext;
  } catch {}
  return ".jpg";
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`HTML request failed: ${response.status}`);
  }
  return response.text();
}

async function downloadImage(imageUrl, outputPath) {
  const response = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Referer": imageUrl,
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected content-type: ${contentType || 'unknown'}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return {
    contentType,
    bytes: buffer.length,
  };
}

function toMarkdownReport(candidates, failures) {
  const lines = [
    "# Image Candidates",
    "",
    "这些图片由脚本从原新闻页的 `og:image` / `twitter:image` 抓取并缓存。",
    "后续由 agent 人工筛选：1 张封面图 + 1~2 张正文图。",
    "",
  ];
  candidates.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.title}`);
    lines.push(`- Source: ${item.source || 'Unknown'}`);
    lines.push(`- Article: ${item.link}`);
    lines.push(`- Page Title: ${item.pageTitle || 'Unknown'}`);
    lines.push(`- Image URL: ${item.imageUrl}`);
    lines.push(`- Local Path: ${item.localPath}`);
    lines.push(`- Content Type: ${item.contentType}`);
    lines.push(`- Bytes: ${item.bytes}`);
    lines.push("");
  });
  if (failures.length) {
    lines.push("## Failed / Missing");
    lines.push("");
    failures.forEach((item) => {
      lines.push(`- ${item.title} (${item.link}) → ${item.error}`);
    });
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const { runDir, limit } = parseArgs(process.argv.slice(2));
  const jsonPath = path.join(runDir, 'worldmonitor_ai_news.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Missing source JSON: ${jsonPath}`);
  }
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const items = Array.isArray(payload.items) ? payload.items.slice(0, limit) : [];
  const imageDir = path.join(runDir, 'images');
  ensureDir(imageDir);

  const candidates = [];
  const failures = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    try {
      const html = await fetchHtml(item.link);
      const imageUrl = extractMetaImage(html, item.link);
      if (!imageUrl) {
        failures.push({ title: item.title, link: item.link, error: 'No og/twitter image found' });
        continue;
      }
      const pageTitle = extractMetaTitle(html);
      const tempExt = resolveExtension('', imageUrl);
      const fileBase = `${String(i + 1).padStart(2, '0')}-${slugify(item.source)}-${slugify(item.title, 40)}`;
      const outputPath = path.join(imageDir, `${fileBase}${tempExt}`);
      const downloaded = await downloadImage(imageUrl, outputPath);
      const finalExt = resolveExtension(downloaded.contentType, imageUrl);
      let finalPath = outputPath;
      if (finalExt !== tempExt) {
        finalPath = path.join(imageDir, `${fileBase}${finalExt}`);
        fs.renameSync(outputPath, finalPath);
      }
      candidates.push({
        index: i + 1,
        source: item.source,
        title: decodeHtmlEntities(item.title),
        link: item.link,
        pageTitle,
        imageUrl,
        localPath: finalPath,
        contentType: downloaded.contentType,
        bytes: downloaded.bytes,
      });
    } catch (error) {
      failures.push({
        title: item.title,
        link: item.link,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const jsonOut = path.join(runDir, 'image_candidates.json');
  const mdOut = path.join(runDir, 'image_candidates.md');
  fs.writeFileSync(jsonOut, JSON.stringify({ generatedAt: new Date().toISOString(), runDir, candidates, failures }, null, 2), 'utf8');
  fs.writeFileSync(mdOut, toMarkdownReport(candidates, failures), 'utf8');
  process.stdout.write(JSON.stringify({ runDir, imageDir, candidateCount: candidates.length, failureCount: failures.length, jsonOut, mdOut }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
