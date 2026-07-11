# Alpha Packaging Checklist

## Artifact

- [ ] `release-alpha/` contains a portable exe or installer.
- [ ] App launches without white screen.
- [ ] Window title is `Auto Publish Desktop Console` or approved alpha title.

## Workspace

- [ ] Runtime workspace folders exist: `input`, `data`, `logs`, `published`, `failed`, `tmp`, `work`.
- [ ] Private `.env` was not bundled into the package.
- [ ] Test articles can be placed into the runtime `input/media` folder.

## Paid Media Flow

- [ ] 浠樿垂濯掍綋鎶曠 page opens.
- [ ] Article scan works.
- [ ] Media resource pool loads or shows a clear empty/error state.
- [ ] Draft save works.
- [ ] Preflight opens.

## Other Platforms Flow

- [ ] 鍏朵粬骞冲彴鎶曠 page opens if that feature branch has been merged.
- [ ] Queue refresh works for `lieju`, `toutiao`, and `hepan`.
- [ ] Submit confirmation appears before real submission.

## Known Alpha Limitations

- [ ] Playwright/browser login state may need manual setup.
- [ ] `hepan` requires local Python and cookie configuration.
- [ ] Code signing is not configured.
- [ ] Auto-update is not configured.
## Startup Verification (Alpha)

- [ ] Installed package contains esources/app/scripts/config.js.
- [ ] Installed app opens without Cannot find module '../../scripts/config'.
- [ ] Run 
ode scripts/verify-alpha-package.js <path-to-resources/app> to validate package contents.
# Runtime workspace check

Verify that the packaged app creates `%USERPROFILE%\Documents\AutoPublish` and its input/data/config folders. Confirm diagnostics before adding credentials or submitting work. The package must not contain user `.env`, input, data, logs, or backup files.

Keep workspace tool settings in `config/runtime-tools.json` and Hepan settings in `config/hepan.json`; these workspace files are created outside the package.
