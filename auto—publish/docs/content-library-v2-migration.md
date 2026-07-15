# Content library v2 migration

`scripts/migrate-content-library-v2.js` is a one-shot operator tool. It is
kept in the repository for upgrades, but the alpha desktop package explicitly
excludes it.

## Before running

1. Back up the legacy directory and choose separate, writable destinations for
   the content library, local state, and application configuration.
2. Do not choose a destination inside the legacy directory, or place two
   destinations inside one another. Different drive letters are supported.
3. Close AutoPublish and make sure no other process is changing the legacy
   files.

## Dry run

Run and inspect the JSON report first:

```powershell
node scripts/migrate-content-library-v2.js `
  --source C:\AutoPublish-old `
  --content-library D:\AutoPublish-content `
  --local-state C:\Users\me\AppData\Local\AutoPublish `
  --app-config C:\Users\me\AppData\Roaming\AutoPublish\runtime-config.json `
  --dry-run
```

Dry-run only reads the source and existing destinations. It creates no
directory, configuration file, manifest, or completion marker. Resolve every
`conflicts` entry before executing. Missing optional legacy locations are
reported in `missing` and do not by themselves prevent migration.

## Explicit execution

After reviewing the dry-run output, repeat the command with `--execute`:

```powershell
node scripts/migrate-content-library-v2.js `
  --source C:\AutoPublish-old `
  --content-library D:\AutoPublish-content `
  --local-state C:\Users\me\AppData\Local\AutoPublish `
  --app-config C:\Users\me\AppData\Roaming\AutoPublish\runtime-config.json `
  --execute
```

The script copies files to a temporary file in the destination directory,
checks its SHA-256, and then renames it into place. Existing identical files
are skipped; differing files are conflicts and are never overwritten. A
failure leaves the source untouched and can be retried after the cause is
fixed. The migration manifest records completed files, so a retry resumes
without repeating successful copies.

Portable business data is placed in `clients`, `generated`, `templates`, and
`.autopublish` under the content library. Logs, caches, browser profiles, and
temporary files go to local state. Only the allow-listed platform runtime
settings from `.env` are written to the application configuration file. AI
provider variables and unknown variables are ignored; secret values are not
included in stdout, the manifest, or the completion marker.

## Verification and rollback

On success, verify that:

- `.autopublish/content-library-v2-migration-manifest.json` has `status:
  "complete"` and SHA-256 entries for every copied file.
- `.autopublish/content-library-v2-migration-complete.json` exists.
- The destination files can be opened and the application configuration is in
  the expected roaming location.
- The legacy directory still exists and is unchanged.

Rollback is manual: stop the application, move the newly created content and
local-state destinations aside, restore the previous configuration file if it
was already present, and continue using the backed-up legacy directory. The
script never deletes or renames legacy data, so no destructive rollback step is
required.
