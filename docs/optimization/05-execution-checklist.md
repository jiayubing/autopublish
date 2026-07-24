# 分阶段优化执行清单

> 适用基线：`master@e8d817847bab3a9e6020006cab35340f645e527f`。  
> 本文件是后续实施线程的交接清单，不代表任何代码工作已经完成。`[ ]` 只能在对应证据已留存后改为 `[x]`。  
> 原审查没有 `REVIEW-XXX`，实际稳定编号为 `F-H01`～`F-H15`、`F-M01`～`F-M21`、`F-L01`；执行中继续使用这些 `F-*`，不得另造编号。

## 1. 每个实施线程的通用开始门

- [ ] 重新记录当前分支、commit SHA 和 `git status --short`。
- [ ] 将当前基线与本计划基线比较；若业务代码、配置、测试或依赖已变化，先反查受影响的 `F-*` 与 `OPT-*`，不得沿用过期证据。
- [ ] 阅读目标 OPT 的目标、非目标、前置依赖、预计文件、验收标准、发布方式和回滚方案。
- [ ] 确认所有前置 OPT 已完成，或明确记录本线程只准备 fixture/测试而不启用功能。
- [ ] 指定本次变更的单一 interface/schema owner；与其他线程核对共享文件、公共 DTO、持久 schema 和共享状态。
- [ ] 为目标 OPT 建立失败复现或契约测试；不得用测试专用影子 seam 代替 production caller。
- [ ] 确认使用合成或脱敏数据；不读取、复制或提交 API key、Cookie、客户稿件、浏览器 profile、生产备份或原始诊断图像。
- [ ] 确认不会真实投稿、扣费、撤回、换号、覆盖生产数据库、删除备份、配置生产网络或发布正式安装包；需要这些动作时交由授权人员。
- [ ] 记录本线程允许修改的文件范围；工作区已有无关变化不得清理、覆盖或混入提交。
- [ ] 写明本次停止条件和可执行回滚；涉及未知远端事实时必须采用“保留、阻断、人工核对”。

## 2. 每个 OPT 的完成证据

每个工作项只有在下面五类状态全部完成后，才可在批次完成门中计为“完成”。“需要决策”“需要验证”或“暂缓”的项不得以规划文档代替实施证据。

- **代码**：production implementation 和全部 caller 已通过预定 seam；没有混入非目标重构。
- **测试**：目标项要求的单元、集成、端到端、安全、并发、迁移或故障注入测试已实现并通过。
- **验证**：`03-verification-matrix.md` 中的可观察验收标准已逐条留存证据；人工步骤由有权限人员签认。
- **审查**：至少完成 interface/安全/兼容性审查；高风险状态机、迁移或回滚由独立审查者确认。
- **文档**：更新相关运行手册、状态/schema说明、决策记录和实际发布/回滚限制；不得回写原始 `docs/review/`。

状态表中的 `[ ]` 依次代表代码、测试、验证、审查、文档：

| OPT | 优先级 / 当前状态 | 关联发现 | 代码 | 测试 | 验证 | 审查 | 文档 | 实施前的关键门 |
|---|---|---|---|---|---|---|---|---|
| OPT-001 | P0 / 可实施 | F-H15、F-M01、F-M20、F-M21 | [ ] | [ ] | [ ] | [ ] | [ ] | 确认实际 CI 平台、required checks 管理权与 production seam |
| OPT-002 | P1 / 可实施 | F-H04 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；lock record/lease/Windows 回收规则评审 |
| OPT-003 | P1 / 可实施 | F-H05、F-H07 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001、002；recovery 状态、不变量、事实优先级评审 |
| OPT-004 | P1 / 可实施 | F-H06；关联 F-H05 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；先与 OPT-003 对齐 interruption intent |
| OPT-005 | P1 / 可实施 | F-H09 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；推荐等待 OPT-003 interface；只用 fake remote |
| OPT-006 | P1 / 需要验证 | F-H08、F-M16 | [ ] | [ ] | [ ] | [ ] | [ ] | D-003：批准的脱敏 fixture/测试账号；无证据不启用 production |
| OPT-007 | P1 / 可实施 | F-H10 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；最终 `app.asar.unpacked` 制品环境可生成 |
| OPT-008 | 待决策 / 需要决策 | F-H11 | [ ] | [ ] | [ ] | [ ] | [ ] | D-001：可信 HTTPS endpoint、证书/DNS与迁移窗口 |
| OPT-009 | P1 / 可实施 | F-H12 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-003；确认媒体 order response schema与remote ID |
| OPT-010 | P1 / 可实施 | F-H13、F-H14 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；D-004决定生产级 RPO/RTO；仅隔离副本验收 |
| OPT-011 | P1 / 可实施 | F-H03、F-M18 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；D-006只决定可选图像分支，安全止损不阻塞 |
| OPT-012 | P1 / 可实施 | F-M12 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；token identity/TTL与双窗口TOCTOU矩阵 |
| OPT-013 | P1 / 可实施 | F-M13 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-002、003；batch revision/CAS schema与锁顺序评审 |
| OPT-014 | P1 / 可实施 | F-M14 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-003、009；媒体resource identity和重试policy稳定 |
| OPT-015 | P1 / 可实施 | F-H01、F-M03 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；先定义request identity scope和dispose语义 |
| OPT-016 | P2 / 可实施 | F-H02 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；真实draft初始化值与dirty diff测试 |
| OPT-017 | P2 / 可实施 | F-M09 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；logical ID重复/损坏metadata策略 |
| OPT-018 | P2 / 可实施 | F-M11 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；retry上限、fake clock和destructive幂等规则 |
| OPT-019 | P2 / 可实施 | F-M15 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；唯一查询0/1/many契约和容量样本 |
| OPT-020 | P2 / 可实施 | F-M07 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；分页硬上限/重复页/total语义 |
| OPT-021 | P2 / 可实施 | F-M05 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；destructive command prepare/execute错误契约 |
| OPT-022 | P2 / 可实施 | F-M06 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001、004；独立command token和最终snapshot语义 |
| OPT-023 | P3 / 可实施 | F-M08 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；成功/失败/unmount按钮生命周期 |
| OPT-024 | P3 / 可实施 | F-M04 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；统一confirmation host与键盘/焦点契约 |
| OPT-025 | P3 / 可实施 | F-M10 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；createdAt及legacy tie-breaker规则 |
| OPT-026 | P2 / 可实施 | F-M19 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；可信proxy来源与真实基数不足时采用保守上限 |
| OPT-027 | P3 / 可实施 | F-L01 | [ ] | [ ] | [ ] | [ ] | [ ] | OPT-001；先确认当前行为只是清本地projection |
| OPT-028 | 暂缓 / 暂缓 | F-M02 | [ ] | [ ] | [ ] | [ ] | [ ] | D-007有明确用户价值后才排期；不得被OPT-003依赖 |
| OPT-029 | 待决策 / 需要决策 | F-M17 | [ ] | [ ] | [ ] | [ ] | [ ] | D-002账号模型与稳定账号标识；target migration独立实施 |

## 3. 批次 0：可信门禁

### 开始条件

- [ ] 通用开始门全部满足。
- [ ] 确认 Git 托管与 CI 平台；若不是 GitHub，记录等价根级配置和 required gate 证明方式。
- [ ] 指定 OPT-001 的唯一 seam owner。

### 执行与检查

- [ ] 按“根 workflow/cwd → 默认测试收集 → production seam 测试 → required check”执行 OPT-001。
- [ ] 默认命令收集 `.js` 和 `.mjs`，且不以跳过有效测试换取全绿。
- [ ] 运行默认测试、auth、lint、renderer/bridge typecheck、renderer build、links 和 production packaging。
- [ ] 以真实 PR/push 证明 jobs 被触发并可被设为 required checks。

### 完成条件

- [ ] OPT-001 的代码、测试、验证、审查和文档五列全部完成。
- [ ] required checks 可见且全绿，收集清单含 `.mjs`，production 架构断言不读取影子 runtime。
- [ ] 若 workflow 未触发、默认套件仍红或 production seam 不明确，已停止后续合并并执行批次回滚策略。

## 4. 批次 1：发布阻断、安全与灾备隔离

### 开始条件

- [ ] 批次 0 完成。
- [ ] 敏感 fixture 和隔离备份路径已获授权，且仅含合成/脱敏数据。
- [ ] D-001 已决定时才实施 OPT-008；未决定则本批只记录其阻塞状态和外部 TLS 准备。
- [ ] D-004 的缺失不会被误写成“生产灾备已验收”；D-006 未决定时 OPT-011 默认无图。

### 执行与检查

- [ ] OPT-007、010、011 可由不同文件 owner 并行；OPT-012 在独立删除/恢复 seam 上实施。
- [ ] OPT-007 与 OPT-005 同改 Hepan 文件时已串行；OPT-011 artifact interface 只有一个 owner。
- [ ] 完成 production `--dir` smoke、坏/缺失备份零副作用、强杀残留/截图脱敏、旧token删除保护测试。
- [ ] 若实施 OPT-008，服务端 HTTPS 已先于客户端强制策略就绪，且没有静默 HTTP fallback。

### 完成条件

- [ ] OPT-007、010、011、012 的五类证据全部完成；OPT-008保持明确阻塞或在D-001后完成全部证据。
- [ ] 最终制品脚本可执行；restore-check 对缺失/损坏目标零副作用；敏感工件验收通过；旧token不能删除新内容。
- [ ] 若测试触及真实生产数据、清理边界不能证明或HTTPS会降级，已立即停止并保留备份/记录。

## 5. 批次 2：远端事实与进程生命周期基础

### 开始条件

- [ ] 批次 0 完成。
- [ ] publication lock、recovery intent、run lifecycle 和 batch revision 的ADR或等价设计评审通过。
- [ ] 故障注入、两进程竞争、强杀和重启环境可用，且不连接真实外部平台。
- [ ] 明确 ledger、intent、batch 和 archive 的事实优先级与全局锁顺序。

### 执行与检查

- [ ] 串行执行 OPT-002 → OPT-003 interface/schema → OPT-004 interruption接入 → OPT-013 batch CAS。
- [ ] 并行活动仅限 fixture、故障矩阵和不触碰共享 interface 的测试准备。
- [ ] 覆盖活锁/遗锁、远端前后各故障点、旧worker消息、快速stop-start、重启、attention/reconcile和batch lost update。
- [ ] 新schema遵循“兼容reader先行 → 新write → 自动恢复/严格阻断最后启用”。

### 完成条件

- [ ] OPT-002、003、004、013 的五类证据全部完成。
- [ ] unknown永不盲重试；known outcome未落账不归档；旧worker不污染新run；batch并发更新不丢失。
- [ ] 不存在误回收活锁、无法解释的状态组合或自动将unknown判为failed/published。
- [ ] 回滚演练证明intent和新记录会被保留，兼容reader可列出需人工核对的事实。

## 6. 批次 3：Adapter 与媒体目标语义

### 开始条件

- [ ] 批次 2 完成，publication outcome/evidence interface已稳定。
- [ ] OPT-006已取得D-003允许的脱敏fixture/测试账号，或明确只完成本地负向测试、不启用production。
- [ ] OPT-009所需媒体响应schema、remote ID语义和幂等能力已确认。

### 执行与检查

- [ ] OPT-005与OPT-009可并行；OPT-006验证/实现后再接OPT-014资源级retry。
- [ ] Hepan、浏览器fixture、媒体order轨道可并行，公共outcome/evidence interface和attention DTO由单一owner合并。
- [ ] 完成fake remote接收后断连、DOM跨行/无关success、order落账ENOSPC、media同资源retry测试。
- [ ] 真实账号、投稿或付费步骤只由授权人员在隔离环境签认；fixture必须完成脱敏检查。

### 完成条件

- [ ] OPT-005、009、014 的五类证据全部完成。
- [ ] OPT-006在D-003后全部完成；若外部证据缺失，明确停在“需要验证”，production仍为uncertain/禁用。
- [ ] 弱页面信号不能published；POST后模糊异常为uncertain；order ID可恢复；media retry仍属同一resource aggregate。
- [ ] 回滚验证不会恢复弱成功判断，且ledger/recovery和remote ID仍保留。

## 7. 批次 4：内容身份与事务恢复

### 开始条件

- [ ] 批次 0 完成；publication批次仍在进行时已确认不会共享核心文件或锁顺序。
- [ ] logical ID、generation task唯一性、removal retry身份与幂等规则评审通过。

### 执行与检查

- [ ] OPT-017与OPT-019可并行；OPT-018随后接入并完成内容/删除联合回归。
- [ ] 同改ArticleStore或trash接线的变更已串行。
- [ ] 覆盖目录名不等于logical ID、重复generationTaskId、fake-clock backoff、needs_repair和500任务容量。
- [ ] 自动恢复每步均重验identity/fingerprint并有最大次数，不重复执行破坏性动作。

### 完成条件

- [ ] OPT-017、018、019 的五类证据全部完成。
- [ ] 合法logical ID全链可用；重复task明确阻断；transient删除无需重启且超限可见repair。
- [ ] 路径安全未退化，未自动删除重复文章，未重复执行destructive action。
- [ ] 回滚可禁用handoff/scheduler而保留数据、journal和显式repair。

## 8. 批次 5：Renderer 正确性与容量

### 开始条件

- [ ] 批次 0 完成；OPT-022等待OPT-004 run phase和snapshot语义稳定。
- [ ] request identity、command owner、busy和stale response契约已评审。

### 执行与检查

- [ ] 先完成OPT-015，再并行OPT-016、020、021，最后OPT-022。
- [ ] OPT-015与020同改App时串行；OPT-004与022同改平台接线时串行。
- [ ] 覆盖deferred Promise交错、客户切换、draft roundtrip、重复分页、delete prepare拒绝和submit/pause交错。
- [ ] 容量上限、重复页诊断和UI错误路径均为可观察结果；没有未处理Promise rejection。

### 完成条件

- [ ] OPT-015、016、020、021、022 的五类证据全部完成。
- [ ] 无跨客户/过期响应覆盖，无草稿清零，资源获取有界，所有busy最终收敛。
- [ ] 保存失败不会关闭编辑器；分页漏项或截断会明确报告而非静默成功。
- [ ] 回滚按view进行，并保留安全request guard和服务端分页硬上限。

## 9. 批次 6：普通 UX、可用性与待决策事项

### 开始条件

- [ ] 相关核心项已完成，P3交互不会与仍在进行的App/controller变更冲突。
- [ ] OPT-029只有在D-002和稳定账号标识证据齐备后才另开兼容迁移；OPT-028只有在D-007后才排期。
- [ ] auth limiter的可信来源头和保守容量上限已评审。

### 执行与检查

- [ ] OPT-026可独立；OPT-023、024、025、027按不同view并行；confirmation interface只有一个owner。
- [ ] 完成成功/失败按钮恢复、confirmation键盘/焦点、createdAt排序、订单文案语义和100k limiter压力测试。
- [ ] 若实施OPT-029，执行双读、migration dry-run、账号切换和rollback mapping测试，且不与其他publication迁移并行。
- [ ] OPT-028在暂缓期保持无新增renderer日志interface，核心恢复不依赖日志流。

### 完成条件

- [ ] OPT-023、024、025、026、027 的五类证据全部完成。
- [ ] OPT-028、029要么在决策后完成全部五类证据，要么继续明确标为暂缓/需要决策，不以默认假设关闭。
- [ ] 所有P3验收均为可观察行为；limiter有硬上限；UI不声称删除实际仍保留的远端订单。
- [ ] 若账号迁移不能双读回滚、proxy来源不可信或confirmation有焦点陷阱，相关子项已停止并独立回滚。

## 10. 每个批次的发布前门

- [ ] 重跑该批次在 `03-verification-matrix.md` 中的全部回归范围和通用门禁；记录命令、退出码、测试数量和跳过原因。
- [ ] 逐项反查 `F-* → OPT-* → 测试/验收`，确认没有以一个宽泛测试替代具体触发路径。
- [ ] 高风险项已完成故障注入和回滚演练；迁移先在副本dry-run，兼容reader已先发布或同版本先启用。
- [ ] 未决策或未验证项仍被feature flag、fail-closed策略或人工门禁隔离。
- [ ] 安全扫描证明日志、DTO、fixture、工件和错误消息不含秘密、正文、绝对路径或账号敏感信息。
- [ ] 发布清单写明旧版本是否可继续打开同一workspace；新schema启用后禁止不兼容旧writer。
- [ ] 记录feature flag、启用顺序、监测指标、停止阈值、负责人和授权人工步骤。

## 11. 每个批次的发布后门

- [ ] 只启用本批次已审查的feature flag，观察期内不同时启用无关高风险变更。
- [ ] 核对publication/intent/batch/order/backup等持久事实没有丢失、重复或无法解释的组合。
- [ ] 核对失败路径可见且可操作：unknown/uncertain保持阻断，needs_repair/attention能够被查询。
- [ ] 核对资源、内存、句柄、临时工件和timer没有越界增长。
- [ ] 若触发停止条件，先停止新任务并保存runId/publicationId/attemptId/batch revision，再按计划回滚可执行文件。
- [ ] 回滚后重跑对应验证；不得删除recovery intent、remote ID、备份或未核对的远端事实。
- [ ] 更新实际结果、偏差和遗留风险；只有可观察验收全部满足才关闭 OPT。

## 12. 计划完成总门

- [ ] 29个OPT均具有最终状态；P0/P1/P2/P3项全部完成或有经批准的重新处置。
- [ ] OPT-008、029已有人工决策和实施结果，或明确不进入本轮范围；OPT-028已有产品决定或继续经批准暂缓。
- [ ] 37个原始`F-*`均能双向追踪到处置、OPT和验证证据，未虚构`REVIEW-XXX`。
- [ ] 七个批次的开始门、完成门、发布前门和发布后门均有签认记录。
- [ ] 所有迁移和新schema均有兼容reader、dry-run、回滚映射及旧writer限制。
- [ ] 没有未核对的unknown/uncertain被自动重试、归档或改写成failed/published。
- [ ] 最终全仓门禁通过，外部人工验收完成，运行与回滚文档和风险记录与实际实现一致。
