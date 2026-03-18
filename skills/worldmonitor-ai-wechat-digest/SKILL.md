---
name: worldmonitor-ai-wechat-digest
description: Fetch the latest 24-hour AI news from World Monitor, rewrite it into a clickable Chinese WeChat news post, format it into WeChat-compatible HTML, and publish it to the WeChat Official Account draft box.
---

# World Monitor AI WeChat Digest

Use this skill when the user wants a 24-hour AI news post for a WeChat Official Account. The workflow is opinionated and should stay narrow:

1. Fetch and normalize the last 24 hours of AI news from World Monitor.
2. Rewrite the source material into an `AI新信息` style Chinese public-account post with a strong lead, a fast-scan section, and concise takeaways.
3. Render the draft into WeChat-compatible HTML.
4. Publish the article to the WeChat Official Account draft box with the official draft API.

## Inputs

- Optional custom headline angle.
- Optional author name.
- Optional output directory.

If the user gives no extra direction, default to an `AI新信息` style 24-hour AI news post for a Chinese tech/business audience.

## Required Workflow

### 1. Fetch source material

Run:

```powershell
node scripts/fetch_worldmonitor_ai_news.mjs
```

This writes normalized JSON and a source brief into the latest run directory under `runs/`.

Read the generated files before writing:

- `worldmonitor_ai_news.json`
- `source_brief.md`

### 2. Rewrite into article markdown

Create `article.md` in the same run directory.

Writing rules:

- Write in Chinese.
- Write in an `AI新信息` account style.
- Use a clickable headline in this format:
  - `AI新信息 MM.DD｜{当天最强结论}`
- Generate 3-5 candidate headlines first, then choose the strongest one.
- Prefer headlines with:
  - 1 big company or 1 strong topic
  - 1 concrete change or conflict
  - 1 short time hook
- Keep headlines short and hard. Prefer 18-28 Chinese characters after the date prefix.
- Keep it readable as a fast WeChat information post, not as a raw clipping list.
- Make the voice sound human:
  - use short, plain sentences
  - avoid filler transitions like `首先/其次/最后/总的来说/与此同时/值得注意的是`
  - avoid exaggerated AI-style phrases and marketing hype
  - prefer direct judgment over abstract summary
  - allow a slightly spoken tone when it reads more naturally
- Default blacklist for AI-sounding phrases. Avoid unless truly needed:
  - `值得注意的是`
  - `总的来说`
  - `从某种程度上`
  - `可以看出`
  - `在这样的背景下`
  - `本质上`
  - `换言之`
  - `进一步来看`
  - `不难发现`
  - `这意味着`
- Lead with the 3 most important developments.
- Add a `今日快讯` section with 6-12 short bullets so readers can scan the smaller items quickly.
- Keep each `今日快讯` bullet short. Target 18-36 Chinese characters.
- Group the main story into 3-4 themes.
- Each main item should answer:
  - what happened
  - why it matters
  - who it affects
- Keep the tone concise, informed, and slightly sharp.
- Cut repeated explanation. If a sentence can be shorter without losing meaning, shorten it.
- Avoid fabricating facts that are not in the source brief.
- Translate source item titles into natural Chinese in the final `来源` section, while keeping the original links.

Recommended structure:

```md
---
title: AI新信息 03.19｜...
author: ...
digest: ...
cover: ...
---

# AI新信息 03.19｜...

## 今天最值得关注的

...

## 今日快讯

- ...
- ...

## 重点

...

## 重点展开

...

## 这意味着什么

...

## 一句话判断

...

## 来源

- [Title](URL)
```

### 3. Render for WeChat

Run:

```powershell
node scripts/render_wechat_digest.mjs <run-dir>\article.md
```

This writes:

- `article.wechat.html`
- `article.metadata.json`

### 4. Publish to WeChat draft box

Run:

```powershell
node scripts/publish_wechat_draft.mjs <run-dir>\article.wechat.html --meta <run-dir>\article.metadata.json
```

This uses the WeChat Official Account draft API and prints the returned draft media ID.

## Environment

Credentials are loaded from either environment variables or the local `.env` file in this skill directory.

Supported variable names:

- `WEIXIN_APP_ID`
- `WEIXIN_APP_SECRET`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

## Constraints

- Always fetch fresh World Monitor data first.
- Keep exact times and links faithful to the fetched source material.
- Do not publish unless render succeeds and the HTML file exists.
- If draft publishing fails, stop and report the API error.

## Output Files

Each run should leave a clear trail inside `runs/<timestamp>/`:

- `worldmonitor_ai_news.json`
- `source_brief.md`
- `article.md`
- `article.wechat.html`
- `article.metadata.json`

## References

Use [workflow.md](C:\Users\25263\.codex\skills\worldmonitor-ai-wechat-digest\references\workflow.md) if you need the exact article standard or the fetch/publish conventions.
