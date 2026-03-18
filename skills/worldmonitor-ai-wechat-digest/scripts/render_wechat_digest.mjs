import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  if (!argv[0]) {
    throw new Error("Usage: node render_wechat_digest.mjs <article.md> [--output article.wechat.html]");
  }

  let inputPath = "";
  let outputPath = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--output" && argv[i + 1]) {
      outputPath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (!arg.startsWith("--") && !inputPath) {
      inputPath = path.resolve(arg);
    }
  }

  if (!inputPath) {
    throw new Error("Missing input markdown file.");
  }

  return { inputPath, outputPath };
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#0f4c81;text-decoration:none;border-bottom:1px solid #0f4c81;">$1</a>');
  return html;
}

function renderImage(alt, src) {
  const safeAlt = escapeHtml(alt || "");
  const safeSrc = escapeHtml(src || "");
  return `<figure style="margin:18px 0 20px;">
    <img src="${safeSrc}" alt="${safeAlt}" data-local-path="${safeSrc}" style="display:block;width:100%;height:auto;border-radius:14px;" />
    ${safeAlt ? `<figcaption style="margin-top:8px;font-size:12px;line-height:1.6;color:#94a3b8;">${safeAlt}</figcaption>` : ""}
  </figure>`;
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let orderedItems = [];
  let quoteItems = [];
  let currentSection = "";

  const bodyTextStyle = () =>
    currentSection === "来源"
      ? "margin:10px 0;line-height:1.7;font-size:13px;color:#64748b;"
      : "margin:14px 0;line-height:1.9;font-size:16px;color:#1f2937;";

  const listStyle = () =>
    currentSection === "来源"
      ? {
          wrapper: "margin:8px 0 8px 18px;padding:0;",
          item: "margin:5px 0;line-height:1.7;color:#64748b;font-size:13px;",
        }
      : {
          wrapper: "margin:12px 0 12px 22px;padding:0;",
          item: "margin:8px 0;line-height:1.8;color:#1f2937;",
        };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(`<p style="${bodyTextStyle()}">${renderInline(paragraph.join("<br/>"))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    const styles = listStyle();
    const items = listItems
      .map((item) => `<li style="${styles.item}">${renderInline(item)}</li>`)
      .join("");
    blocks.push(`<ul style="${styles.wrapper}">${items}</ul>`);
    listItems = [];
  };

  const flushOrdered = () => {
    if (orderedItems.length === 0) return;
    const styles = listStyle();
    const items = orderedItems
      .map((item) => `<li style="${styles.item}">${renderInline(item)}</li>`)
      .join("");
    blocks.push(`<ol style="${styles.wrapper}">${items}</ol>`);
    orderedItems = [];
  };

  const flushQuote = () => {
    if (quoteItems.length === 0) return;
    blocks.push(`<blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #0f4c81;background:#f3f7fb;color:#334155;line-height:1.8;">${renderInline(quoteItems.join("<br/>"))}</blockquote>`);
    quoteItems = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushOrdered();
    flushQuote();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushAll();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const headingText = heading[2].trim();
      currentSection = headingText;
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      const styleMap = {
        h1: "margin:28px 0 18px;font-size:28px;line-height:1.35;color:#0f172a;",
        h2: "margin:26px 0 14px;padding-left:10px;border-left:4px solid #0f4c81;font-size:22px;line-height:1.45;color:#111827;",
        h3: "margin:20px 0 10px;font-size:18px;line-height:1.5;color:#1f2937;",
      };
      blocks.push(`<${tag} style="${styleMap[tag]}">${renderInline(headingText)}</${tag}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushOrdered();
      flushQuote();
      listItems.push(bullet[1]);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      flushList();
      flushQuote();
      orderedItems.push(ordered[1]);
      continue;
    }

    const quote = trimmed.match(/^>\s*(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      flushOrdered();
      quoteItems.push(quote[1]);
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushAll();
      blocks.push(renderImage(image[1], image[2]));
      continue;
    }

    paragraph.push(trimmed);
  }

  flushAll();
  return blocks.join("\n");
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferDigest(frontmatter, body) {
  if (frontmatter.digest) return frontmatter.digest;
  const text = stripHtml(markdownToHtml(body));
  return text.length > 110 ? `${text.slice(0, 107)}...` : text;
}

function buildHtml(frontmatter, bodyHtml) {
  const title = frontmatter.title || "24小时AI资讯";
  const author = frontmatter.author || "Codex";
  const digest = frontmatter.digest || "";
  const issueDate = frontmatter.date || new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#eef3f8;">
  <section style="max-width:760px;margin:0 auto;padding:24px 16px 48px;">
    <article style="background:#ffffff;border-radius:18px;padding:28px 24px;box-shadow:0 12px 40px rgba(15,76,129,0.08);">
      <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#0f4c81;color:#ffffff;font-size:12px;letter-spacing:0.08em;">AI 24H DIGEST</div>
      <p style="margin:14px 0 0;color:#64748b;font-size:13px;">${escapeHtml(issueDate)} · ${escapeHtml(author)}</p>
      ${digest ? `<div style="margin:18px 0 24px;padding:14px 16px;background:#f8fbfe;border:1px solid #dbe7f3;border-radius:14px;color:#334155;line-height:1.8;">${renderInline(digest)}</div>` : ""}
      <div>${bodyHtml}</div>
      <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px;line-height:1.7;">
        本文基于 World Monitor 最近 24 小时 AI 资讯整理，仅用于信息参考。
      </div>
    </article>
  </section>
</body>
</html>`;
}

function main() {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(inputPath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  frontmatter.digest = inferDigest(frontmatter, body);
  const normalizedBody = body.replace(
    new RegExp(`^#\\s+${String(frontmatter.title || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\r?\\n?`),
    ""
  );
  const html = buildHtml(frontmatter, markdownToHtml(normalizedBody));
  const finalOutput = outputPath || path.join(path.dirname(inputPath), "article.wechat.html");
  const metadataPath = path.join(path.dirname(finalOutput), "article.metadata.json");
  fs.writeFileSync(finalOutput, html, "utf8");
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        title: frontmatter.title || "24小时AI资讯",
        author: frontmatter.author || "Codex",
        digest: frontmatter.digest,
        cover: frontmatter.cover || "",
      },
      null,
      2
    ),
    "utf8"
  );

  process.stdout.write(JSON.stringify({ htmlPath: finalOutput, metadataPath }, null, 2));
}

main();
