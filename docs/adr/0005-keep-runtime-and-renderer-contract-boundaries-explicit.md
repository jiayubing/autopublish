---
status: accepted
---

# Keep runtime and renderer contract boundaries explicit

AutoPublish keeps the Electron main process, workers, and domain runtime compatible
with CommonJS. Domain contracts use closed runtime validators so the same
implementation can be loaded by the main process and workers without exposing Node
implementation details to the renderer.

The renderer consumes separate strict TypeScript declarations containing only
versioned, transport-safe records. Main-process and renderer type checks, runtime
contract tests, renderer builds, and packaged application smoke tests jointly prove
this boundary.

This decision does not require a whole-repository TypeScript migration. Any future
module-system or language migration must preserve the validated transport boundary
and provide equivalent runtime and packaging evidence before replacing it.
