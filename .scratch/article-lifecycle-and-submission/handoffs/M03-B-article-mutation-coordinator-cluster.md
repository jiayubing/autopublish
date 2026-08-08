# M03-B — ArticleMutationCoordinator cluster

日期：2026-08-08

Base integration state：`9264c6c`（`docs: record M03-A queue cluster handoff`）

执行模式：Manual Dispatch。本文只记录 M03-B implementation 与定向验证；未执行 M03-C Primary Audit、finding remediation、bounded re-audit、完整 Maintenance gate、commit、merge或 Ticket 23。

## 1. 范围与结果

本工作包只重组 `ArticleMutationCoordinator` cluster：

- `article-mutation-coordinator.js` 现在是唯一 cluster composer，继续返回原有 frozen coordinator object；
- `internal/article-mutation-kernel.js` 唯一隐藏 canonical article-set lock ordering、mutation session、锁内 lifecycle facts 重读、side-effect marking 和 release failure uncertain 映射；
- `internal/article-mutation-publication.js` 集中 article read/save/publication；
- `internal/article-mutation-admission.js` 集中 regular/paid admission 与 pending removal；
- `internal/article-mutation-removal.js` 集中 removal transaction、trash、restore 与 permanent delete。

没有修改 composition、直接调用方、OperationalStore、transition ports、schema、migration 或产品合同；没有新增 public capability、article lock owner、publication-success writer、active-target writer、migration writer 或 compatibility layer。Ticket 23 migration seam 仍只能通过未来 public OperationalStore capability，本次没有实现任何 import API。

## 2. Before / after 与 owner

Before：`article-mutation-coordinator.js` 1,083 行，同时包含 mutation kernel 和三组独立变化原因。

After：

- coordinator composer：56 行；
- sealed mutation kernel：330 行；
- read/save/publication cluster：272 行；
- admission/pending-removal cluster：609 行；
- trash/restore/permanent-delete cluster：374 行。

行数只记录显著规模变化，不作为通过条件。新文件按仓库 Prettier 展开，cluster 总行数不能与原文件机械比较模块深度。

owner 数量保持不变：ArticleMutationCoordinator cluster 仍是一个权威协调 owner。只有 kernel 可以打开 mutation session、确定 canonical lock ordering、锁内重读 lifecycle facts、标记 side effect 和把 release failure 映射为 `ARTICLE_MUTATION_RESULT_UNCERTAIN`。三个业务内部模块只消费该 frozen kernel；composition 和直接调用方仍只消费 coordinator object。

## 3. 拆分与不拆分理由

- kernel 独立，因为 lock/session/facts/release uncertain 被三个变化组共同依赖，若留在任一业务模块会迫使其他模块复制 owner 或暴露 ordering choreography。
- publication、admission、removal 分开，因为它们分别随内容保存/发布、队列准入、删除恢复规则变化，同时都需要同一 mutation kernel 保证先锁、锁内重读、再调用持久化 capability。
- regular 与 paid admission 没有继续拆开：两者必须通过同一个 coordinator lock/facts boundary 与 M03-A shared admission transaction 协作，拆开只会形成浅层转发和重复准入约束。
- removal transaction、restore 和 permanent delete 没有继续拆开：三者共享 tombstone revalidation、lifecycle removal facts 和同一 session side-effect boundary；继续拆分会传递 session/callback 或复制 stale tombstone 判断。
- `createArticle` 与 read/save/publication 保持一组；它们共同是文章内容读写变化面，单独建立一层只会成为纯透传 adapter。
- composition 和直接调用方无需改动，因为原 public surface 足以隐藏内部复杂度；为“展示新模块”修改调用方反而会泄漏 cluster internal。

## 4. Public contract 与直接调用方

Coordinator frozen surface 仍精确为原 20 个 key：

`canonicalArticleRefKey`、`readArticleForEdit`、`readArticleForRemoval`、`readArticleForPublication`、`createArticle`、`saveExistingArticle`、`resolveTrustedArticleRef`、`reservePublicationTarget`、`commitPublicationOutcome`、`markRecoveryUncertain`、`admitRegularQueueItems`、`admitPaidBatch`、`removePendingQueueItems`、`executeArticleRemovalTransaction`、`assertTrashedArticleMutationAllowed`、`restoreArticles`、`permanentlyDeleteArticles`、`restoreTrashedArticle`、`permanentlyDeleteTrashedArticle`、`supportsArticleRemovalTransaction`。

生产扫描确认只有 `article-mutation-coordinator.js` 导入新 internal modules。`content-lifecycle-composition`、publication workflow、regular queue application、paid media preflight、AI content/generation、trash/removal services 的依赖与调用方式均未改变；它们不能访问 mutation session、article lock、OperationalStore transaction、事实重读或 side-effect marker。

## 5. 实际验证

环境：Windows；Node `v24.16.0`；npm `11.13.0`。

1. `node --test tests/article-mutation-coordinator.test.js tests/phase-07-regular-queue.test.js tests/phase-12-paid-media-preflight.test.js tests/article-lifecycle-ticket-16.test.js tests/article-lifecycle-ticket-22.test.js tests/phase-05-production-removal.test.js tests/phase-05-p1-blockers.test.js`
   - 67 tests；67 PASS，0 FAIL。
   - 覆盖 edit fingerprint CAS、publication lock snapshot、canonical multi-article lock ordering、partial acquisition release、regular/paid admission、active-target 竞态、pending removal、removal transaction、stale tombstone、restore/permanent-delete、side-effect 后 release uncertain、repair/manual-check，以及 Ticket 16/22 直接回归。
2. `node --test tests/article-lifecycle-ticket-08.test.js tests/article-lifecycle-ticket-13.test.js tests/article-lifecycle-ticket-14.test.js tests/phase-08-publication-submission-orchestration.test.js tests/phase-04-operational-store-lifecycle.test.js`
   - 78 tests；78 PASS，0 FAIL。
   - 覆盖 publication workflow、regular submission、paid order/resolution、legacy frozen facade 和直接 transaction/fault 回归。
3. 独立 Node assertion 对 coordinator `Object.keys` 与 frozen 状态进行 before 清单核对。
   - 20 个 key 精确匹配；coordinator 为 frozen object；PASS。
4. `npx eslint`（五个 M03-B production 文件）
   - PASS。
5. `npx prettier --check --end-of-line auto`（五个 M03-B production 文件）
   - PASS。
6. 五文件 `node --check`、`git diff --check`
   - PASS。
7. production dependency scan
   - 只有 coordinator composer 导入新 internal modules；没有 composition/调用方新增 internal 依赖。

未运行完整 `npm test`、M03-C architecture/combination gate 或 Primary Audit：Manual Dispatch 与 Maintenance 合同把这些工作固定在 M03-C。没有运行或修改 `phase-02-migration.test.js`；其四个 inherited failures 仍按 Wave Plan 由 Ticket 23 处理。

## 6. 边界与下一动作

本记录只证明 M03-B implementation 与定向 gate。当前改动未提交；Wave Plan/M03 状态不提前回填。下一次获得串行调度后可进入 M03-C，对 M03-A/B 最终组合 diff 执行一次 Primary Audit、必要 remediation、bounded re-audit 和 Maintenance final gate；不得把 M03-C 扩大为 Ticket 23 migration implementation 或广域核心重构。
