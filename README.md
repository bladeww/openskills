# openskills

Reusable Codex skills.

## Included Skills

- `worldmonitor-ai-wechat-digest`
  - Fetches the last 24 hours of AI news from World Monitor
  - Rewrites it into a Chinese WeChat news post
  - Renders WeChat-compatible HTML
  - Publishes to the WeChat Official Account draft box

## Layout

```text
skills/
  worldmonitor-ai-wechat-digest/
    SKILL.md
    agents/
    references/
    scripts/
```

## Notes

- Secrets are not stored in this repository.
- Runtime artifacts and generated drafts are intentionally excluded.
- Configure WeChat credentials locally before publishing.
