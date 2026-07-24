# M21 生成到投稿交接深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M21 把 M17 成功生成的任务映射到 M18 中唯一文章，验证文章就绪资格，按客户聚合并调用 M20 做投稿预检/建批；preview token 绑定 generation batch revision、目标和文章 fingerprint，commit 需重验。它不拥有生成任务、文章内容或 publication ledger。

十项维度已覆盖：batch/revision、succeeded task 过滤、generationTaskId/client/article identity、duplicate/missing、目标闭集、文章资格、preview fingerprint、部分客户分组、idempotent/conflict 汇总、安全 DTO、token 消费和生产 IPC 接线。发现生产 article store 缺少服务用于唯一查找的接口，使 duplicate 检查只存在于测试 seam。

## 已检查目录与关键文件

- 全部生产文件：`desktop/services/generation-submission-handoff-service.js`、`desktop/ipc/generation-submission-handoff-ipc.js`。
- 生产接线：`desktop/workspace-runtime.js`、M17 batch store/service、M18 `article-store.js`、M20 `content-submission-service.js`。
- Renderer 调用方：生成 drawer handoff preview/commit 和 preload bridge，仅核对 DTO/调用，不信任 UI 校验。
- 契约与测试：`docs/content-workspace-contract.md:249-263`、`docs/content-generation-operations.md`；`generation-submission-handoff.test.js`、handoff IPC/renderer tests、submission batch tests。

## 关键调用链

1. preview IPC → generation batch by ID → succeeded tasks → `findArticle(task)` → article eligibility → 按 client 分组 → submission `previewBatch`。
2. preview 生成 fingerprint/token，绑定 batch revision、目标 ID 和文章内容/来源 fingerprint；向 renderer 仅返回安全摘要。
3. commit → 取 token → 再 `buildPreview`/比较 fingerprint → 对每个 client 调 `createBatch(confirmed:true)` → 汇总 created/idempotent/conflict。
4. 生产 article store 仅暴露 `getArticle(clientId, articleId)`，handoff 因而落入 task.articleId fallback。

## 候选发现

## TEMP-M21-1：生产 ArticleStore 不支持按 `generationTaskId` 唯一查找，重复来源文章被静默选中

- 分类：正确性 / 身份唯一性 / 测试 seam 与生产漂移
- 所属模块：M21 生成到投稿交接；接口缺口关联 M18
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/docs/content-workspace-contract.md:249-255`；`auto—publish/desktop/services/generation-submission-handoff-service.js:51-70` `findArticle`；`auto—publish/src/content/article-store.js:689` 公开接口；`auto—publish/desktop/ipc/generation-submission-handoff-ipc.js:41-45`；`auto—publish/tests/generation-submission-handoff.test.js:38,57-72`
- 问题描述：契约要求按 `generationTaskId` 找到恰好一篇文章并拒绝 missing/duplicate。handoff 只有在 store 提供 `findByGenerationTaskId` 时才做该查找，但生产 ArticleStore 没有这个方法，于是按 batch task 上的 `articleId` 读取单篇，无法发现同 task ID 的第二篇文章。
- 代码证据：`findArticle` 对可选 finder 的返回做数组数量检查，然后 fallback `getArticle(task.clientId, task.articleId)`；ArticleStore 返回对象只列 `save/get/list/...`，没有 finder。生产 IPC 创建/传入的就是该真实 store；测试则注入了生产不存在的 finder。
- 触发条件：数据迁移、恢复、并发/历史缺陷或手工文件操作使同一 `generationTaskId` 对应两篇 schema 合法文章，其中 batch task 的 `articleId` 指向一篇。
- 可达路径或调用链：handoff preview IPC → batch task → fallback `getArticle(articleId)` → generation identity 局部匹配通过 → submission preview/commit；另一篇重复文章从未扫描。
- 实际影响：违反生成任务到文章的一对一身份契约，重复来源冲突不会显示为 unavailable/conflict，可能把任意被 task.articleId 指向的版本入队并进入 publication 去重域。
- 影响范围：存在重复 `generationTaskId` 的批次/客户；正常唯一数据不受影响。
- 现有测试是否覆盖：测试通过注入 `findByGenerationTaskId` 验证 missing/duplicate 分支，但这个 seam 不存在于生产 store，因此测试掩盖了实际接线缺口；没有“真实 ArticleStore + 重复 task ID”集成测试。
- 验证方法与结果：真实 store 保存 `a1/a2`，二者均有 `generationTaskId:"task1"`，batch task 指向 `a1`。handoff preview 返回 `articleCount:1, conflictCount:0, unavailable:0`，未拒绝重复；复现退出码 0。
- 修复方向：在 ArticleStore 提供按 client + generationTaskId 的明确唯一查询（或索引），返回 0/1/多条的可判定结果；handoff 禁止 fallback 绕过唯一性；用生产 store 添加 missing/duplicate 集成测试。
- 关联发现：M18 拥有文章身份字段，但本条根因是 M21 与生产 store 的接口/接线不一致。

## 测试情况

- M14–M21 联合定向测试：313 个测试，308 通过、0 失败、5 跳过，退出码 0。
- handoff 测试覆盖 batch revision、missing/duplicate（mock finder）、stale preview、safe DTO、多客户聚合和 submission 冲突。
- 额外真实 store 最小复现确认 production seam 无法检测 duplicate generation source。

## 未覆盖区域与待验证

- 未连接真实平台；M21 只创建 M20 本地队列，不执行远端投稿。
- preview token 没有 TTL，且 commit 重建 preview 时会生成未返回的新 token；目前未证明这能越权或绕过 fingerprint，作为清理/容量改进点而非有效 finding。
- 重复 generationTaskId 的现场发生率未知；契约仍明确要求防御并拒绝，因此不影响 finding 的正确性。

## 模块审查结论

M21 达到深审完成门槛，形成 1 条中等严重度候选。revision/fingerprint、资格和 submission 幂等检查总体完整，但最关键的“按 generationTaskId 唯一映射”只在测试 double 中存在，真实生产接线会静默接受重复文章。
