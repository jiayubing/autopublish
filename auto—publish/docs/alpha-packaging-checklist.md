# Alpha Packaging Checklist

## Artifact

- [ ] `release-alpha/` contains a portable exe or installer.
- [ ] Build started from a clean commit and the commit SHA is recorded.
- [ ] `resources/app/tools/node/node.exe --version` matches `runtime-tools-manifest.json`.
- [ ] Package contains `@playwright/cli`, `playwright`, `playwright-core`, and their licenses.
- [ ] Package contains `mammoth` and its license.
- [ ] `node scripts/verify-packaged-docx-runtime.js release-alpha\win-unpacked\resources\app` passes with isolated PATH.
- [ ] `node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke` passes with isolated PATH.
- [ ] App launches without white screen.
- [ ] Window title is `Auto Publish Desktop Console` or approved alpha title.

## Workspace

- [ ] Runtime workspace folders exist: `input`, `data`, `logs`, `published`, `failed`, `tmp`, `work`.
- [ ] Private `.env` was not bundled into the package.
- [ ] Package contains no input, data, published, logs, profile, state, cookie, or absolute developer-machine references.
- [ ] Package verifier rejects `media-provider.json`, `hepan-provider.json`, `platform-settings-migration.json`, provider test status, and Hepan Cookie temporary files.
- [ ] Package contains no `.autopublish/submission-records/publications/` publication ledger, queue snapshot, order JSONL, client data, article content, or publication history.
- [ ] Test articles can be placed into the runtime `input/media` folder.

## Paid Media Flow

- [ ] 浠樿垂濯掍綋鎶曠 page opens.
- [ ] Article scan works.
- [ ] Media resource pool loads or shows a clear empty/error state.
- [ ] Draft save works.
- [ ] Real preflight opens, then the final confirmation appears before any media submission.

## Other Platforms Flow

- [ ] 鍏朵粬骞冲彴鎶曠 page opens if that feature branch has been merged.
- [ ] Queue refresh works for `lieju`, `toutiao`, and `hepan`.
- [ ] Submit confirmation appears before real submission.

## Template and publication safety acceptance

- [ ] With templates present and `clients/` empty, the generation UI still shows
      the template platform and template; generation is disabled with a clear
      empty-client explanation.
- [ ] Adding or changing a client or正文-only template becomes visible after
      the explicit refresh action without restarting the app.
- [ ] Renderer, single generation, batch preflight, and batch execution all use
      the catalog `listCatalog()` / `getTemplate({ platformId, templateId })`
      interface; no legacy reader is used by a caller.
- [ ]正文-only, v2 optional-metadata, and legacy front-matter templates can
      all pass the same batch preflight; malformed templates are isolated in
      diagnostics and are not reported as missing.
- [ ] With a valid custom template present, single and batch selectors default
      to custom templates only; `显示内置模板` is explicit, off by default, and
      restores builtin read-only entries with source labels.
- [ ] `platformId` remains the stable technical lookup key and `displayName`
      is the human-facing label (for example `xiaohongshu` / `小红书`); duplicate
      display names are diagnosed, not silently merged.
- [ ] `displayName` examples use `---` and a half-width colon; a full-width
      colon is treated as正文 rather than metadata.
- [ ] Initial loading does not show “客户与模板已刷新”; manual success is an
      accessible 2–3 second status and timers are cleaned on refresh/unmount.
- [ ] Batch entry does not implicitly select all customers/templates; templates
      require explicit selection, the potential AI-call count stays visible,
      and counts above the configured threshold require cost-risk confirmation.
- [ ] Batch preflight confirms selected customer readiness, template IDs,
      catalog revision, and safety constraints before any AI request.
- [ ] Review, queue, remote submission, publication, and待确认 are displayed
      as distinct stages.
- [ ] A normal-platform article × platform duplicate is blocked, while a
      different platform remains available.
- [ ] A paid-media article × resource duplicate is blocked, while another
      selected resource remains available and is priced independently.
- [ ] `uncertain` is visible as待确认 and cannot be directly retried.
- [ ] Remote success followed by local archive failure remains protected from
      duplicate retry and requires reconciliation.
- [ ] Publication records remain in the selected content workspace for backup
      and migration; they are absent from the installer.

## Known Alpha Limitations

- [ ] Playwright/browser login state may need manual setup.
- [ ] `hepan` is optional and requires a configured Python runtime, `requests`,
      `beautifulsoup4`, and a valid cookie. Missing it only blocks Hepan.
- [ ] Code signing is not configured.
- [ ] Auto-update is not configured.

## Clean-machine acceptance

- [ ] Test on Windows without Node.js, global `playwright-cli`, Codex cache, or
      the development repository.
- [ ] Settings shows independent Node, CLI, Edge/Chrome, built-in DOCX, and
      optional Hepan statuses.
- [ ] `ready`, `not_checked`, `optional_unconfigured`, and `unavailable` have
      distinct labels and colors; `not_checked` is not rendered as a failure.
- [ ] Browser self-check opens and closes temporary `about:blank` without
      leaving a daemon or package-directory profile.
- [ ] Development and installed builds use the same `com.autopublish.desktop`
      identity and canonical application configuration owner.
## Startup Verification (Alpha)

- [ ] Installed package contains esources/app/scripts/config.js.
- [ ] Installed app opens without Cannot find module '../../scripts/config'.
- [ ] Run 
ode scripts/verify-alpha-package.js <path-to-resources/app> to validate package contents.

## Generation verification

- [ ] Run `npm run verify`; it includes the focused generation seam tests when
      they are present, then the full test suite, renderer lint/build, and any
      requested packaged-app checks.
- [ ] In an isolated fixture workspace, verify catalog discovery -> normalized
      lookup -> batch preflight for正文-only, v2, legacy, and malformed files;
      do not use real AI, credentials, customer data, or network calls.
- [ ] Repeat the manual alpha paths for transient refresh feedback, custom-first
      visibility / `显示内置模板`, and batch count plus cost confirmation.
- [ ] In a disposable synthetic workspace, create two clients with 25 successful
      generated articles each and verify one target selection, one preflight,
      one confirmation, two client-scoped submission batches, and 50 queue
      tasks; do not use real customer articles or credentials.
- [ ] Verify incomplete provenance, duplicate article identities, changed batch
      revision, and renderer path-like IPC input are blocked with safe reason
      codes and no queue writes.
- [ ] Verify a client-group failure leaves completed groups intact and a retry
      submits only unfinished groups; repeated confirmation does not create a
      second article-target attempt.

## Hepan, submission batch, and history remediation

- [ ] In a disposable workspace, save only a Hepan category ID with existing
      Python/Cookie/vendor and confirm omitted fields are preserved.
- [ ] Test only a replacement Python or Cookie; blank sensitive inputs remain
      preserve-only and `clearVendorDir` is the only vendor clear operation.
- [ ] Confirm environment-backed Hepan settings are visibly read-only and safe
      status contains no complete path or Cookie.
- [ ] Run a fake-adapter batch through the real worker and confirm ledger and
      batch item states agree for failed, published, uncertain, and cancelled
      outcomes.
- [ ] Confirm a stale `queued` batch with a `failed` ledger reconciles without
      deleting records; ordinary cancellation is unavailable and failed-item
      cleanup removes only an unchanged queue pair.
- [ ] Confirm history uses one all-target trash preview/confirmation, cancels
      safe queued pairs, cleans safe failed pairs, and retains all publication
      records and attempts.
- [ ] Confirm a `submitting`, `submitted`, `uncertain`, modified-pair, or
      identity conflict blocks the entire selected trash operation.
- [ ] Confirm a queued pair whose sidecar source article is trashed is marked
      unselectable and the worker refuses it before any adapter call.
- [ ] Confirm removal transaction recovery completes after an injected crash
      without recreating a cancelled attempt; restore does not requeue.
- [ ] Confirm historical failed attempts can clean an unchanged queue pair even
      when the batch sidecar points to an older failed attempt; all ledger
      attempts remain intact.
- [ ] Confirm retrying the same failed queue pair rebinds batch and sidecar to
      the new attempt before any remote call; an injected rebind failure
      cancels the new reservation and makes no remote call.
- [ ] Confirm `pending_auto_recovery`, `needs_repair`, `committed`, and
      `superseded` are distinct in the UI; repeated removal confirmation
      reuses one open transaction.
- [ ] Run `node scripts/repair-article-removal-regressions.js --workspace
      <disposable-workspace> --dry-run`; output contains only counts, safe
      identifiers, fingerprints, and reason codes.
- [ ] Confirm Hepan `.md`, `.markdown`, and `.txt` fixtures produce safe,
      non-empty HTML while raw HTML and dangerous URL schemes are removed;
      existing DOCX behavior remains unchanged.
- [ ] Run the real Python `--validate-payload` seam on Node-generated Markdown
      and TXT payloads, including directory, symlink, missing, and invalid JSON
      fixtures; no Cookie or network is used.
- [ ] Confirm Hepan interval accepts 0–3600 seconds, defaults to 30, shows a
      zero-second warning, emits a cancellable countdown, and does not trigger
      a fixed whole-batch timeout.
- [ ] Open, edit, save, close, and copy a history article version in the same
      history view. Confirm unsaved protection and focus restoration.
- [ ] Open and close manual research answer editing, press Escape with and
      without dirty input, switch clients, and confirm answer/reference state
      and focus do not cross session boundaries.
- [ ] At `1128×527` and `1424×861`, expand long-title groups and confirm no
      page-level horizontal overflow or off-viewport row action.
# Runtime workspace check

Verify that the packaged app creates `%USERPROFILE%\Documents\AutoPublish` and its input/data/config folders. Confirm diagnostics before adding credentials or submitting work. The package must not contain user `.env`, input, data, logs, or backup files.

Keep workspace tool settings in `config/runtime-tools.json` and Hepan settings in `config/hepan.json`; these workspace files are created outside the package.

## Authentication gate and task progress

- [ ] Cold start shows only the J4125 login gate; it does not inspect a workspace,
      load customer data, or initialize business services before authentication.
- [ ] `auth.jiayubing.xyz` is displayed as a fixed HTTPS product endpoint. The
      package contains no password, token, private key, server database, or Cookie.
- [ ] Direct unauthenticated calls to every registered business IPC return the
      fixed `AUTH_REQUIRED` response without invoking the service handler.
- [ ] After login, selecting a workspace and entering the workbench still works.
- [ ] Platform submission displays `runId`, total/processed/result counters,
      current task, phase, interval countdown, and a retained terminal summary.
- [ ] Switching away from and back to “其他平台投稿” restores the same snapshot;
      it does not start a second worker or duplicate queue refresh.
- [ ] Stop/pause commands use the active run ID. A stale run ID is rejected.
- [ ] Closing the app does not pretend a worker continues; the next start shows
      `interrupted` or a status derived from the queue and publication ledger.
