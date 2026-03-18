# Workflow

This skill is intentionally narrow. The article should feel like a polished Chinese public-account news post, not a feed export.

## Source Policy

- Primary source: World Monitor `tech` news digest API.
- Time window: last 24 hours from fetch time.
- Core set: `categories.ai.items`.
- Secondary set: `categories.tech.items` filtered by AI-related keywords.
- Keep the original title, source, link, and published time in the machine-readable output.

## Article Policy

- Target reader: Chinese readers following AI, technology, products, policy, and infrastructure.
- Default voice: concise, informed, slightly sharp, like a fast-moving Chinese tech news account.
- Brand line: `AI新信息`.
- Preferred headline format: `AI新信息 MM.DD｜{当天最强结论}`.
- Generate 3-5 title candidates before finalizing one.
- Good headlines usually contain:
  - one strong subject
  - one concrete change or conflict
  - one short time signal
- Avoid filler openings.
- Avoid overclaiming.
- Prefer grouped themes over item-by-item clipping.
- Always include a `今日快讯` section with 6-12 short bullets.
- Target 18-36 Chinese characters per quick bullet.
- Keep one section for quick scan and one section for expanded analysis.
- Humanization rules:
  - Use short, plain sentences.
  - Avoid rigid transitions such as `首先/其次/最后/总的来说/与此同时/值得注意的是`.
  - Avoid overused AI phrases, marketing language, and abstract empty conclusions.
  - Prefer direct judgment, concrete verbs, and spoken-natural phrasing.
- Default weak-phrase blacklist:
  - `从某种程度上`
  - `可以看出`
  - `在这样的背景下`
  - `本质上`
  - `换言之`
  - `进一步来看`
  - `不难发现`
  - `这意味着`
- The `来源` section should use Chinese-translated source titles with the original links.

## WeChat Formatting

- Render to inline-styled HTML.
- Use conservative typography and spacing.
- Keep paragraphs short.
- Use highlight callouts sparingly.
- Source list should remain clickable.
- Keep the cover image separate from the body.
- Use body images only when they are selected from the cached source-page image candidates and clearly support the nearby section.

## Publishing

- Use the WeChat Official Account draft API.
- The Official Account API may reject calls unless the caller IP is present in the WeChat API whitelist.
- Upload a cover image first to obtain `thumb_media_id`.
- Publish one `news` article into the draft box.
- Return the API media ID to the caller.
