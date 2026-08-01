# 06 — Production packaging 与离线制品 smoke

**What to build:** 通过 production directory 制品启动和离线 self-test 时，Python、Playwright/runtime 工具、Hepan 脚本、migration CLI 等外部执行资源都解析到真实解包普通文件；安装目录、用户状态、可迁移内容库和私密工件互不混用，旧 workspace schema 会明确拒绝。

**Blocked by:** None for local automation. Formal release still depends on the human gates listed in `auto—publish/docs/release-checklist.md`.

**Status:** completed — automated packaging acceptance passed; formal release remains `BLOCKED_RELEASE` until human gates are recorded.

## Scope

- 对 ASAR、app.asar.unpacked、resources 和外部 executable path 建立统一解析与验证。
- `electron-builder --dir` 后运行不依赖网络、不读取生产 secrets 的 self-test。
- 验证 Python/Playwright/runtime/migration CLI 路径为可执行普通文件，拒绝 ASAR 伪路径、symlink 和源码路径回退。
- 验证安装、本地状态、可迁移内容库和私密工件的目录分离，以及旧 schema marker 的 fail-closed 升级策略。

## Module boundaries

- **Packaged runtime resolver:** 只根据 packaged/development context 解析一个工具类型的路径；不执行命令或修改用户数据。
- **Artifact manifest verifier:** 只检查文件存在、普通文件、canonical path、hash/版本和必要权限；不启动 Electron。
- **Offline self-test runner:** 只编排各工具的无网络 smoke 并输出安全摘要；不承担路径推断。
- **Workspace schema gate:** 只读取 marker、比较版本和返回 upgrade/reject 结果；不自动迁移真实 workspace。
- **Packaging test fixtures:** 只构造临时 unpacked tree 和旧/新 marker；不依赖当前机器的 release 目录。

每个 resolver 只负责一种资源类别，约 200 行为软上限；不要把所有路径判断重新集中到 desktop main 或一个巨型 verify 脚本。

## Acceptance criteria

- [x] production ASAR 中 Python、Playwright/runtime 工具、Hepan 脚本和 migration CLI 都能解析到 app.asar.unpacked 或其他真实普通文件。
- [x] 任一路径缺失、位于 ASAR 内、为 symlink/junction、canonical path 越界或不可执行时，self-test 明确失败，不回退到源码路径。
- [x] `electron-builder --dir` 生成目录制品后可离线运行 self-test；self-test 不连接供应商、不使用 production secret、不发送媒体/Auth 请求。
- [x] 安装目录、用户状态、可迁移内容库和私密临时工件使用不同根目录；启动和异常退出清理不跨根删除。
- [x] workspace schema marker 版本高于当前版本时明确拒绝旧版本；版本匹配时只读验证通过，不悄悄降级或改写 marker。
- [x] package smoke 验证 Electron 主进程、preload、renderer、Python、Playwright/runtime 和 migration CLI 的实际文件路径与退出码；没有可用的 packaged Hepan Python 时，该执行项只报告 `SKIPPED_OPTIONAL`，不会回退到源码路径。
- [x] 现有非签名 `--dir` smoke 继续通过；正式签名变量缺失只阻塞正式 release，不改变安全配置或路径规则。
- [x] 记录制品版本、schema marker、资源清单和 hash；不记录 cookie、API key、绝对用户路径或正文。

## Evidence

- `npm run test:packaging`: 42 tests passed, including resolver, schema, artifact, Electron smoke, and offline self-test contracts.
- Alpha `electron-builder --dir` packaging and `verify-alpha-package.js`: passed.
- Production `electron-builder --dir` packaging and `verify-production-package.js`: passed. The verifier checked the real ASAR, `app.asar.unpacked`, resource files, hashes, Electron entry points, and then launched the packaged `鱼饼大王.exe` in `--offline-packaging-smoke` mode; main, preload, and renderer all reported ready. It also verified the Playwright runtime, migration CLI, workspace schema, storage boundaries, and isolated cleanup.
- The packaged offline result reports Hepan as `SKIPPED_OPTIONAL` when no packaged Python interpreter is supplied; it never falls back to a source-tree script.
- `build/production-artifact-manifest.json` and `build/release-evidence-manifest.json` contain only relative artifact paths, versions, hashes, and safe statuses. The release evidence state is `BLOCKED_RELEASE` because signing, TLS, installer/rollback, and external E2E remain human gates.
- The signed production configuration was not run without `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`; it still requires code signing.

## Implementation notes

- 已有的 Hepan packaged resolver 作为基线契约，ticket 只补齐其 production matrix 和所有其他外部工具的同类验证。
- 不在本 ticket 配置证书、签名、DNS、WAF 或生产网络。
- 需要真实安装器/SmartScreen/ACL 的验收保留人工 release gate，不用本地 fake smoke 冒充通过。
