# M03 — Core Deep-Module Consolidation

**Purpose:** 在 09/10/14/15/16/22 已稳定最终业务 owner 后，重组最膨胀的核心模块，使复杂度被少量深接口隐藏，而不是继续靠巨型文件和浅层 adapter 堆叠。

**Status:** `PENDING`；实时可调度性只由波次执行计划与 Git 预检决定

**Scheduling gate:** 正常顺序仅在波次 8 `COMPLETE` 后调度；当前可依 Wave Plan 已授权的 Dependency-Resolution Lane，在 Ticket 22 完成后的新调度请求中按 `M03-0 → M03-A → M03-B → M03-C` 串行实施。该豁免不允许提前回填 Wave 8/M03 `COMPLETE`，最终状态仍等待 Ticket 23 后 reconciliation。

## Scope 与 owner

M03 是一个 Maintenance，内部拆成四个有序工作包；不得把工作包改造成可并行修改同一 owner 的独立 Ticket。

| 工作包 | 权威 owner | 范围 |
| --- | --- | --- |
| M03-0 | 不新增 owner | 实时职责图、公开接口、调用方、测试与 migration seam 预检 |
| M03-A | regular queue runtime；admission transaction | 重组 OperationalStore queue cluster；regular/paid admission 共享 active-target 排他、幂等与原子写入 owner |
| M03-B | ArticleMutationCoordinator cluster | 重组文章读写/发布、admission、trash/delete 用例；文章集合锁序、事实重读和 side-effect boundary 仍只有一个协调 owner |
| M03-C | 不新增 owner | 组合回归、Primary Audit、remediation、bounded re-audit 与 handoff |

`operational-store.js` 继续是公共持久化门面；拆出的文件不是新的业务事实 owner。M03 不增加 public facade、publication-success writer、active-target writer、article lock owner 或 migration writer。

## Candidate scope

本维护的默认 production scope 固定为：

- `src/infrastructure/operational-store/internal/operational-store-queue-aggregate.js` 及完成内部重组所需的新 internal module；
- `src/content/article-mutation-coordinator.js` 及完成内部重组所需的新 content internal module；
- `src/infrastructure/operational-store/operational-store.js`、transition ports、composition 和直接调用方，仅限保持既有门面/装配所需；
- 对应公开行为、transaction/fault、依赖方向和 capability contract tests。

以下模块不因行数自动纳入：

- `operational-store-order-aggregate.js`；
- `operational-store-order-observation-aggregate.js`；
- `operational-store-regular-outcome-aggregate.js`；
- Ticket 10 已拆分的 Renderer feature/component。

M03-0 只有发现上述模块与当前 owner 存在无法分离的直接不变量，才可把最小直接边界纳入，并在职责图中记录理由；不得借 M03 做广域核心重构。

## M03-0 — Realtime ownership and contract map

1. 从当前 HEAD 画出 public OperationalStore facade、transition ports、internal aggregate、ArticleMutationCoordinator、composition、直接调用方和行为测试图。
2. 记录 public interface before 清单以及每个调用方必须理解的 ordering/error/capability 约束。
3. 固定三个核心职责 owner：regular queue runtime、shared admission transaction、ArticleMutationCoordinator cluster；确认没有平行 writer、lock 或 transaction owner。
4. 记录现有定向测试基线；任何新增 failure 必须单独分类。Wave Plan 允许继承的四个 `phase-02-migration` failure 仍只能按既有规则处理。
5. 验证 Ticket 23 未来可只依赖 OperationalStore 公共入口；M03 不定义 `ImportPlanV1`，不提前实现 `importLifecycleFacts`，不添加 placeholder/temporary migration capability。

M03-0 只允许更新职责图、测试计划和本 Maintenance 的必要合同澄清；不得在职责图确认前移动 production owner。

本工作包的实时职责图、public interface before、调用方约束、测试基线与 migration seam 预检记录在 `handoffs/M03-0-realtime-ownership-and-contract-map.md`。该记录以 `59feb04` 为 source state；在它进入 integration HEAD 前，Wave Plan 的下一动作不得据此提前推进到 M03-A。

## M03-A — OperationalStore queue cluster

按不变量拆分，不按函数数量拆分：

1. **Regular queue runtime owner** 隐藏 queue group/item、pause/run intent、claim/renew、begin remote submission 和 snapshot 规则。
2. **Admission transaction owner** 统一隐藏 `admitRegularQueueItem`、`removePendingQueueItem`、`admitPaidBatch` 及直接相关的 paid batch persistence；regular/paid admission 共享 active-target 排他、幂等和原子 transaction 规则，不得各建一套 writer。
3. 保持 `operational-store.js` public surface 和既有 named transition port surface；调用方不得知道 internal 文件、表名、SQL 或 transaction choreography。
4. 可以保留一个小型 internal composer，但不得新增纯透传 adapter 链；删除任一新模块时，隐藏的复杂度应会重新泄漏到多个调用方或另一个 owner。
5. 通过 queue group、regular/paid admission、重复调用、目标冲突、fault rollback、claim/reordered input 和直接调用方回归后，才进入 M03-B。

## M03-B — ArticleMutationCoordinator cluster

1. ArticleMutationCoordinator cluster 继续唯一拥有 canonical article-set lock ordering、mutation session、锁内 lifecycle facts 重读、side-effect marking、release failure 的 uncertain 映射和跨 owner 调用顺序。
2. 内部允许按变化原因集中为：
   - article read/save/publication；
   - regular/paid admission 与 pending removal；
   - removal transaction、trash、restore 与 permanent delete。
3. 内部模块只能消费 coordinator cluster 提供的封闭 mutation kernel 或窄 capability；不得向 composition/调用方暴露 lock、session、transaction primitive，也不得让调用方自行编排先后顺序。
4. 若某候选拆分必须传递大量 stores/callbacks、复制事实读取或形成纯透传层，则保留在 coordinator 内，并在 handoff 记录“不拆”的具体理由。
5. 通过 edit/publication CAS、regular/paid admission、canonical lock ordering、stale tombstone、删除 transaction、release uncertain 和直接调用方回归后，才进入 M03-C。

## M03-C — Integration, audit, and closure

1. 对 M03-A/B 的最终组合 diff 执行一次 Primary Audit；修复 blocking findings 后只做 bounded re-audit，不为每个内部文件重新开启 fresh full review。
2. 依赖方向测试必须证明 production 外部模块未新增 `operational-store/internal` 依赖；internal-to-internal 合法依赖不得依靠易漏项的手工文件 allow-list 判定。
3. 架构测试验证 facade absence、公开 capability 和依赖方向；不得再用源码行数阈值证明模块深度或门面正确。
4. 在最终 M03 implementation HEAD 运行 queue、admission、article mutation、Ticket 16/22 直接回归及维护合同要求的 lint/typecheck/format/gate。
5. handoff 记录每个候选的拆分/不拆分理由、public interface before/after、直接调用方、owner 数量、显著规模变化、实际命令和 inherited blocker。

## Ticket 23 migration boundary

Ticket 23 的真实 `ImportPlanV1` validator、单事务导入和单方法 `importLifecycleFacts` capability 仍由 Ticket 23 一次性实现。M03 只负责保证：

- OperationalStore 公共入口是未来 migration capability 的唯一合法持久化 seam；
- migration 不需要读取 internal schema、SQL、表名或文件布局；
- M03 重组不阻塞未来在同一 OperationalStore transaction owner 中实现 journal/import commit；
- 不恢复 `commitRemoteOutcome(published)`，不新增第二 publication-success primitive，不增加 migration-only compatibility writer。

M03 不解决 `terminalObservationV1` 与 Ticket 23 `nonPublishedTerminal` 的产品合同冲突；该问题仍由 Wave Plan 的 Ticket 23 Upstream V1 Inventory Gate 判定。

## Acceptance criteria

- [ ] M03-0 职责图记录 public facade、内部不变量、transaction/capability、直接调用方、测试与 include/exclude 理由。
- [ ] public interface 数量不增加；如内部接口增加，调用方必须理解的概念和 ordering 约束减少。
- [ ] regular queue runtime、shared admission transaction、ArticleMutationCoordinator cluster 各有且仅有一个权威 owner；M03 不新增业务事实 owner。
- [ ] regular/paid admission 不能各自复制 active-target 排他、幂等或 transaction 规则。
- [ ] 文章集合锁、事实重读、side-effect boundary 和 release uncertain 不能被调用方任意拼接。
- [ ] `operational-store.js` 仍为公共持久化门面；外部模块未新增 `operational-store/internal` 依赖。
- [ ] Ticket 23 可通过公共 OperationalStore seam 增加唯一 migration capability；M03 不提前实现半成品 import writer，也不依赖 internal schema/文件布局。
- [ ] public surface、transition port shape、行为/事务/故障测试保持绿色；不得用源码行数阈值作为通过条件。
- [ ] Primary Audit、blocking finding remediation 和 bounded re-audit 收口；交接记录 before/after、owner、直接调用方、显著规模变化和最终 evidence。
