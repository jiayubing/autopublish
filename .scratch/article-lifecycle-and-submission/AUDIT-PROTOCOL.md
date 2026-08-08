# Article Lifecycle Audit Protocol

> 本文件只回答 **HOW TO VERIFY / WHEN TO STOP REVIEW**。目标是证明当前合同和受影响不变量已经闭合，而不是通过无限重新扫描追求“永远再也找不到新问题”。

## 1. 默认审计闭环

每个 Ticket/Maintenance 默认只经历：

1. **Primary Audit**
2. **Finding Remediation**
3. **Bounded Re-audit**
4. **Closure**

整个 Wave 再额外进行一次 **Wave Integration Audit**。

除用户明确要求独立全新审计，或触发第 6 节 escalation 条件外，不得在 bounded re-audit 后再启动一轮 fresh full review。

## 2. Primary Audit

范围仅限当前合同及其最小闭合调用链。检查：

- 唯一 owner 与公开合同；
- 直接调用方/消费者；
- 持久事实与事务边界；
- 失败、并发、幂等、restart/recovery；
- uncertain / retry / 外部副作用安全；
- IPC/DTO/bridge 边界（如适用）；
- 安全与敏感诊断；
- acceptance tests 是否验证公开行为而非私有源码结构。

Primary Audit 可以主动发现新的 in-scope finding，但不得把整个仓库的历史债全部拉入当前 Ticket。

## 3. Finding 分类

每个 finding 同时标注严重度与来源：

来源：

- `INTRODUCED_BY_CHANGE`：当前改动直接引入；
- `EXPOSED_PREEXISTING`：本次 review 暴露的既有债务；
- `CROSS_TICKET_INTERACTION`：单 Ticket 局部成立，但与本 Wave 其他 Ticket 组合后不一致；
- `PROCESS_EVIDENCE_GAP`：实现未必错误，但当前 HEAD 的测试/audit/provenance evidence 不完整。

严重度：

- **P0/P1**：当前阶段必须关闭；
- **P2**：仅在直接违反当前 acceptance、持久事实一致性、幂等/uncertain/retry 安全、当前公开合同或本轮直接回归时阻塞；否则登记明确未来 owner；
- **P3**：默认不阻塞，记录即可。

不得通过降低测试强度、删除有效 guard、制造 compatibility shim 或复制 owner 来“解决” finding。

## 4. Finding Remediation

修复只覆盖：

- 已确认 finding；
- finding 的最小闭合调用链；
- 为证明修复必要的行为测试/诊断/文档。

修复时发现无关历史债，按来源分类并登记，不自动扩大本轮 scope。

## 5. Bounded Re-audit

复审只验证：

- 已知阻塞 findings 是否关闭；
- 修复 diff；
- 修复直接影响的不变量、调用方和状态矩阵；
- 对应回归测试；
- 是否触发 escalation。

**禁止**把 bounded re-audit 重新解释为“再从头完整 review 一遍当前 Ticket/仓库”。

满足以下条件必须收敛为 `PASS`：

- 已知阻塞 finding 全部关闭；
- 直接回归和受影响不变量通过；
- 对应定向 gate 通过；
- 没有 escalation 条件；
- 非阻塞 P2/P3 已登记 owner 和后续处理点。

## 6. 允许扩大审计的 Escalation

只有以下情况允许增加一轮，并且范围只扩大到受影响边界：

- 修复新引入 P0/P1、数据丢失、安全/权限或不可逆远端副作用风险；
- 修复实际改变公开合同、schema、状态 owner、事务边界或远端副作用边界；
- 新证据证明 Primary Audit 的关键前提为假；
- 当前 Wave 的组合测试发现新的 `CROSS_TICKET_INTERACTION`，且属于本 Wave 必须保证的不变量。

“再仔细看看”“也许还能找到别的问题”不是 escalation 条件。

## 7. Wave Integration Audit

只检查本 Wave 的**跨 Ticket**问题，不重做每个 Ticket 的 Primary Audit。

最低检查：

- 共享 owner 是否产生旁路或第二 writer；
- 跨 Ticket 状态转换和 first-wins/priority 是否一致；
- 事务、锁、并发、重复调用是否产生双写/矛盾事实；
- uncertain / retry / cancellation / remote observation 是否组合安全；
- IPC/DTO/store 依赖方向是否被组合改动破坏；
- 前序安全边界是否回退；
- 是否新增 silent failure 或以源码 regex 替代业务行为测试。

Wave finding 修复后只做 **Bounded Closure Re-audit**，验证 finding、修复 diff、直接跨 Ticket 回归和最终状态矩阵；除 escalation 外不再开启另一轮广域 Wave review。

## 8. Integration Matrix 设计原则

复杂状态机 Wave 必须在实施前/集成前列出有限状态矩阵，而不是依赖 reviewer 临场“想到什么测什么”。矩阵至少覆盖：

- 正常成功；
- 明确失败；
- uncertain；
- duplicate/idempotent；
- stale/reordered；
- restart/recovery；
- 两个共享 owner 的关键先后顺序；
- 已建立不可逆事实后的迟到远端 observation。

矩阵写在当前 Wave Plan 或该 Wave handoff，完成后归档；不把历史矩阵长期塞回 `AGENTS.md`。

## 9. Final Gate 与 Evidence

阶段只能在以下条件同时成立时标记 `COMPLETE`：

- 所有执行项已达到各自 Closure；
- Wave Integration Audit / bounded closure re-audit PASS；
- 所有必须修复 finding 已关闭；
- 所有修复已进入最终 integration HEAD；
- 工作树满足阶段要求；
- 在**最终 clean HEAD** 上运行该阶段要求的完整 gate 并 PASS；
- evidence 绑定真实 commit/sourceState、命令、环境和结果。

人工“确认没问题”不能替代合同要求的 final HEAD 自动化 evidence。

## 10. 审计报告最小格式

每次审计只输出：

- Scope；
- Checked invariants；
- Findings（severity + source + evidence + owner）；
- Blocking / deferred；
- Required remediation；
- Re-audit scope；
- PASS/BLOCKED 结论与理由。

不重复抄写整个 Ticket、SPEC 或历史 commit 日志。
