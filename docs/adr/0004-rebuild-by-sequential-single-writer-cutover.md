---
status: accepted
---

# Rebuild by sequential single-writer cutover

AutoPublish's architecture rebuild is executed as a feature-frozen sequence of independently verified phases. Each phase may replace and delete an old production seam in the same change; the project will not maintain long-lived old/new implementations or dual-write operational state merely to support concurrent feature delivery. This accepts planned downtime and concentrated refactoring risk in exchange for a smaller final interface and fewer compatibility branches.

## Consequences

- Phases run strictly in order and no later phase starts before the previous completion evidence is recorded.
- Existing user data is protected by snapshots, dry-run migration and rollback rehearsal even though old executable compatibility is not a goal.
- At every phase boundary the repository must build, test and expose one production seam; temporary adapters must be removed before the owning phase closes.
- New product features remain frozen until the final readiness gate, except separately authorized emergency security or data-loss fixes.

