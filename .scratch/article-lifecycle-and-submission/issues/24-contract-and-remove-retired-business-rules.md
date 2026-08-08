# 24 — 收缩并删除全部旧业务规则

**What to build:** 在核心纯文本流程和迁移完成后，删除审核、多目标、通用 submitted/reviewing、复制新版本、队列副本用户语义和已发布回收的兼容入口，保证核心生产代码只有一套业务规则，同时保留 08/09 已固定、供后置图片 adapter 使用的窄扩展合同。

**Blocked by:** 02 — 投稿清理、删除协调与恢复深模块；10 — 精简普通平台投稿队列界面；14 — 网站媒体订单创建结果人工核对；16 — 服务商订单取消与永久历史；23 — 旧文章与投稿事实安全迁移

**Status:** `RUNNING`。24-0、24-A、24-B 与 24-C 已完成各自实现/定向验证/Primary Audit/bounded re-audit/handoff；下一可调度工作包为 24-D。本状态仍须在执行前以当前 Git、Wave Plan 与 handoff 重新验证。

**Scheduling gate:** 作为独立 Wave 10，按 `24-0 → 24-A → 24-B → 24-C → 24-D → 24-E → 24-F` 严格串行调度；不等待后置 Ticket 18–21。前一工作包未 Closure、未进入新的 clean integration HEAD 时，不得启动后一工作包。

## 工作包与 owner

Ticket 24 是一个 umbrella Ticket，内部拆成七个有序工作包。每个工作包由一个独立执行任务完成，但这些任务不得并行；主任务只在前一工作包的实现、定向测试、Primary Audit、blocking remediation、bounded re-audit、commit/merge 和 handoff 全部闭合后，才从新的 integration HEAD 创建下一执行任务。24-F 对 24-A–E 的最终组合 diff 执行一次 Wave/combined audit；除 Audit Protocol escalation 外，不为每个后续工作包重新开启 fresh full review。

| Owner                                   | 唯一职责                                                                        | 禁止拥有                                       |
| --------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| Runtime Legacy Inventory Owner          | 旧词汇/能力的全库清单、分类、消费者与删除顺序                                   | production 修改、兼容实现、业务事实写入        |
| Article Content Contract Owner          | 审核字段/能力、复制新版本与 lineage 的 production 删除                          | 投稿目标、远端 outcome、队列事务               |
| Single-target Submission Contract Owner | 单目标 admission、command、IPC/bridge/UI 与批次维度收缩                         | publication outcome、paid order 状态、图片实现 |
| Runtime Outcome Vocabulary Owner        | 正常运行时 publication/order/adapter 状态词汇边界，删除通用 submitted/reviewing | 迁移证据解析、供应商原始协议改写、第二状态机   |
| Removal and Queue Capability Owner      | 已发布不可回收、删除/清理能力和用户可见队列副本能力收缩                         | publication success、订单取消、迁移导入        |
| Legacy Absence Gate Owner               | migration allowlist、production/IPC/UI capability absence 与最终负向 gate       | 用 regex 代替行为正确性、重写业务 owner        |

上述 owner 是清理职责，不得成为新的长期业务事实 owner。24-A–E 必须直接删除旧 surface 并收敛到 02/08/09/10/14/16/22/23 的既有 owner；禁止增加 deprecated wrapper、兼容 DTO、双读、双写或临时 translation layer。

### 24-0 — Runtime legacy inventory and deletion map

1. 从当前 clean integration HEAD 全库枚举生产代码、公开导出、IPC contract/channel、preload、Renderer bridge/type/component、脚本、测试、fixture、文案和打包 gate 中的候选 legacy surface。
2. 每项必须归入且只归入：`REMOVE_RUNTIME`、`KEEP_CURRENT_FACT`、`KEEP_MIGRATION_ONLY`、`KEEP_EXPLICIT_LEGACY_TEST_EVIDENCE` 或 `DEFER_M04`，并记录权威 owner、真实消费者、预计删除工作包和验证方式；普通行为 fixture 不得归入 legacy evidence。
3. 对同词不同义单独判定：订单/证据的 `submittedAt`、`submittedTitle`、供应商协议原始值不等于通用 runtime `submitted` 状态；删除 gate 不得误杀当前事实。`targetPlatformIds` 只有在当前 command/DTO 表达多目标选择时才属于待删 surface，历史迁移输入和纯测试证据必须明确隔离。
4. 建立公开能力 before-map 和直接调用图，确认 24-A–D 的文件/owner 交叠只能串行处理；发现未列入本合同但会改变产品语义的候选项时，以 `BLOCKED_SCOPE_DECISION_REQUIRED` 报告最小决策，不自行扩大删除范围。
5. 本工作包只产生 inventory/deletion-map handoff 与必要合同澄清，不修改 production、测试断言或 absence gate。清单未覆盖所有 acceptance 类别时不得启动 24-A。

### 24-A — Remove review and article-version lineage surfaces

1. 从 Article Content Contract Owner 删除审核 service/command、审核 IPC/preload/bridge、`reviewedAt` 正常序列化/DTO、待审核/已审核/批量审核入口与文案；完整文章生成成功仍直接待投稿。
2. 删除 `copyArticleVersion`、复制为新版本/新文章入口、`sourceArticleId` lineage 业务语义及对应 UI/IPC/bridge/type；新内容只能走正常新文章创建流程。
3. 迁移 reader/planner 仍可只读解析旧审核/lineage 证据，但不得把这些字段重新投影到正常文章、公开 DTO 或 Renderer。
4. 更新该 owner 的行为测试和调用方；不得借机修改单目标 admission、publication outcome、删除事务或 M04 的系统性 contract 拆分。
5. Closure 必须证明正常创建/生成/编辑/保存/投影仍工作，审核和复制能力从 production capability graph 消失，迁移读取旧证据不回归。

### 24-B — Contract every submission entry to one target

1. 将普通平台与生成后投稿的公开 request/command 从 `targetPlatformIds` 集合收缩为单一 `platformId` + 对应 `accountProfileId`；同一命令不得生成文章 × 目标的笛卡尔积。
2. 删除多目标 IPC contract、preload/Renderer bridge/type 和 checkbox/multi-select UI；批量选择多篇文章可以保留，但一次 admission 只能绑定一个目标，且每篇文章同时最多一个活动目标。
3. submission planner、handoff、queue application、platform workbench 及直接调用方必须消费同一单目标合同；不得用长度为 1 的数组、内部兼容转换或 fallback 同时保留旧公开形状。
4. 网站媒体继续使用单一媒体资源命令，不与普通平台 target DTO 合并；后置图片 adapter 的 08/09 窄端口保持不变且不提前实现图片。
5. 用多篇单目标、重复 admission、已有活动目标、stale preview、缺 account profile 和显式多目标 payload 拒绝矩阵证明公开行为；Closure 后 production command/DTO 不再接受 `targetPlatformIds`。

### 24-C — Remove generic submitted/reviewing runtime vocabulary

1. 删除正常运行时跨渠道通用 `submitted` / `reviewing` article/publication 状态；普通平台接受投稿即进入权威 publication success，uncertain 保真且不可直接重试，网站媒体由订单/付费处理事实表达。
2. adapter、worker、application service、projection、IPC/bridge/type/UI 只能在各自边界返回当前 typed outcome，不得用 `submitted` 作为“可能成功”的通用兜底或第二状态机。
3. 保留真实且语义不同的字段/协议：`submittedAt`、`submittedTitle` / `submittedBody`、订单提交时间和供应商原始响应值；原始值必须在 adapter 边界映射，不能泄漏为正常 article lifecycle enum。
4. 旧 `submitted` / `reviewing` 只允许出现在 23 的 migration reader/planner、迁移 fixture 或明确的 legacy-rejection 测试中；不得进入正常 composition、生产 projection 或 Renderer 合同。
5. 用普通平台成功/明确失败/uncertain、付费处理中/已发布/取消/需人工核对，以及迟到/重复 observation 矩阵证明语义未被字符串清理破坏。

### 24-D — Remove published-recycle and queue-copy user capabilities

1. 删除已发布文章回收、清理 published 本地副本、`publishedToClean` 用户动作和相应确认文案；首次明确发布成功后文章永久只读，任何删除/清理入口必须 fail closed。
2. 删除用户可见“投稿队列副本”及绕过文章/活动目标 owner 的独立副本清理能力，包括对应 IPC channel、preload、bridge、feature command、component action 和 compatibility fixture。24-0 必须单独判定现有 `removePendingQueueItems`：若它表达“明确移除尚未开始的队列项并恢复编辑”的当前用例，则收敛到权威活动目标/删除协调 owner 并保留该行为；只有它实际把队列项当独立副本清理或已无真实消费者时才删除，不得按名称机械处理。
3. 内部不可变投稿快照只作为 publication evidence / audit implementation detail，不作为可浏览、复制、编辑或单独清理的用户实体；保留的排队撤销必须经现有活动目标/删除协调 owner，而不是新建旁路 writer。
4. 保留 02/16/22 已定义的删除 transaction recovery、订单取消和墓碑/永久历史，不得因删除旧 UI 能力而吞掉 uncertain、repair 或不可删除事实。
5. 用待投稿/活动目标/明确失败/uncertain/已发布/订单历史/删除事务重启矩阵证明权限与恢复语义，且 production capability inventory 不再暴露旧动作。

### 24-E — Legacy boundary, extension seams, and absence gates

1. 以 24-0 deletion map 为基线，删除剩余临时双读、旧 typed IPC、preload/bridge 能力、兼容 fixture、旧文案和无真实消费者的 export；不得把 24-A–D 已删能力换名保留。
2. 建立可维护的 legacy-absence gate：按 production capability、公开 DTO/enum、IPC/channel、Renderer action/UI 和 migration-only allowlist 分层验证；静态测试只证明 capability/legacy absence 与依赖边界，不读取业务源码字符串证明行为正确。
3. gate 必须允许 23 的隔离 migration reader/planner 和明确历史 fixture 读取旧证据，但阻止 legacy 类型进入正常 composition、production bundle 或公开 Renderer contract。
4. 回归证明核心纯文本链仍使用 `text_only`、空图片清单和 `initial` decision；08/09 封闭 evidence validator 与 adapter 窄端口仍可供 18–21 使用，生产 UI 不暴露或承诺图片能力。
5. 运行 Ticket 24 定向矩阵、legacy absence、IPC/capability inventory、migration isolation、lint/typecheck/format/discovery 等合同要求的 gate；记录显著规模变化，但不以行数作为通过标准。

### 24-F — Integration audit and Wave 10 closure

1. 从包含 24-A–E 的最终 clean integration HEAD 对组合 diff 执行一次 Primary/Wave Integration Audit，范围限定为本 Ticket 的 legacy absence、跨 owner 接缝、公开能力差异和直接回归。
2. 修复 blocking findings 后只做 bounded re-audit；只有 Audit Protocol 的 escalation 条件成立才扩大受影响边界，不重新从头审计整个仓库。
3. 最终矩阵至少覆盖：生成成功直达待投稿、批量文章单目标 admission、普通平台成功/失败/uncertain、媒体订单处理/取消/人工核对、已发布永久只读、删除事务恢复、迁移旧证据读取、正常 composition 无 legacy reader、纯文本 evidence 和后置图片 seam。
4. 在所有修复进入最终 clean integration HEAD 后运行 Wave 10 要求的最终 gate；完整 `npm test` 仅在 Wave Plan/Execution Protocol 明确要求时运行，Primary Audit 本身不以完整测试代替审计。
5. handoff 记录各工作包 base/implementation/integration commit、公开能力 before/after、删除清单、保留项理由、迁移 allowlist、测试命令/结果、audit findings/resolution、显著规模变化和最终 Git evidence。全部 PASS 后才将 Ticket 24 / Wave 10 标记 `COMPLETE` 并允许 M04。

## 启动约定

- 必须确认 23 的 dry-run、迁移和恢复 evidence 完整；不能通过保留双写/双读来“保险”。
- 使用权威规格的 Out of Scope 和废止规则作为负向清单；删除前先由 24-0 区分 runtime legacy、当前事实、迁移证据和历史测试证据。
- 每个工作包启动前执行 Execution Protocol 调度预检；主任务不得预先创建多个会修改共享 owner 的执行任务。

## Continuous Goal 调度合同

- 用户明确授权 Continuous Wave Goal 后，主任务建立唯一 Goal：从当前 integration HEAD 严格完成 `24-0 → 24-A → 24-B → 24-C → 24-D → 24-E → 24-F`，直到 Wave 10 的 combined audit、bounded closure、final clean-HEAD gate 与 evidence 全部 PASS；不得进入 M04。
- 每次只创建一个标题含当前工作包编号的执行任务，模型固定使用 `Luna`，推理强度固定为最高。执行任务只接收该工作包合同、base HEAD、直接依赖和当次 Git 授权；完成后把 implementation/test/audit/handoff evidence 返回主任务。
- 主任务验证上一任务 Closure 与新的 clean integration HEAD 后才创建下一任务；若 evidence 不完整，则继续同一工作包，不以新任务绕过 gate。
- Goal 的成功停止条件是 24-F 将 Ticket 24 / Wave 10 标记 `COMPLETE`；Goal 的暂停条件仅限 Execution Protocol 第 8 节，不因普通测试失败、review finding 或局部实现选择暂停。

## 职责边界

- 兼容读取只存在离线迁移器，不进入正常运行时。
- 文章生命周期、普通平台和网站媒体保持独立应用服务，共享稳定身份与投影。
- IPC 只暴露当前用例，不保留无生产调用的“备用”能力。
- 测试夹具使用新业务词汇；仅 migration/history fixture 可携带明确标注的旧字段。

## 架构硬门槛

- 收缩后按职责内聚、接口深度、依赖方向、变更局部性和公开接口可测试性验收；不得以文件行数替代架构判断。
- 删除重复状态机和兼容分支后，门面、组件和 contract 文件应减少调用方需要理解的概念；只有存在独立 owner、变化或测试接缝时才拆分，禁止为缩短文件制造透传层。
- 禁止用 deprecated 标记、长度为 1 的数组或兼容 mapper 长期保留生产旧路径。
- 静态门禁与行为测试同时存在，避免只删文案未删能力，也避免以源码 regex 替代产品行为。

## Acceptance criteria

- [ ] 24-0 deletion map 覆盖全部废止类别，并区分当前事实、migration-only 与历史 evidence。
- [ ] 生产代码和界面不存在审核、批量审核、待审核、已审核入口。
- [ ] 生产投稿命令不存在多目标集合或同篇多活动目标能力。
- [ ] 新运行时不存在通用 submitted/reviewing 状态或直接重试 uncertain。
- [ ] 不存在复制新版本、已发布回收或用户可见投稿队列副本能力。
- [ ] 旧状态只在迁移输入夹具/迁移器和明确历史 evidence 中出现，legacy-absence gate 可以阻止回归。
- [ ] 清理后核心纯文本链仍使用 `text_only`、空图片清单和 `initial` decision；08/09 封闭扩展合同可供后置 adapter 实现而无需恢复旧业务路径，生产 UI 不宣称图片可用。
- [ ] 24-F combined audit、blocking remediation、bounded re-audit 与最终 clean-HEAD gate PASS。
- [ ] 交接记录包含删除清单、静态扫描、公开能力差异、模块职责、依赖方向、显著规模变化说明和全部实际测试结果。

## 审计约定

- 24-A–E 各执行任务完成本地 Primary Audit / remediation / bounded re-audit，范围仅限本工作包及直接调用链。
- 24-F 只做一次最终组合审计与 Wave 10 closure；不得在每个工作包之后重新开启全 Ticket fresh audit。
- 必须检查迁移边界仍可读取旧事实、正常运行无双路线、公开接口差异和负向 gate；不以一次文案搜索替代行为与静态门禁审计。

## 与维护计划的关系

- 本 Ticket 必须先删除 legacy IPC/bridge/compatibility surface，再进入维护 M04；M04 只能在清理后的最终业务合同上做职责收缩/拆分，禁止为了重构保留本 Ticket 应删除的旧能力。
- 本 Ticket 可保留必要 legacy-absence 静态门禁；M05 之后会审查其是否属于允许的“能力不存在/架构静态边界”类别，不得把这些必要门禁误删。

## Non-goals

- 不删除 Git 历史中的旧实现证据。
- 不实现网站媒体图片传输或第三方自媒体。
- 不在 Ticket 24 内执行 M04/M05/M06 的系统性维护。
