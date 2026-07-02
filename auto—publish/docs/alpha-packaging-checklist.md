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

- [ ] 付费媒体投稿 page opens.
- [ ] Article scan works.
- [ ] Media resource pool loads or shows a clear empty/error state.
- [ ] Draft save works.
- [ ] Preflight opens.

## Other Platforms Flow

- [ ] 其他平台投稿 page opens if that feature branch has been merged.
- [ ] Queue refresh works for `lieju`, `toutiao`, and `hepan`.
- [ ] Submit confirmation appears before real submission.

## Known Alpha Limitations

- [ ] Playwright/browser login state may need manual setup.
- [ ] `hepan` requires local Python and cookie configuration.
- [ ] Code signing is not configured.
- [ ] Auto-update is not configured.