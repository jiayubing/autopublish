# M06-G Post-closure Blocking Remediation

**Date:** 2026-08-11  
**Base integration HEAD:** `696f5cff183632bd4700df96cb006da98504adf9`  
**Current status:** production remediation and bounded re-audit PASS on the dirty candidate; implementation commit and post-commit clean-HEAD full gate evidence are still pending authorization.

## Findings in scope

| Severity | Classification | Finding | Candidate closure |
| --- | --- | --- | --- |
| P1 | `EXPOSED_PREEXISTING` | platform queue reader silently filtered an article when primary-file or sidecar `lstat` failed | only `ENOENT` remains an absence/race outcome; other inspection failures throw stable `PLATFORM_QUEUE_READ_FAILED` |
| P2 blocking | `EXPOSED_PREEXISTING` | paid-media configuration/article-state reads were projected as missing configuration or stale confirmation | only `PLATFORM_CONFIG_NOT_SET` maps to missing configuration; storage errors propagate; confirmation article/config read failures preserve their stable error and restore the unconsumed token for safe local retry |
| P2 blocking | `PROCESS_EVIDENCE_GAP` | `696f5cff` delivery did not preserve the required post-commit clean-HEAD full-gate evidence | not closed yet; must be generated and checked in after the remediation implementation commit |

The known development dependency audit result (five pre-existing vulnerabilities) remains non-blocking and was not expanded into dependency upgrades.

## Red-capable reproduction

Command:

```powershell
node --test --test-concurrency=1 tests/platform-workbench-service.test.js tests/phase-12-paid-media-preflight.test.js tests/workspace-runtime-lifecycle.test.js
```

Before the fix this command exited `1`: 34 tests, 30 passed, 4 failed. The failures were exact: queue `lstat` produced no exception; corrupted media config produced no exception; confirmation article-state failure returned `PAID_MEDIA_CONFIRMATION_STALE`; configuration read failure poisoned the token so the next call returned `PAID_MEDIA_CONFIRMATION_STALE`.

## Candidate implementation and bounded re-audit

- Queue reader now distinguishes `ENOENT` from inspection failure for selected files, scanned primary files and sidecars. The bounded re-audit added the sidecar branch to the same P1 matrix.
- Both workspace composition consumers preserve all media configuration errors except the intentional `PLATFORM_CONFIG_NOT_SET` → empty-code mapping.
- Paid confirmation maps content-store read failure to `PAID_MEDIA_ARTICLE_STATE_UNAVAILABLE`, creates no admission fact, and resets only the local `inFlight` marker. Configuration read failures are likewise propagated and leave the unconsumed confirmation safely retryable.
- `PAID_MEDIA_ARTICLE_STATE_UNAVAILABLE` is registered in the public submission error catalog with safe storage/retry semantics.
- No remote request, paid admission, publication fact, second writer, compatibility path or new state machine was introduced.
- Authoritative AST candidate reconciliation is `505` scanned files / `274` files with handlers / `1,154` handlers / `0` parse diagnostics. A remains 44/197 with the two configuration catches reclassified as propagation; C is 67/257 after three explicit propagation handlers; B/D/E/F totals are unchanged. Detailed affected ledger is in section 11 of the authoritative inventory.

Actual green verification on the final dirty candidate:

```text
node --test --test-concurrency=1 tests/platform-workbench-service.test.js tests/phase-12-paid-media-preflight.test.js tests/workspace-runtime-lifecycle.test.js tests/m06-c-remote-process-runtime.test.js tests/content-submission-ipc.test.js tests/phase-06-submission-typed-ipc.test.js tests/phase-06-platform-typed-ipc.test.js
61 tests, 61 passed, 0 failed/skipped/todo/cancelled

npx prettier --check --end-of-line auto <four changed production files and two Prettier-managed regression files>
PASS

npm run lint
PASS

git diff --check
PASS
```

Bounded re-audit covered only the three findings, repair diff, direct consumers, no-admission side-effect invariant, retry state and affected IPC contracts. No escalation condition was found.

## Required closure after Git authorization

1. Commit the implementation/tests/status/handoff as one remediation intent based on `696f5cff`.
2. Verify exact remediation `HEAD`, parent and `git status --porcelain=v1` clean.
3. On that clean HEAD, set `RUN_ELECTRON_FOCUS_TESTS=1` and run the complete root suite through `scripts/create-root-test-evidence.js`, writing the initial artifact outside the repository so the tested source state remains clean.
4. Preserve exact HEAD/parent/tree, source-state digest, Node/npm versions, command, start/end timestamps, runner lifecycle/counts and result in a checked-in evidence artifact/handoff update.
5. Commit only the resulting docs/evidence update. Since no production source, schema, test or gate changes after the tested remediation HEAD, the saved clean-HEAD result remains authoritative. Then restore M06/M06-G/Maintenance 10.5=`COMPLETE`; Ticket 25 remains `PENDING`/blocked/not started.

No commit, push, release, real login, publication, payment, upload, production database or external write has been performed in this remediation task so far.
