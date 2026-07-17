# Runtime dependencies and recovery

The packaged desktop app uses a user-selected portable content library. Keep
application configuration in the canonical `%APPDATA%\AutoPublish` location
and local runtime state in `%LOCALAPPDATA%\AutoPublish`. The package includes
the exact Playwright CLI and a verified standard Node runtime, so ordinary
users do not edit `runtime-tools.json`.

Generated GEO content is saved before export. Export only creates a queued Markdown file in an input folder; it never publishes. An operator must review the item and make the final confirmation in the submission workbench.

Back up the content library and the migration manifest before upgrades. To
recover, stop the application and all browser daemons, restore the portable
content/local-state backups, then run the Settings browser self-check before
submitting any queue item.
