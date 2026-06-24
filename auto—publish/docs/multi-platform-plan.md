# Multi-Platform Publishing Plan

This plan is designed to extend the current Lieju automation into a multi-platform publishing system without throwing away the working script.

## Current State

Today the project is a single Node script centered on Lieju:

- `scripts/publish.js` mixes shared concerns and Lieju-specific logic in one file.
- `scripts/config.js` contains both shared runtime paths and the Lieju platform definition.
- `markitdown` converts source documents into markdown before publication.
- `playwright-cli` provides browser automation, state save/load, and manual-login recovery.

This is a good first version, but the next platform will be expensive if we keep adding conditionals into the same script.

## Target Shape

The project should evolve into three layers.

### 1. Publishing Core

The Publishing Core owns behavior that should remain identical across platforms:

- scan article files
- parse filename metadata
- convert `.docx` to `.md`
- normalize article content
- create and track Publication Jobs
- write logs
- archive published files
- move failed files
- manage shared runtime directories

The core should know that a Platform Adapter exists, but should not know selector details or per-site login wording.

### 2. Platform Adapters

Each platform should live behind one adapter module. The adapter should consume one shared `Source Article` shape from the core and only read platform-specific fields from the Article Metadata Sidecar when needed. The adapter should expose a consistent contract, for example:

```js
{
  id: "lieju",
  scanDir: "lieju",
  ensureSession(coreContext),
  checkLogin(coreContext),
  publishArticle(coreContext, article),
  saveSession(coreContext),
  closeSession(coreContext)
}
```

The Lieju adapter would keep:

- base URLs
- login URL
- selector rules
- city switching logic
- success-page detection
- any site-specific content transforms

Lieju should be treated as a special-case platform whose city, contact, and phone requirements do not define the shared article model for the rest of the system.

When you add a second platform, you duplicate only the adapter pattern, not the whole pipeline.

### 3. Desktop Console

The desktop app should call the same Publishing Core instead of reimplementing browser logic.

Responsibilities of the Desktop Console:

- choose platforms to enable
- show pending Source Articles
- show parsed metadata before publication
- let the Operator select one or many platforms per article
- trigger a Publication Batch
- show live logs and per-job status
- let the Operator manually resume login when a platform requires it
- manage platform accounts and session health

The desktop layer should not contain selectors, login detection logic, or document parsing rules.

## Recommended Code Layout

One practical next layout is:

```text
src/
  core/
    articles.js
    files.js
    logger.js
    markitdown.js
    jobs.js
    playwright.js
    platforms.js
  platforms/
    lieju/
      adapter.js
      config.js
    example-platform/
      adapter.js
      config.js
  app/
    publish-batch.js
    explore-platform.js
scripts/
  publish.js
  explore-lieju.js
config/
  platforms.json
```

In this layout:

- `scripts/` becomes a thin entry layer
- `src/core/` holds reusable logic
- `src/platforms/` holds one folder per Publication Platform
- `src/app/` coordinates actual runs

## Migration Path

### Phase 1. Extract the core without changing behavior

Goal:
Move shared logic out of `scripts/publish.js` while preserving the current Lieju workflow.

Steps:

- move file scanning and filename parsing into `src/core/articles.js`
- move markdown conversion into `src/core/markitdown.js`
- move log and archive handling into `src/core/files.js` and `src/core/logger.js`
- move Playwright CLI execution into `src/core/playwright.js`
- introduce a shared `Source Article` object and sidecar metadata loader
- keep Lieju publishing behavior unchanged

Success check:

- `node scripts/publish.js` still publishes to Lieju exactly as before
- no Lieju selector logic remains in shared modules
- shared article parsing no longer assumes every platform needs Lieju fields

### Phase 2. Introduce the first Platform Adapter boundary

Goal:
Wrap the existing Lieju logic in a formal adapter contract.

Steps:

- create `src/platforms/lieju/adapter.js`
- move Lieju URLs, selectors, login checks, city switching, and success detection there
- make the batch runner call the adapter instead of calling Lieju functions directly

Success check:

- the runner can publish by selecting the `lieju` adapter
- adding a second adapter no longer requires editing core article processing logic

### Phase 3. Add multi-platform job orchestration

Goal:
Support one Source Article being published to one or many platforms.

Steps:

- define a `PublicationJob` record
- define per-job states such as `pending`, `running`, `succeeded`, `failed`, `needs_login`
- allow configuration mapping between source directories and platforms
- optionally allow a single article to target multiple adapters

Success check:

- one batch run can process mixed platforms
- job logs clearly show platform-specific outcomes

### Phase 4. Add persistent app configuration

Goal:
Move platform selection and runtime settings out of code constants.

Steps:

- create a local config file such as `config/platforms.json`
- store enabled platforms, session names, browser channel, and per-platform input folder
- keep secrets and login state out of the config file

Success check:

- enabling a new adapter no longer requires touching shared runtime code

### Validation Gate Before Phase 5

Goal:
Prove that Phases 1 through 4 actually hold up when a second Publication Platform is implemented.

Steps:

- add a second real platform through the current adapter boundary
- load it through `config/platforms.json`
- verify that the shared `Source Article` model still works
- verify that sidecar metadata can absorb platform differences
- verify that `PublicationJob` orchestration and serial execution still make sense
- verify that each platform can own its own session without state collisions

Success check:

- the second platform can publish without forcing structural rewrites in `src/core/`
- adding the second platform mostly means writing adapter code and adapter-specific metadata handling
- the current abstractions still feel natural instead of forced

### Phase 5. Build the Desktop Console

Goal:
Add a local desktop app without changing the publishing domain model.

Recommended shape:

- backend: Node process reusing `src/core/` and `src/platforms/`
- frontend: desktop shell such as Electron or Tauri
- UI actions call the same batch runner used by CLI scripts

Recommended first screens:

- platform list
- article queue
- article preview
- publish run screen with live logs
- platform session status

Success check:

- the desktop app and CLI both use the same Publishing Core
- a bug fix in publication logic is fixed once for both entry points

## Design Rules

- Keep platform selectors and URLs out of shared modules.
- Keep session data under `work/playwright-cli/` or another workspace-local runtime tree.
- Keep article parsing independent from any one platform.
- Treat desktop UI as an operator surface, not as the owner of business logic.
- Do not couple Source Article naming rules to a single platform forever; if future platforms need richer metadata, move metadata into a sidecar file or manifest instead of bloating filenames.
- Treat Lieju-specific city, contact, and phone fields as adapter-owned requirements, not shared article requirements.
- Use one Platform Session per Publication Platform, with room to support multiple Platform Accounts later.
- Run Publication Jobs serially in the first phases to keep login recovery, logging, and failure handling predictable.

## Risks To Plan For

- Different platforms will want different required fields, so the current filename-only metadata model will eventually become too narrow.
- Some platforms may require image upload, category trees, or rich-text formatting that plain markdown-to-text loses.
- Reusing one browser session across all platforms may cause state collisions; long term, each platform should own its own Platform Session.
- Even in the first version, session ownership should be per platform. The data model should leave room for multiple Platform Accounts later, even if only one active account per platform is supported at first.
- A desktop app created too early can freeze the wrong abstractions in place.

## Recommendation

The safest next move is not "build desktop UI now." The safest next move is:

1. extract the Publishing Core
2. wrap Lieju as the first Platform Adapter
3. add a second platform to prove the boundary
4. only then build the Desktop Console

Once step 3 works, the desktop app becomes mostly a product and UX task rather than an automation-architecture task.

## Decisions Confirmed So Far

- One Source Article should eventually support multiple Publication Jobs, but the early workflow can still assume one primary target platform at a time.
- Article metadata should move toward a sidecar file, with filenames kept only for lightweight human-readable identification and legacy compatibility.
- Platform Adapters should consume a shared Source Article and only read platform-specific sidecar fields when necessary.
- Lieju is a special-case platform and must not define the shared article model for future platforms.
- Each Publication Platform should own its own Platform Session, while the data model leaves room for multiple Platform Accounts later.
- The first Desktop Console should focus on content management and publication operations rather than being only a thin launcher or only an account manager.
- Publication Batches should execute serially in the early phases.
- The second platform should be used first to prove the shared Publishing Core and Platform Adapter boundary, not to validate the desktop layer first.
- The Desktop Console and CLI should both call the same Publishing Core instead of maintaining separate publication logic.

## Current Interpretation Of Progress

The codebase may already contain much of the mechanical work described by Phases 1 through 4, but the project should not be treated as truly ready for Phase 5 until a second Publication Platform has been implemented and verified through the current adapter boundary.

In other words:

- Phase 1 is complete when the shared core is extracted and Lieju behavior still works.
- Phase 2 is complete when Lieju is operating through the adapter contract.
- Phase 3 and Phase 4 are only meaningfully validated once a second platform uses the job orchestration and config-driven loading path.
- Phase 5 should begin only after that validation, not merely after the supporting code exists.
