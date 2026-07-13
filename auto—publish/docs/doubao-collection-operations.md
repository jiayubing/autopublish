# Doubao Collection Operations

This guide describes the local desktop workflow. Use disposable test
questions for a smoke check. Do not put credentials, secret keys, cookies, or
customer-identifying text in source files, screenshots, diagnostics, or this
document.

## Before starting

1. Configure the writable workspace before launching the desktop app. In
   packaged Windows builds, omit the variable to use the default
   `%USERPROFILE%\Documents\AutoPublish`; or set an explicit workspace in
   PowerShell:

   ```powershell
   $env:AUTO_PUBLISH_WORKSPACE = 'D:\AutoPublish-Smoke'
   & '.\AutoPublish.exe'
   ```

   The desktop UI does not currently provide a workspace picker. The same
   `AUTO_PUBLISH_WORKSPACE` variable is honored by development launches.
2. Confirm that the workspace is writable and that diagnostics are available
   at `logs/doubao-diagnostics/`.
3. Create or import questions for the current client. The application stores
   them in `clients/<client-id>/questions.json`.

## First login

1. Open the Doubao collection view and check the displayed login state.
2. Choose **Open Doubao login**. The application opens a visible browser
   session so the operator can complete the normal QR, code, or browser
   challenge flow.
3. Finish login, return to the collection view, and refresh the login state.
   Start collection only after it reports authenticated.
4. The session profile is retained at
   `work/playwright-cli/profiles/doubao/` under the configured workspace for
   the next run. `desktop/workspace-paths.js` exposes `browser/doubao/` as a
   reserved path, but the current adapter does not use it for the active
   profile. Treat both paths as private workspace data; neither is part of the
   app installation or alpha package.

## Single collection

1. Select one enabled question and choose **Collect one**.
2. Review the question, answer, and references shown by the page. A complete,
   non-empty answer is saved as
   `research/<client-id>/<question-id>.json`.
3. Confirm the saved collection method (`automatic`), collection time, answer,
   and references before using it for article generation.
4. A login error, challenge, timeout, empty answer, or page error is a failed
   collection. It does not replace a previous successful record.

## Batch collection

1. Select the intended questions and choose **Start batch**. Only one Doubao
   queue may run at a time, and tasks run serially.
2. Watch the task bar for the current question, completed count, wait timer,
   and error text. The queue waits a randomized 15–30 seconds between tasks.
3. Each successful answer is written to the same research store used by single
   collection. A later task must not start while the previous task is still
   collecting or saving.

### Pause, continue, and stop

- **Pause** finishes the current answer and save when possible, then pauses
  before the next task. It does not intentionally save a partial answer.
- **Continue** resumes from the remaining pending tasks.
- **Stop** prevents pending tasks from starting and lets the current browser
  operation finish or close safely. Pending tasks become cancelled; start a
  new batch for them after reviewing the result.

## Retrying failures

Use **Retry failed** after reviewing the failure reason and confirming that
the browser is authenticated. It requeues failed tasks only; it does not
repeat successful tasks. A retry that succeeds atomically replaces the current
research result. A retry that fails keeps the prior successful result, if one
exists, and leaves the failure visible in queue state.

## Manual correction

When an answer needs correction or automatic collection cannot complete:

1. Open the answer editor for the matching question.
2. Edit the answer text and add, edit, or remove reference URLs.
3. Save only after checking that the answer is non-empty and every reference
   uses an HTTP or HTTPS URL.
4. The saved record uses `collectionMethod: "manual"`, keeps the question ID,
   and remains in the same research store. Do not create a second ad-hoc file.

## Re-collection and overwrite rules

- A successful explicit re-collection replaces the research file for the same
  client/question ID.
- A failed re-collection never overwrites a successful answer with an empty or
  partial record.
- Deleting a question or its current research requires confirmation. Existing
  generated articles remain readable because they retain source metadata and
  snapshots.
- Article generation can select one or multiple valid answers. A multi-answer
  article stores the selected IDs and one source snapshot per answer.

## Diagnostics and backup

Redacted screenshots and structural summaries from failed collection attempts
are stored under `logs/doubao-diagnostics/`. The application retains the
newest 20 attempts. Inspect diagnostics before sharing them; never share the
browser profile.

Back up the workspace, including `clients/`, `research/`, `generated/`, and
intentionally retained `published/` output, to a restricted location. Keep
`work/playwright-cli/profiles/doubao/` in a separate access-controlled backup
or omit it when login continuity is not needed. Do not back up `.env` or copy
credentials into the workspace. Restore into a new workspace first and verify
permissions before replacing an active one.

## Exit behavior

Close or quit the application only after the queue is paused or complete. On
quit, the desktop service stops active collection, closes the browser session,
and waits for disposal before the application exits. The persistent profile
remains for the next login; in-memory queue tasks do not resume after restart.
Answers already saved in `research/` and generated articles remain available.

## Task 11 acceptance record (2026-07-12)

Live login and collection are `BLOCKED_BY_ENVIRONMENT`. `npm run desktop`
exited before an interactive session was available because this environment
could not use Electron's GPU/cache paths. No account, cookie, customer name,
real HTML, or screenshot was used or recorded.

The final automatic checks were:

| Result | Command | Evidence |
| --- | --- | --- |
| `PASS` | `npm test` | 281 passed, 0 failed, 4 skipped. |
| `PASS` | `npm --prefix media-workbench run lint` | TypeScript check exited 0. |
| `PASS` | `npm run build:renderer` | Renderer lint and Vite build exited 0. |
| `PASS` | `npm run verify` | Full verification completed successfully. |
| `PASS` | `npm run pack:alpha` | Alpha unpacked app and portable artifact were generated. |
| `PASS` | `node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources/app` | Printed `Alpha package contents OK`. |

Record one result for every release-smoke item before publishing an alpha
build. Use `PASS` only when the behavior was observed in the intended
environment; use `FAIL` when an observed behavior is incorrect or needs
investigation; use `BLOCKED_BY_ENVIRONMENT` when the environment prevents the
check. Do not enter credentials or customer names in the notes.

| Result | Check | Evidence / note |
| --- | --- | --- |
| `BLOCKED_BY_ENVIRONMENT` | Three test questions can be created and remain after restart. | No interactive desktop session. |
| `BLOCKED_BY_ENVIRONMENT` | QR/browser login succeeds and is reused after restart. | Live login unavailable. |
| `BLOCKED_BY_ENVIRONMENT` | A single answer matches the page and is non-empty. | Live collection unavailable. |
| `BLOCKED_BY_ENVIRONMENT` | Batch tasks are serial and wait 15-30 seconds between tasks. | Live collection unavailable; automated queue tests are separate evidence. |
| `BLOCKED_BY_ENVIRONMENT` | Pause, continue, stop, and retry-failed follow the state machine. | No interactive desktop session. |
| `BLOCKED_BY_ENVIRONMENT` | Successful re-collection overwrites; failed re-collection preserves the old result. | Live collection unavailable. |
| `BLOCKED_BY_ENVIRONMENT` | A manual answer and reference URLs can be saved. | No interactive desktop session. |
| `BLOCKED_BY_ENVIRONMENT` | Two answers can generate, save, and export an article. | No interactive desktop session. |
| `BLOCKED_BY_ENVIRONMENT` | Exiting the application leaves no collection task running. | Desktop startup is blocked by the environment. |
| `PASS` | The package contains no workspace private data. | Verified against the actual app directory below. |

Automated checks have passed, but real online acceptance remains blocked by the
environment; live checks must be rerun in an interactive environment before
publishing the release candidate.
For the package check, run the verifier against the actual unpacked app
directory:

```powershell
node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources/app
```

The verifier must exit with code 0 and print that package contents are OK.
