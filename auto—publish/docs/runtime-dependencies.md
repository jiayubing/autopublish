# Runtime dependencies and recovery

The packaged desktop app uses the writable workspace `%USERPROFILE%\Documents\AutoPublish` by default (or `AUTO_PUBLISH_WORKSPACE` when explicitly set). Keep credentials in that workspace's `.env` and tool paths in `config/runtime-tools.json`; the runtime diagnostics report missing tools without exposing secret values.

Generated GEO content is saved before export. Export only creates a queued Markdown file in an input folder; it never publishes. An operator must review the item and make the final confirmation in the submission workbench.

Back up the workspace `data`, `clients`, `research`, `generated`, and `config` folders before upgrades. To recover, restore those folders into a stopped workspace, then open the app and use diagnostics before submitting any queue item.
