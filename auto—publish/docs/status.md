# Status

## Current Phase

Phase 5 delivered - the Desktop Console is now implemented on `master` as a thin operator surface over the Publishing Core.

## Current Baseline

- Git baseline commit: `058c3d8`
- Current branch: `master`
- Desktop merge commit on `master`: `5f7464c`
- The working Lieju-only runner has been backed up separately in `backup/lieju-runner-2026-06-19.zip`.

## Confirmed Direction

- Keep CLI and Desktop Console on the same Publishing Core.
- Keep platform-specific selectors and login rules inside Platform Adapters.
- Keep article metadata moving toward sidecar files rather than filename expansion.
- Keep the current execution model serial until a real need for concurrency appears.
- Keep one Platform Session per Publication Platform.

## Done

- Stabilized the Lieju-only publisher.
- Repaired the local `markitdown` and `playwright-cli` execution path.
- Moved Playwright runtime data under `work/playwright-cli/`.
- Created the project glossary in `CONTEXT.md`.
- Recorded the core architectural decision in `docs/adr/0001-platform-adapter-core.md`.
- Wrote the multi-platform implementation plan in `docs/multi-platform-plan.md`.
- Created a standalone Lieju migration backup.
- Initialized Git and created the baseline commit.
- Extracted shared article scanning and parsing into `src/core/articles.js`.
- Extracted the `markitdown` wrapper into `src/core/markitdown.js`.
- Extracted the Playwright CLI runner into `src/core/playwright.js`.
- Extracted logging and file/archive helpers into `src/core/logger.js` and `src/core/files.js`.
- Kept desktop publishing through `scripts/desktop.cmd` and the Electron shell.
- Wrapped Lieju in the shared Platform Adapter contract.
- Added Publication Job orchestration and config-driven platform loading.
- Added Toutiao as the second Publication Platform with its own scanner/parser, sidecar metadata support, and independent Platform Session.
- Verified Lieju and Toutiao can publish successfully in the same serial batch without session collisions.
- Fixed sidecar follow-through for `published/` and `failed/` handling.
- Added adapter scan/parse pair validation so partially implemented adapters are skipped safely.
- Added a shared app-facing batch layer in `src/app/publish-batch.js` used by the desktop entry point.
- Implemented the Desktop Console with Electron under `desktop/`.
- Added desktop queue snapshot loading, platform list display, batch start, safe-stop signaling, and live log streaming.
- Merged the desktop implementation branch back into `master`.
- Removed the obsolete CLI entry scripts from `scripts/` and kept the desktop shell as the single user-facing entry point.

## Current Runtime Entry Points

- Desktop Console: `npm run desktop`

## Next

- Improve Desktop Console ergonomics rather than reworking the architecture.
- Add the next real Publication Platform through the existing adapter boundary.
- Gradually replace fragile text-based Toutiao locators with more stable selectors.
- Consider session inspection, queue filtering, and sidecar editing as the next desktop features.

## Reading Order For A New Session

1. `AGENTS.md`
2. `CONTEXT.md`
3. `docs/status.md`
4. `docs/multi-platform-plan.md`
5. `docs/adr/0001-platform-adapter-core.md`
6. `docs/second-platform-implementation.md`
7. `docs/toutiao-recon.md`

## Handoff Rule

Use the `handoff` skill only when pausing a session and expecting another fresh agent or new conversation to resume soon. Treat `docs/status.md`, `CONTEXT.md`, and the ADRs as the long-term source of truth; treat handoff notes as short-lived session summaries.
