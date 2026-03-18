import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const UPLOAD_URL = "https://api.weixin.qq.com/cgi-bin/material/add_material";
const UPLOAD_ARTICLE_IMAGE_URL = "https://api.weixin.qq.com/cgi-bin/media/uploadimg";
const DRAFT_URL = "https://api.weixin.qq.com/cgi-bin/draft/add";
const DEFAULT_COVER = "https://picsum.photos/900/383.jpg";

function formatWechatError(prefix, detail) {
  const raw = detail || "unknown error";
  if (/invalid ip/i.test(raw)) {
    const ipMatch = raw.match(/invalid ip\s+([0-9.:a-f]+)/i);
    const ip = ipMatch ? ipMatch[1] : "current caller IP";
    return `${prefix}: ${raw}. Add ${ip} to the WeChat Official Account API IP whitelist, or publish via a logged-in browser session instead.`;
  }
  return `${prefix}: ${raw}`;
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function resolveEnv() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const skillEnv = loadEnvFile(path.resolve(__dirname, "..", ".env"));
  const homeEnv = loadEnvFile(path.join(os.homedir(), ".canghe-skills", ".env"));
  const appId =
    process.env.WEIXIN_APP_ID ||
    process.env.WECHAT_APP_ID ||
    skillEnv.WEIXIN_APP_ID ||
    skillEnv.WECHAT_APP_ID ||
    homeEnv.WEIXIN_APP_ID ||
    homeEnv.WECHAT_APP_ID;
  const appSecret =
    process.env.WEIXIN_APP_SECRET ||
    process.env.WECHAT_APP_SECRET ||
    skillEnv.WEIXIN_APP_SECRET ||
    skillEnv.WECHAT_APP_SECRET ||
    homeEnv.WEIXIN_APP_SECRET ||
    homeEnv.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Missing WeChat credentials.");
  }

  return { appId, appSecret };
}

function parseArgs(argv) {
  if (!argv[0]) {
    throw new Error("Usage: node publish_wechat_draft.mjs <article.wechat.html> --meta <article.metadata.json> [--cover <path-or-url>] [--dry-run]");
  }
  const args = {
    htmlPath: "",
    metaPath: "",
    cover: "",
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--meta" && argv[i + 1]) {
      args.metaPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--cover" && argv[i + 1]) {
      args.cover = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (!arg.startsWith("--") && !args.htmlPath) {
      args.htmlPath = path.resolve(arg);
    }
  }
  if (!args.htmlPath) {
    throw new Error("Missing HTML file.");
  }
  return args;
}

async function fetchAccessToken(appId, appSecret) {
  const response = await fetch(`${TOKEN_URL}?grant_type=client_credential&appid=${appId}&secret=${appSecret}`);
  const data = await response.json();
  if (!response.ok || data.errcode) {
    throw new Error(formatWechatError("WeChat token error", data.errmsg || String(response.status)));
  }
  return data.access_token;
}

async function uploadImage(imagePath, accessToken, baseDir) {
  return uploadMultipartImage(imagePath, accessToken, baseDir, `${UPLOAD_URL}?access_token=${accessToken}&type=image`, false);
}

async function uploadArticleImage(imagePath, accessToken, baseDir) {
  return uploadMultipartImage(imagePath, accessToken, baseDir, `${UPLOAD_ARTICLE_IMAGE_URL}?access_token=${accessToken}`, true);
}

async function uploadMultipartImage(imagePath, accessToken, baseDir, endpoint, returnUrl) {
  let fileBuffer;
  let filename;
  let contentType;

  if (/^https?:\/\//i.test(imagePath)) {
    const response = await fetch(imagePath, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://www.google.com/",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`Failed to download cover image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
    filename = path.basename(imagePath.split("?")[0]) || "cover.png";
    contentType = response.headers.get("content-type") || "image/png";
  } else {
    const resolved = path.isAbsolute(imagePath) ? imagePath : path.resolve(baseDir, imagePath);
    fileBuffer = fs.readFileSync(resolved);
    filename = path.basename(resolved);
    const ext = path.extname(filename).toLowerCase();
    contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  }

  const boundary = `----CodexBoundary${Date.now().toString(16)}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    "utf8"
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([header, fileBuffer, footer]);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  const data = await response.json();
  if (!response.ok || (data.errcode && data.errcode !== 0)) {
    throw new Error(formatWechatError("WeChat image upload error", data.errmsg || String(response.status)));
  }
  return returnUrl ? data.url : data.media_id;
}

async function uploadImagesInHtml(html, accessToken, baseDir) {
  const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  const matches = [...html.matchAll(imgRegex)];
  if (matches.length === 0) {
    return html;
  }

  let updatedHtml = html;
  for (const match of matches) {
    const fullTag = match[0];
    const src = match[1];
    if (!src) continue;
    if (/mmbiz\.qpic\.cn/i.test(src)) continue;

    const localPathMatch = fullTag.match(/data-local-path=["']([^"']+)["']/i);
    const imagePath = localPathMatch ? localPathMatch[1] : src;
    const url = await uploadArticleImage(imagePath, accessToken, baseDir);
    const newTag = fullTag
      .replace(/\ssrc=["'][^"']+["']/, ` src="${url}"`)
      .replace(/\sdata-local-path=["'][^"']+["']/, "");
    updatedHtml = updatedHtml.replace(fullTag, newTag);
  }

  return updatedHtml;
}

function extractBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : html.trim();
}

async function publishDraft(accessToken, article) {
  const response = await fetch(`${DRAFT_URL}?access_token=${accessToken}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ articles: [article] }),
  });
  const data = await response.json();
  if (!response.ok || (data.errcode && data.errcode !== 0)) {
    throw new Error(formatWechatError("WeChat draft error", data.errmsg || String(response.status)));
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const html = fs.readFileSync(args.htmlPath, "utf8");
  const meta = args.metaPath ? JSON.parse(fs.readFileSync(args.metaPath, "utf8")) : {};
  const payload = {
    title: meta.title || "24小时AI资讯",
    author: meta.author || "Codex",
    digest: meta.digest || "",
    content: extractBody(html),
    cover: args.cover || meta.cover || DEFAULT_COVER,
  };

  if (args.dryRun) {
    process.stdout.write(JSON.stringify(payload, null, 2));
    return;
  }

  const { appId, appSecret } = resolveEnv();
  const accessToken = await fetchAccessToken(appId, appSecret);
  payload.content = await uploadImagesInHtml(payload.content, accessToken, path.dirname(args.htmlPath));
  let thumbMediaId;
  try {
    thumbMediaId = await uploadImage(payload.cover, accessToken, path.dirname(args.htmlPath));
  } catch (error) {
    if (payload.cover !== DEFAULT_COVER) {
      console.error(`Primary cover upload failed, retrying with default cover: ${error instanceof Error ? error.message : String(error)}`);
      thumbMediaId = await uploadImage(DEFAULT_COVER, accessToken, path.dirname(args.htmlPath));
    } else {
      throw error;
    }
  }
  const result = await publishDraft(accessToken, {
    article_type: "news",
    title: payload.title,
    author: payload.author,
    digest: payload.digest,
    content: payload.content,
    thumb_media_id: thumbMediaId,
    need_open_comment: 1,
    only_fans_can_comment: 0,
  });

  process.stdout.write(JSON.stringify({ mediaId: result.media_id, thumbMediaId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
