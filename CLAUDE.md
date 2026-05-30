## gstack (REQUIRED — vendored in this repo)

This repo bundles gstack at `.claude/skills/gstack/`. Don't install gstack
globally for this project — everything resolves from the working tree.

If gstack ever isn't built (or wasn't checked out), build it with:

```bash
./.claude/skills/gstack/setup
```

Requirements: bun (and Node.js on Windows).

**Path conventions for this repo:**

- Source: `.claude/skills/gstack/...`
- Skill discovery: `.claude/skills/<name>/SKILL.md` (symlinked into the
  vendored gstack tree by `setup`)
- Don't reference `~/.claude/skills/gstack/...` — this repo is local-only

**Available skills:** /office-hours, /plan-ceo-review, /plan-eng-review,
/plan-design-review, /design-consultation, /design-shotgun, /design-html,
/review, /ship, /land-and-deploy, /canary, /benchmark, /browse,
/connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies,
/setup-deploy, /setup-gbrain, /retro, /investigate, /document-release,
/codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful,
/freeze, /guard, /unfreeze, /gstack-upgrade, /learn.

Use /browse for all web browsing — never use `mcp__claude-in-chrome__*` tools.
