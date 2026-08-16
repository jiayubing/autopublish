# Post-Wave E0 Primary Audit 与 Closure

**Scope：**E0 consumer/platform-ID/image/package ledger、`PlatformDefinitionV1` exact schema、capability/contribution port matrix、standard extension contract、test disposition，以及其直接源码事实。审计不覆盖 E1 实现或历史 Wave。

**Source state：**`codex/jiagou @ 7747e64743ad3441097df1294874bc120772a1ad + E0 documentation diff`

## Checked invariants

- 四个 built-in definitions 能表达 Toutiao、Hepan、Lieju 和 media 的真实差异，且 resource/paid 路线不进入普通 submission port。
- capability 为 true 时有确定 required port；false 时对应 port 不可达；不存在 `any capability bag`。
- 标准平台扩展预算不要求修改 queue/lifecycle/IPC/Renderer/composition。
- migration-only ID 只能解释历史事实，不能获得 executable capability。
- definitions、external hosts 和 runtime artifacts 不能由 workspace/env/remote 扩权或绕过 package whitelist。
- 图片只有一个 owner；selection/read 两条 production 链及 Lieju 直接内部依赖均已记录。
- 测试 disposition 会替换旧 surface，而不是长期叠加新旧合同。

## Primary Audit findings

### F1 — P1 / `PROCESS_EVIDENCE_GAP` / blocking

原四平台投影把 Lieju 标为 `legacyQueueImport=true`，但 `src/platforms/lieju/adapter.js` 只提供 regular `preparePlatformSubmission`，没有 legacy `scanArticles`、`parseArticleFiles` 或 `publishArticle`；worker 对 `publishArticle` 是硬要求。该投影无法通过自身 required-port matrix，也会诱导 E1 制造兼容 publish port。

**Remediation：**Lieju 改为 `regularSubmission=true / legacyQueueImport=false`；明确 `contentQueueImport` 旧布尔值不能同时代表两个 capability，E2 应关闭 Lieju 的不可执行 legacy worker 暴露。

### F2 — P1 / `PROCESS_EVIDENCE_GAP` / blocking

原 occurrence ledger 只列代表文件，未达到 E0 “所有 production/package/migration 平台 ID 出现点”要求，遗漏 content profile、settings/diagnostics、paid/resource domain、production-file fixture 等 owner，无法可靠约束 E2 去重范围。

**Remediation：**新增 exhaustive occurrence coverage manifest，按 static/generic/Lieju/Hepan/media/security-package/migration/test-fixture 分类列出全部 owner 文件或具名目录组，并明确 `media` domain kind 不得机械迁入 ordinary definition。

### F3 — P2 / `PROCESS_EVIDENCE_GAP` / blocking

`runtimeArtifacts` 只声明返回“逐项路径”，没有 exact item shape，也未明确它不能驱动 builder 自动 include；特殊平台可借此把路径或 glob 变成隐式打包能力，违反 package whitelist gate。

**Remediation：**冻结 exact `runtimeArtifactContribution.describe()` shape、允许路径根和 `file/directory-sentinel` 语义；禁止绝对路径、`..`、glob、workspace/env substitution，并明确 contribution 只描述验证要求，实际 include/unpack/extraResources 仍由 package owner 显式维护。

## Blocking / deferred

- Blocking findings：F1–F3 全部已修复。
- Deferred P2/P3：none。
- 未发现需要扩大审计的 schema、事实 writer、事务、远端副作用或安全权限变化；E0 只修改计划/evidence 文档。

## Bounded Re-audit

复审范围仅为 F1–F3、修复 diff 及直接不变量：

- 对照 Lieju/Toutiao/Hepan/media adapter exports 和 worker required method，四平台 capability table 现可满足 matrix。
- 对照 exact-ID 搜索结果，coverage manifest 已覆盖 production、package/security、migration 和 production-file fixture owner；平台内部重复 URL/诊断按具名目录 owner 收口。
- runtime artifact contribution 不再拥有打包 writer；Hepan 现有显式 builder/artifact/offline-smoke gates 保留。
- 文档 trailing-whitespace check PASS。
- 最终在 `auto—publish/` 重跑计划 §1 baseline：`101 passed / 0 failed / 0 skipped / 6761.1968 ms`。
- Git evidence：HEAD 仍为 `7747e64743ad3441097df1294874bc120772a1ad`；只有 Post-Wave plan、E0 implementation handoff、E0 audit handoff 为未提交文档改动；production source/schema/tests 未变化。

## Conclusion

`PASS`。Primary Audit 的全部 blocking findings 已关闭，bounded re-audit 未触发 escalation。E0 达到 completion gate；下一串行 gate 为 `E1 READY`。未执行 commit/merge/push、full test/typecheck/build/package smoke 或任何真实登录/发布/上传/付费/生产迁移。
