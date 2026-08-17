# Post-Wave Platform Extensibility Post-closure Remediation

**日期：**2026-08-17  
**结论：**`COMPLETE`。Primary architecture evaluation 发现的两个 blocking P2 已完成最小根因修复、bounded re-audit、最终 clean-HEAD gate 与无签名 NSIS 更新；无 remaining blocking/deferred finding。

## Scope and source state

- Base HEAD：`444993ea81c9bbd9e5f87547cfce35b13f54f73b`。
- Implementation commit：`e505be576f3a3be2d82bada97056e3f2bae0349b`（`fix(platforms): quarantine conflicting definitions`）。
- 修改范围：`src/core/platforms.js`、`tests/platform-definition-loader.test.js`。
- 未修改 schema、文章生命周期、订单/attention/publication writer、事务、不确定结果、远端副作用或 production signing contract。

## Findings and remediation

### F1 — P2 / `INTRODUCED_BY_CHANGE` / blocking

`loadEnabledPlatformDefinitions()` 按启用目录读取 code-owned definition，但未验证目录 ID 与 `definition.id` 一致，也未在安全投影前隔离重复 definition identity。错误 definition 的 `externalHosts` 因而可能进入 Electron external-link allowlist。

Remediation：definition collection 在产生任何 consumer projection 前检查内置目录 identity，隔离 ID mismatch，并对重复 definition ID 的全部冲突项 fail-closed。安全 consumer 继续只读取 loader 结果，没有建立第二套 host 校验 owner。

### F2 — P2 / `INTRODUCED_BY_CHANGE` / blocking

启用 definition collection 未检查 `scanDir` 唯一性；两个平台可映射同一个 `input/<scanDir>`，使同一队列文件出现多平台归属。

Remediation：loader 将 `scanDir` 作为启用 definition 集合唯一键，隔离全部冲突项。queue reader 保持只消费已验证的 `submissionDirectoryEntry`，没有新增局部兼容或 fallback。

## Bounded re-audit

只复审 F1/F2、修复 diff、definition/loader、安全 host projection、queue directory projection、reference platform 与直接 worker/cleanup consumers：

- mismatch、duplicate ID、duplicate `scanDir` 均产生稳定安全诊断并在 projection 前隔离；
- 错误 definition 的 host 不进入 `createExternalLinkPolicy()`；
- 重复 `scanDir` 平台不进入 workbench queue groups；
- 合法平台仍可在冲突项旁独立装载；
- 没有新增 registry、compatibility facade、平台 ID 分支、writer、retry 或 transport；
- 未触发 Audit Protocol escalation。

结论：`PASS`。

## Validation

在 dirty implementation source state 上先完成：

- direct owner tests：`31 passed / 0 failed / 0 skipped`；
- bounded direct matrix：`60 passed / 0 failed / 0 skipped`；
- `npm run test:packaging`：`49 passed / 0 failed / 0 skipped`；
- `npx eslint src/core/platforms.js tests/platform-definition-loader.test.js`：PASS；
- `git diff --check`：PASS；
- Electron focus fixture enabled full `npm test`：`1937 passed / 0 failed / 0 skipped`；
- `npm run pack:production:smoke:dirty`：PASS。

提交 implementation 后，在 clean HEAD `e505be576f3a3be2d82bada97056e3f2bae0349b` 上重新运行：

- Electron focus fixture enabled full `npm test`：收集 267 files，`1937 passed / 0 failed / 0 skipped`；runner lifecycle `CLOSED`、`allFilesReported=true`、`noSkippedTodo=true`；
- `npm run pack:production:smoke`：PASS；production manifest 绑定 clean commit `e505be5`，packaged preload、Renderer、Playwright、migration CLI、workspace schema/storage boundary 与 contract absence 全部通过；Hepan Python 为 `SKIPPED_OPTIONAL (optional-python-not-supplied)`。

## Unsigned NSIS artifact

- 采用仓库既有 `electron-builder.alpha.yml` unsigned route；`electron-builder.production.yml` 的 `forceCodeSigning` 与 certificate contract 未修改。
- 首次 `npm run dist:alpha` 完成 clean gate、runtime tools、Renderer、preload 与 unpacked app 后，原生 7-Zip 在 NSIS archive compression 异常退出（Windows status `3221225477`）。
- 使用同一 `7za.exe`、同一 `release-alpha/win-unpacked`、同样压缩参数的最小复现成功处理 467 MiB；诊断临时 archive 已删除。该证据排除稳定路径/内容错误，符合一次性 native compressor failure。
- 只重跑失败 stage：`npx electron-builder --win nsis --config electron-builder.alpha.yml` PASS；日志明确 `file signing skipped via signExecutable configuration`。
- `node scripts/verify-alpha-package.js release-alpha/win-unpacked/resources`：`Alpha package contents OK`。
- 产物：`release-alpha/ETO—001-Alpha-1.0.1-x64.exe`。
- 大小：`128349183` bytes。
- SHA-256：`AB5CC5C61673659806A431A471A78D5C4A8764206578963B93594EA63B57B34D`。
- Authenticode status：`NotSigned`。

安装包与 build/release 目录属于生成物，不进入 Git commit。

## External operations and remaining risk

未执行真实登录、投稿、图片上传、付费、取消、订单核对、生产数据库或迁移。真实平台外部协议仍由合成测试与 package contract 覆盖，后续真实验收需要逐次明确授权。未 merge、未 push。
