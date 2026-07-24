# M18 文章库、审核与版本深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M18 拥有 GeneratedArticle 聚合，维护 Markdown 正文与 JSON metadata 的一致写入、来源快照、审核状态、就绪资格和历史版本。它接受 M15/M17 的生成结果，并向回收站、交接和投稿资格层提供文章真值。

十项维度已覆盖：schema 闭集和兼容字段、ID/path/symlink、双文件 journal/恢复、正文一致性、来源快照、审核状态、版本保留、列表排序、回收站边界、资格调用方和测试。发现文章列表采用更新时间排序，与产品历史契约及“审核不重排”要求相反。

## 已检查目录与关键文件

- 全部生产文件：`src/content/article-store.js`、`article-review-service.js`、`article-version-service.js`、`article-submission-eligibility.js`。
- 上下游边界：`desktop/services/ai-content-service.js`、`content-generation-batch-service.js`、`generation-submission-handoff-service.js`、`content-submission-service.js`、M19 trash/removal。
- 契约：`docs/content-workspace-contract.md`、`docs/content-generation-operations.md`。
- 相关测试：`article-{store,review-service,version-service,generator}.test.js`、生成批次与 submission eligibility/导出测试、article trash 生命周期测试。

## 关键调用链

1. M15/M17 → `saveArticle` → schema/provenance 校验 → journal → JSON/Markdown 原子替换 → 清理 journal。
2. renderer 历史 → AI content service → `listArticles(clientId)` → 分组/展示。
3. review → article review service → store `reviewArticle` → 保留创建时间和来源 → eligibility。
4. M21/M20 → `getArticle` → generation identity/资格 → queue snapshot。
5. M19 → active article 与 trash article 之间搬移，终端 tombstone 由 article store 持有。

## 候选发现

## TEMP-M18-1：文章历史按 `updatedAt` 排序，编辑旧文会把它移到历史顶部

- 分类：正确性 / 产品数据排序 / 测试规格漂移
- 所属模块：M18 文章库、审核与版本
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/docs/content-generation-operations.md:98-100`；`auto—publish/src/content/article-store.js:408-419` `listArticles`；`auto—publish/tests/article-store.test.js:63-70`
- 问题描述：产品契约要求文章组和文章都按 `createdAt` 倒序，且编辑或审核不得改变顺序；store 却优先比较 `updatedAt`。
- 代码证据：排序表达式为 `(b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)`。现有测试标题和断言明确固定 `updatedAt descending`，与当前操作文档相反。
- 触发条件：编辑、保存或其他流程更新一篇较早创建文章的 `updatedAt`，使其晚于新创建文章。
- 可达路径或调用链：文章编辑/更新 → `saveArticle` 写新 `updatedAt` → renderer/history 调 `listArticles` → 旧文章按更新时间排到前部。
- 实际影响：客户历史和 `platform + templateId` 分组内顺序在编辑后变化，用户无法按创建历史稳定追溯；审核/编辑旧内容会制造“新文章”的视觉错觉。
- 影响范围：所有使用 article store 列表顺序的历史和文章管理界面；单篇读取、正文内容和投稿资格不受影响。
- 现有测试是否覆盖：有测试，但测试验证的是错误的更新时间规则，属于测试与产品规格同步漂移，并不能防止该缺陷。
- 验证方法与结果：读取生产 comparator，并由现有 `article-store.test.js` 的 older/newer fixture 确认当前行为确为 `updatedAt` 倒序；联合测试通过说明行为被稳定固化，而非偶发错误。
- 修复方向：store 按规范化 `createdAt` 倒序排序，必要时以稳定 ID 作为同时间 tie-breaker；同步修改测试，增加“编辑/审核旧文章不重排”的回归用例。
- 关联发现：无。

## 测试情况

- M14–M21 联合定向测试：313 个测试，308 通过、0 失败、5 跳过，退出码 0。
- article store 测试覆盖双文件损坏、journal 恢复、CRLF、symlink/path、审核字段和 trash 事务；排序测试当前与文档规格相反。
- 未执行真实多进程并发编辑；生产写入口位于 Electron 主进程，本轮未证明存在第二写进程。

## 未覆盖区域与待验证

- 未做超大文章库的列表/版本容量压测；`listArticles` 会同步读取并解析客户目录内所有文章 pair。
- 没有明确的 optimistic revision 编辑契约；潜在的两个 renderer stale edit 覆盖需要产品并发语义后才能判断，不作为 finding。
- 历史分组的 renderer 展示细节由 M07 审查，本模块只验证 store 输出顺序。

## 模块审查结论

M18 达到深审完成门槛，形成 1 条中等严重度候选。双文件一致性、路径与来源快照保护较完整；历史排序则由实现和测试共同偏离明确产品契约，需在合并阶段保留。
