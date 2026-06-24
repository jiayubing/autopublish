# Second Platform Implementation Guide

This guide is the immediate next-step playbook for the project. A fresh agent should use it after reading:

1. `AGENTS.md`
2. `CONTEXT.md`
3. `docs/status.md`
4. `docs/multi-platform-plan.md`
5. `docs/adr/0001-platform-adapter-core.md`

## Purpose

The next milestone is not the Desktop Console yet. The next milestone is to add a real second `Publication Platform` and use it to validate the current `Publishing Core`, `Platform Adapter`, `PublicationJob`, sidecar direction, and per-platform session boundary.

## Success Criteria

The second platform work is successful when all of these are true:

- a new adapter exists under `src/platforms/<platform-id>/adapter.js`
- the platform can be enabled through `config/platforms.json`
- the existing batch runner can see and execute it without structural rewrites
- the platform uses the shared core instead of duplicating Lieju logic
- platform-specific fields do not force the shared article model back into a Lieju-shaped design
- the current serial `PublicationJob` flow still makes sense

## Recommended Workflow

Implement the second platform in two stages.

### Stage 1. Platform Recon

Do not write the adapter first. First inspect the platform with `playwright-cli` and capture the publication workflow.

Collect this checklist:

- login page URL
- publish page URL
- logged-in success indicator
- title field selector or locator
- body field selector or locator
- platform-specific required fields
- submit button selector or locator
- success-page or success-message signal
- whether image upload is required
- whether category, region, tag, or merchant fields are required
- whether captcha, SMS verification, or anti-bot friction exists

Useful outputs from this stage:

- one short recon note under `docs/`
- one temporary exploration script if needed
- updated field expectations for the sidecar model

### Stage 2. Adapter Implementation

Once recon is stable, implement the adapter.

Recommended file shape:

```text
src/
  platforms/
    <platform-id>/
      adapter.js
```

The adapter should follow the same contract shape already used by Lieju:

```js
{
  id,
  scanDir,
  ensureSession,
  ensureLoggedIn,
  checkLogin,
  publishArticle,
  saveSession,
  closeSession
}
```

The adapter should own:

- URLs
- selectors
- platform-specific field mapping
- success detection
- any site-specific waits, clicks, or transforms

The adapter should not own:

- article scanning
- markdown conversion
- shared logging
- job creation or orchestration
- platform loading

## Field Modeling Rule

Do not extend the shared filename parsing model just to satisfy the second platform.

Use this rule:

- keep filenames for lightweight human-readable identification and legacy compatibility
- put new platform-specific fields into sidecar metadata
- let adapters read only the fields they need

If the second platform needs fields like `category`, `images`, `tags`, `storeName`, or `district`, that is evidence for sidecar usage, not for filename expansion.

## Config Integration

After the adapter exists:

1. add the platform id to `config/platforms.json`
2. verify `src/core/platforms.js` can load it
3. keep the runner entry at `scripts/publish.js`

The goal is to prove that enabling a new platform is now configuration work plus adapter work, not runner surgery.

## Validation Checklist

Before calling the second platform done, verify:

- `scripts/publish.js` still works for Lieju
- the new platform loads through `config/platforms.json`
- the runner can include both platforms without code changes in the batch entrypoint
- `PublicationJob` logs clearly identify which platform is running
- the second platform did not force new platform-specific conditions into `src/core/`
- session data stays isolated per platform

## Suggested Commit Sequence

Keep this work in small commits:

1. `docs: add second platform recon notes`
2. `feat: add <platform-id> adapter skeleton`
3. `feat: map <platform-id> into platform loader config`
4. `feat: implement <platform-id> publish flow`
5. `test: validate lieju and <platform-id> through serial job flow`

## Recommended New-Conversation Prompt

Use this when starting a fresh Codex conversation for the second platform:

```text
Read AGENTS.md, CONTEXT.md, docs/status.md, docs/multi-platform-plan.md, docs/adr/0001-platform-adapter-core.md, and docs/second-platform-implementation.md.

Current goal:
Add a real second Publication Platform through the existing adapter boundary and config/platforms.json, without starting desktop-app work yet.

Requirements:
- do platform recon first using playwright-cli
- collect selectors, login signal, publish URL, success signal, and platform-specific required fields
- use sidecar metadata direction instead of expanding the shared filename model
- keep scripts/publish.js as the entry point
- do not duplicate shared logic already in src/core/
```

## Branch Recommendation

If you want a separate branch for this milestone, a good branch name is:

`codex/second-platform-validation`

Use a branch if you want the second-platform experiment isolated.
Stay on `master` if you prefer a single linear project history and are comfortable making small commits.
