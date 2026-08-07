# M03 — Core Deep-Module Consolidation

**Purpose:** 在 09/10/14/15/16/22 已稳定最终业务 owner 后，重组最膨胀的核心模块，使复杂度被少量深接口隐藏，而不是继续靠巨型文件和浅层 adapter 堆叠。

**Status:** `PENDING`；实时可调度性只由波次执行计划与 Git 预检决定

**Scheduling gate:** 仅当波次 8 `COMPLETE` 后调度；维护 8.5 唯一任务。完成并通过维护门禁后才允许波次 9 Ticket 23。

## Candidate scope（实施前以实时规模/调用图重新确认）

- `src/infrastructure/operational-store/internal/operational-store-queue-aggregate.js`；
- `desktop/services/article-mutation-coordinator.js`；
- 其他在波次 6–8 后仍显著膨胀、同时拥有多个独立不变量的核心 owner。

`media-workbench/src/components/GeneratedArticlesView.tsx` 不属于本维护的前置拆分对象：Ticket 10 已拥有 Renderer 的业务性 feature/component 拆分。只有 Ticket 10 完成后仍存在真正独立的 UI owner 问题，才可作为附属 finding 单独处理。

## What to change

1. 先画公开门面、内部不变量、transaction/capability、直接调用方和测试图，再决定是否拆文件。
2. 仅在存在独立不变量/变化原因/测试接缝时拆出内部模块；禁止“一函数一文件”或纯透传层。
3. 保持 `operational-store.js` 为公共持久化门面，外部不得新增对 `internal/` 或 schema 的依赖。
4. coordinator 继续拥有跨文章锁序/原子协调；不得复制锁 owner、创建平行 coordinator 或把事务顺序交回调用方。
5. 为 Ticket 23 预留并验证稳定公开 migration capability；迁移不得读取 internal schema/文件布局。

## Acceptance criteria

- [ ] 候选模块的职责图显示公开接口数量不增加或有明确理由；调用方理解的概念减少。
- [ ] 不变量只有一个 owner，锁/事务/capability 不能被调用方任意拼接。
- [ ] `rg`/dependency test 证明外部模块未新增 `operational-store/internal` 依赖。
- [ ] Ticket 23 所需 migration API 通过公开 contract test，可在不知道 internal 文件布局的情况下工作。
- [ ] 行为/事务/故障测试保持绿色；不得用源码行数阈值作为通过条件。
- [ ] 交接记录拆分/不拆分理由、公开接口 before/after、直接调用方和显著规模变化。
