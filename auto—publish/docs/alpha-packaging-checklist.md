# Alpha Packaging Checklist

## Artifact

- [ ] `release-alpha/` contains a portable exe or installer.
- [ ] Build started from a clean commit and the commit SHA is recorded.
- [ ] `resources/app/tools/node/node.exe --version` matches `runtime-tools-manifest.json`.
- [ ] Package contains `@playwright/cli`, `playwright`, `playwright-core`, and their licenses.
- [ ] Package contains `mammoth` and its license.
- [ ] `node scripts/verify-packaged-docx-runtime.js release-alpha\win-unpacked\resources\app` passes with isolated PATH.
- [ ] `node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke` passes with isolated PATH.
- [ ] App launches without white screen.
- [ ] Window title is `Auto Publish Desktop Console` or approved alpha title.

## Workspace

- [ ] Runtime workspace folders exist: `input`, `data`, `logs`, `published`, `failed`, `tmp`, `work`.
- [ ] Private `.env` was not bundled into the package.
- [ ] Package contains no input, data, published, logs, profile, state, cookie, or absolute developer-machine references.
- [ ] Test articles can be placed into the runtime `input/media` folder.

## Paid Media Flow

- [ ] 浠樿垂濯掍綋鎶曠 page opens.
- [ ] Article scan works.
- [ ] Media resource pool loads or shows a clear empty/error state.
- [ ] Draft save works.
- [ ] Real preflight opens, then the final confirmation appears before any media submission.

## Other Platforms Flow

- [ ] 鍏朵粬骞冲彴鎶曠 page opens if that feature branch has been merged.
- [ ] Queue refresh works for `lieju`, `toutiao`, and `hepan`.
- [ ] Submit confirmation appears before real submission.

## Known Alpha Limitations

- [ ] Playwright/browser login state may need manual setup.
- [ ] `hepan` is optional and requires a configured Python runtime, `requests`,
      `beautifulsoup4`, and a valid cookie. Missing it only blocks Hepan.
- [ ] Code signing is not configured.
- [ ] Auto-update is not configured.

## Clean-machine acceptance

- [ ] Test on Windows without Node.js, global `playwright-cli`, Codex cache, or
      the development repository.
- [ ] Settings shows independent Node, CLI, Edge/Chrome, built-in DOCX, and
      optional Hepan statuses.
- [ ] `ready`, `not_checked`, `optional_unconfigured`, and `unavailable` have
      distinct labels and colors; `not_checked` is not rendered as a failure.
- [ ] Browser self-check opens and closes temporary `about:blank` without
      leaving a daemon or package-directory profile.
- [ ] Development and installed builds use the same `com.autopublish.desktop`
      identity and canonical application configuration owner.
## Startup Verification (Alpha)

- [ ] Installed package contains esources/app/scripts/config.js.
- [ ] Installed app opens without Cannot find module '../../scripts/config'.
- [ ] Run 
ode scripts/verify-alpha-package.js <path-to-resources/app> to validate package contents.
# Runtime workspace check

Verify that the packaged app creates `%USERPROFILE%\Documents\AutoPublish` and its input/data/config folders. Confirm diagnostics before adding credentials or submitting work. The package must not contain user `.env`, input, data, logs, or backup files.

Keep workspace tool settings in `config/runtime-tools.json` and Hepan settings in `config/hepan.json`; these workspace files are created outside the package.
