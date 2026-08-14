---
status: accepted
---

# Separate article lifecycle from submission work

AutoPublish separates article content and availability from regular-platform queues, confirmed paid batches, supplier orders, and operator attention items. The previous six-stage article navigation was simple to count but forced unrelated owners and failure semantics into one user-facing state model, while queue actions remained distributed across several pages.

The article library now projects content-oriented sections, and the submission center presents queues, confirmed paid batches, and typed attention work. A regular target exists only after queue admission; a paid target exists only after explicit price confirmation. This costs a coordinated UI and contract migration, but keeps remote-side-effect rules local to the regular and paid modules and prevents a new universal workflow state machine from becoming a shallow, high-coupling owner.
