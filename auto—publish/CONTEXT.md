# Auto Publish

This project automates classified-post publication across multiple external websites. It exists to turn a batch of article files into repeatable publication runs with reusable login state, platform-specific automation, and a future desktop control surface.

## Language

**Publication Platform**:
An external website that accepts article submissions, such as Lieju. A platform owns its own login rules, form fields, success conditions, and automation quirks.
_Avoid_: Site, channel, target

**Media Submission Platform**:
A Publication Platform where submission happens through an API and produces a trackable order before the article is actually published. It may not have a browser login flow, but it still participates in the same publication workflow.
_Avoid_: API script, media API, channel

**Platform Adapter**:
A project module that knows how to publish to exactly one Publication Platform while conforming to the shared publishing workflow.
_Avoid_: Script, spider, robot

**Source Article**:
A local article file plus its parsed metadata before publication begins. The metadata may come from the filename for legacy flows, but the long-term source of truth should be a sidecar metadata file.
_Avoid_: Doc, content file, material

**Article Metadata Sidecar**:
A sidecar file stored next to a Source Article that holds publication metadata not suitable for the filename. It is the preferred place for platform-specific or future-facing fields.
_Avoid_: Config, payload, manifest

**Publication Job**:
A single attempt to publish one Source Article to one Publication Platform.
_Avoid_: Task, process, run

**Submission Order**:
A platform-issued record created after an article is submitted to a Media Submission Platform. It represents an accepted submission request, not proof that the article has been published.
_Avoid_: Publish result, receipt, success

**Media Resource**:
A selectable outlet or account inside a Media Submission Platform that receives a submitted article. Operators choose Media Resources based on fit, price, and past performance.
_Avoid_: Resource ID, media item, target

**Media Pool**:
A curated set of Media Resources that the Operator trusts for repeated use. It exists to avoid choosing from the full platform catalog during every Publication Batch.
_Avoid_: Favorites, whitelist, list

**Publication Batch**:
A grouped run that processes multiple Publication Jobs under one operator action.
_Avoid_: Queue, mission

**Operator**:
The human who prepares files, logs into platforms when needed, and triggers publication runs.
_Avoid_: User, admin

**Platform Session**:
Reusable browser state, profile data, and saved authentication associated with one Publication Platform account.
_Avoid_: Browser, daemon

**Platform Account**:
One operator-owned login identity on a Publication Platform. A platform may later support multiple Platform Accounts, but the first version only needs one active account per platform.
_Avoid_: User, login, credential set

**Publishing Core**:
The shared application layer that scans files, converts documents, schedules Publication Jobs, records results, and delegates platform-specific work to Platform Adapters.
_Avoid_: Main script, engine room

**Desktop Console**:
The future desktop application that lets the Operator configure platforms, review Source Articles, trigger Publication Batches, and inspect results without using raw scripts.
_Avoid_: UI, panel, shell
