# Workstream 3 — 客户级列举网投递档案

日期：2026-08-14

## 范围与基线

- 基线 HEAD：`243c5df`（Workstream 2 已交付）。
- 本线程只实现客户级 `publicationProfiles.lieju` 的城市、联系人、电话，以及 AI 生成页编辑、持久化、IPC 和普通平台 preparation 数据通路。
- 未修改文章生命周期、Lieju selector、真实提交与结果判定、图片或付费媒体。

## 实现结果

- `clients/<客户>/client.json` 是唯一客户档案 owner；新增：

  ```text
  publicationProfiles.lieju.city
  publicationProfiles.lieju.contact
  publicationProfiles.lieju.phone
  ```

- 保存采用现有原子文件 writer，保留客户 JSON 中其他字段；空字段合法，单字段上限分别为 100/100/50 字符。
- AI 生成页的批量生成“选择批次客户”步骤中，每个客户卡片都有独立的“列举网投递档案（客户级）”区域和保存状态。
- 新增精确、版本化 IPC command：`content.saveClientLiejuPublicationProfile`；preload、bridge、Feature 和生产 capability evidence 已闭合。
- 普通平台 preparation 在账号核验通过后，按 claim 的 `articleIdentityV1.clientId` 只读客户元数据，并把档案作为 `publicationProfile` 传给 Lieju Adapter。
- Lieju Adapter 只消费上层输入，不读取客户存储；既有城市切换、联系人和电话填表逻辑不变。

## 验证

- `node --test --test-concurrency=1 tests/client-knowledge.test.js tests/phase-06-content-workbench-feature.test.mjs tests/article-lifecycle-ticket-08.test.js tests/regular-platform-adapter-outcomes.test.js`
  - PASS：67/67。
- `node --test --test-concurrency=1 tests/client-knowledge.test.js tests/ai-content-service.test.js tests/ai-content-ipc.test.js tests/article-lifecycle-ticket-08.test.js tests/regular-platform-adapter-outcomes.test.js`
  - PASS：75/75。
- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js`
  - PASS：36/36；131 个生产 capability TypeChecker identity 全部闭合。
- `npm run typecheck:renderer`
  - PASS。
- `npm run typecheck:bridge`
  - PASS。
- `npm run typecheck:main`
  - PASS。
- `npm run build:renderer`
  - PASS；仅有既存 chunk-size warning。
- `npm run build:preload`
  - PASS。
- 修改文件定向 ESLint 与 `git diff --check`
  - PASS。

## 未执行与 Git 状态

- 未执行真实登录、真实发文或外部平台操作。
- 未重跑全量 `npm test`；Workstream 2 已记录该命令在 120/300 秒窗口内未完成，本线程改用与当前风险直接对应的定向测试、完整生产 IPC capability matrix 和构建门禁。
- 当前为 Manual Dispatch；按 `EXECUTION-PROTOCOL.md` 未经当前请求明确授权不得自动 commit，因此改动保持未提交，等待主任务审阅/授权。
