---
status: accepted
---

# Phase 01 main-process type strategy

Phase 01 keeps the existing CommonJS Electron main and worker runtime in place. New
domain contracts are pure CommonJS modules with closed runtime validators so the same
implementation loads in Node main-process tests and worker tests without exposing
Node implementation to the renderer. The renderer receives separate strict TypeScript
DTO declarations that contain only versioned transport-safe records.

`tsconfig.phase-01-main.json` strictly checks the new composition port declarations;
`media-workbench/tsconfig.strict.json` strictly checks the renderer contract. Node
load tests, worker DTO smoke, renderer build, and `electron-builder --dir` package
smoke are the actual compatibility proof. This avoids a speculative whole-repository
TypeScript rewrite. Source maps and production package policy remain the existing
Electron-builder policy until Phase 07 changes them under its own acceptance gates.
