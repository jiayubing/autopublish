# Publication ledger v1 migration

This tool imports safe evidence from an existing content workspace into the
per-target publication ledger. It never removes or rewrites legacy queue
files, sidecars, order JSONL, or `published` files.

The command is read-only by default:

```text
node scripts/migrate-publication-ledger-v1.js --workspace <content-workspace>
```

The result is a JSON dry-run report. It does not create the publication
directory or migration manifest. To write new ledger records, the operator
must provide both `--execute` and the exact confirmation token:

```text
node scripts/migrate-publication-ledger-v1.js \
  --workspace <content-workspace> \
  --execute --confirm MIGRATE_PUBLICATION_LEDGER_V1
```

The tool uses the existing publication ledger API. New records are written
under `<workspace>/.autopublish/submission-records/publications/`; the
manifest is `<workspace>/.autopublish/submission-records/` +
`publication-ledger-v1-migration.json`.

## Evidence rules

- A queue file is eligible only when its `.submission.json` sidecar has a
  stable `clientId` and `generatedArticleId`, a declared target, `status` of
  `queued` (or no status), and a `contentHash` matching the queue file.
- If a sidecar names a submission batch, the batch id, client, article,
  target, content hash, and file name must agree before `batchId` is recorded.
- A paid-media order is eligible only with a stable article identity and a
  stable `resource_id`. An explicit remote success becomes `submitted`; it
  becomes `published` only when the order evidence explicitly reports the
  published status (the legacy status code `2`, or an explicit published
  marker). An explicit remote failure becomes `failed`.
- An order with an unclear result, a missing article/resource association, or
  a dry-run result is reported with a stable code and does not create a
  publication fact.
- A file found only in `published` is reported as `legacy_unlinked`. The
  archive is evidence for an operator, not proof of publication, and does
  not create a ledger record by itself.

## Manifest safety and repeatability

The manifest contains only relative source references, ledger target
references, source byte counts, SHA-256 digests, source/ledger version
numbers, the Git commit identifier, safe statuses, stable ids, and stable
codes. It does not copy article text, order JSON, secrets, cookies, API keys,
or remote responses. A JSONL order source is represented by its relative file
and line number plus a digest.

Execution creates a publication only when the target aggregate is absent.
Existing aggregates, including publications created after the original
legacy data, are left untouched. The completed manifest is created with
exclusive creation; running the same migration again is a no-op. If an
execution stops after some ledger writes, a later execution reuses those
aggregates and completes the remaining work without deleting legacy data.

Stable diagnostic codes include `QUEUE_SIDECAR_HASH_MISMATCH`,
`QUEUE_BATCH_MISMATCH`, `ORDER_ARTICLE_UNSTABLE`,
`ORDER_REMOTE_RESULT_UNCLEAR`, `LEGACY_UNLINKED`, and
`MIGRATION_CONFIRMATION_REQUIRED`. Error output contains the code only.
