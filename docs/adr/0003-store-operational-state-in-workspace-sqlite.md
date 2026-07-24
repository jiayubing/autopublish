---
status: accepted
---

# Store operational state in workspace SQLite

AutoPublish keeps user-authored content such as Markdown, images, templates and portable source material as files, but moves publication attempts, remote evidence, recovery intent, submission batches, order references and other coordination state into one SQLite database inside the portable content library. The current file stores preserve portability but force cross-file locks, compare-and-swap and recovery protocols across several writers; Electron 43.1.1 already provides Node 24.18 `node:sqlite`, so SQLite transactions can give one authoritative local write model without adding a native database dependency.

## Consequences

- The content library remains portable and human-inspectable for authored content.
- SQLite becomes the single writer for operational state; JSON/JSONL sources are imported once and then become read-only migration evidence.
- External publishing is never wrapped in a database transaction. A durable intent is committed before the remote call, and the observed outcome is committed afterward.
- Old application versions are not required to write an upgraded content library. Backup, dry-run migration and restore verification remain mandatory.

