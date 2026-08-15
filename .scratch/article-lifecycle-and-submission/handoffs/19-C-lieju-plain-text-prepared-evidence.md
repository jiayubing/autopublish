# 19-C — 列举网纯文本 Prepared Evidence：Closure Handoff

## 状态与 provenance

- 工作包：`19-C-lieju-plain-text-prepared-evidence`。
- 开始 integration HEAD：`6c3a7d9`（`codex/article-lifecycle-submission`；开始时工作树干净）。
- 实现提交：`780066c`（`feat(lieju): prepare plain-text evidence`）。
- 用户随后明确授权关闭 19-C；Primary Audit、P2 remediation、bounded re-audit 与实现提交已完成。19-C=`COMPLETE`，19-D 才是下一可调度项。
- 未执行真实登录、GET、POST、上传、发布、付费、Cookie 导出或生产数据操作；所有新测试只使用合成浏览器 form fixture 和临时文章库。

## 实现范围

- 新增 `auto—publish/src/platforms/lieju/plain-text-renderer.js`，仅为列举网将冻结 `publicationSnapshot.body` 派生为可读纯文本：保留标题文字、段落、编号/无序列表、引用、表格单元格、链接文字、图片 alt 文字和代码内容；移除 Markdown 展示符号、原始 HTML 标签、图片本地路径和图片 URL。
- `auto—publish/src/platforms/lieju/adapter.js` 在 prepare 时先按现有 V1 contract 校验源快照，再使用派生 body 和既有 `preparedContentFingerprint()` 重建并校验 evidence。传入表单的 body 与 `preparedSubmissionEvidenceV1.body` 为同一冻结值；未更改公开 evidence schema、outcome、文章库或通用 `article-text` helper。
- 新增 `auto—publish/tests/lieju-plain-text-preparation.test.js`，覆盖 Markdown/HTML 行为矩阵、东爵 2211→2151 段落/章节/编号/结尾回归、图片位置不泄漏、真实 form fixture 与 evidence/fingerprint 一致，以及文章 Markdown/JSON 字节不变。

## Primary Audit

- Scope：19-C renderer、列举网 adapter prepare/evidence 接线、直接 V1 validator/fingerprint consumer、实际 form fill 的 drift guard，以及本包行为测试；不审计 19-D 图片 manifest、19-E HTTP POST、全局 lifecycle 或历史 adapter 格式债务。
- Checked invariants：唯一 body 派生 owner 位于列举网 adapter；文章库/snapshot 不回写；title 不映射；Markdown/HTML 不产生未验证 HTML 或图片路径；V1 evidence body 与 form body 完全相同且 fingerprint 可重算；PreparedSubmission 仍不可序列化且无新 schema/outcome/远端调用。
- Finding：`P2 / INTRODUCED_BY_CHANGE`。初版遗漏 Setext 标题下划线和带定义的 shortcut/reference 链接与图片，导致 `===`、`[]` 或 `!` 展示符号可能保留，直接违反本包 Markdown 语义。已在 renderer 中最小修复并新增独立行为回归；reference destination 只被识别，不进入输出。
- 非阻塞记录：`adapter.js` 的全文件 Prettier 差异位于本包未触及的既有行（约 127–620），不在本包 diff 内；未为此扩大格式化范围。
- 结论：`PASS_WITH_REMEDIATION`。

## Bounded Re-audit

- Scope：上述 P2 修复、修复 diff、renderer→adapter→form/evidence 直接链路及对应定向回归。
- Result：`PASS`。Setext/reference 展示符号均被移除，链接文字和图片 alt 文字保留、图片 destination 不出现；表单 body、prepared evidence body 和 V1 fingerprint 仍相等，文章 Markdown/JSON 字节不变。未触发 schema、状态 owner、事务或远端副作用边界的 escalation。

## 定向验证

在 `auto—publish/`、Node `v24.16.0` 实际运行：

```text
node --test --test-concurrency=1 tests/lieju-plain-text-preparation.test.js tests/lieju-http-session.test.js tests/lieju-http-form-parser.test.js tests/regular-platform-adapter-outcomes.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-publication-evidence-contract.test.js
# 74 passed, 0 failed, 0 skipped, 0 cancelled

npm exec -- eslint src/platforms/lieju/plain-text-renderer.js src/platforms/lieju/adapter.js tests/lieju-plain-text-preparation.test.js
# PASS

npm exec -- prettier --check src/platforms/lieju/plain-text-renderer.js tests/lieju-plain-text-preparation.test.js
# PASS

git diff --check
# PASS
```

`adapter.js` 的全文件 Prettier check 仍报告既有未格式化区块；将当前文件送入 formatter 的差异只位于本包未触及的既有行（约 127–620），本包新增 import 和 prepare/evidence 片段不在差异中，因此未作无关全文件格式化。

## 未执行与边界

- 未运行完整 `npm test`：19-C 合同只要求定向验证；Wave 13 的完整专项矩阵、package/smoke 和最终 clean-HEAD gate 属于 19-G closure。
- 未执行真实登录、GET、POST、上传、发布、付费、Cookie 导出或生产数据操作；这些操作不因 19-C closure 获得授权。
- 19-D 必须从包含本 implementation/closure 的新 clean integration HEAD 串行开始，不得复用本包的图片、multipart 或远端操作边界。
