# Codex 分阶段执行协议

## 1. 单任务范围

每个 Codex 任务只执行一个阶段或该阶段文档明确拆出的一个连续子步骤。任务不得顺便修复后续阶段、增加产品功能或进行无关格式化。当前阶段发现后续问题时，只记录到进度账本的“后续输入”，不提前实现。

## 2. 开始前检查

执行者必须：

1. 按`README.md`规定读取总纲、目标架构、执行协议、进度账本和当前阶段文档。
2. 读取当前阶段列出的审查module报告、OPT和实际production caller。
3. 执行并记录：
   - `git branch --show-current`
   - `git rev-parse HEAD`
   - `git status --short --untracked-files=all`
   - `git diff --name-only`
   - `git diff --cached --name-only`
4. 验证前一阶段在`13-progress-ledger.md`为`COMPLETE`，并核对完成commit。
5. 识别用户已有改动；不恢复、不清理、不覆盖、不混入本阶段。
6. 建立本阶段计划，明确最多一个`in_progress`步骤。
7. 先运行本阶段要求的基线测试并记录数量、失败和跳过。

如果基线与进度账本不一致，先更新实际情况并停止实现，除非可以证明差异只来自本阶段获准的文档或用户改动。

## 3. 上下文控制

- 使用`rg`和production入口定向读取，不重新扫描全仓。
- 优先读取当前阶段文档引用的文件及其直接caller/callee。
- 一个旧finding只作为线索；以当前代码和前序阶段交接为准。
- 不从旧聊天推断interface；权威信息是当前代码、`01-target-architecture.md`、ADR、CONTEXT和阶段交接。
- 如果阶段跨多个任务，第一个任务必须在交接文件记录已完成和未完成的具体symbol、测试与风险；下一个任务从交接文件继续。

## 4. 实施循环

每个工作块采用以下顺序：

1. 写一个在旧implementation上失败、能表达目标interface可观察行为的测试。
2. 建立或调整目标module的interface。
3. 通过组合根注入真实adapter与测试adapter。
4. 切换一个完整production caller。
5. 运行该module、caller、下游持久化和失败路径测试。
6. 删除该caller对应的旧路径、旧writer和穿透旧implementation的测试。
7. 运行阶段回归。
8. 更新文档和交接证据。

不要先建立一层wrapper保留全部旧interface，再把重构推迟到“以后”。同一阶段允许短暂编译中间态，但阶段结束时只能有一个production seam和一个writer。

## 5. 测试规则

- production caller和测试必须通过同一seam。
- 远端外部系统使用mock adapter、脱敏fixture或本地fake server；禁止真实投稿、扣费和生产账号操作。
- 文件和SQLite测试使用临时隔离workspace，不能指向真实内容库。
- 时间、进程存活、child、网络和磁盘错误使用可控internal seam。
- 故障测试至少覆盖操作前、远端调用前、远端调用后、持久化前、持久化后和后处理阶段。
- 每个迁移必须有空库、当前schema、旧schema、损坏输入、中断、重复执行和回滚验证。
- 每个阶段完成前运行该阶段列出的全量命令；不能以定向测试替代阶段门禁。

## 6. 数据与迁移安全

- 任何写迁移先对合成fixture运行，再对用户授权的内容库副本dry-run。
- 迁移前创建可校验快照；快照和数据库不得进入Git。
- Dry-run输出计数、冲突、未知账号、损坏记录和将执行的动作，不修改输入。
- 正式迁移只有在dry-run零未解释错误后允许执行。
- 新schema启用后旧writer必须删除或启动时拒绝。
- 回滚恢复整个迁移前快照，不试图让旧writer解释部分新schema。
- Codex不得自行选择、复制、打开或覆盖真实用户内容库；需要用户提供明确的隔离路径和授权。

## 7. 发现计划偏差时

按以下类别处理：

- **实现细节偏差**：不改变interface和阶段目标，可直接调整并写入交接。
- **Interface偏差**：会让caller学习更多规则，停止并更新目标架构/阶段文档后再继续。
- **领域语义冲突**：代码、CONTEXT和计划含义不同，停止并请求用户决定；决定后立即更新CONTEXT或ADR。
- **前序阶段缺陷**：重新打开前序阶段，不在当前阶段增加补丁适配。
- **外部事实缺失**：采用fail-closed、fixture-only或标记人工验收，不猜测生产行为。

## 8. 阶段完成流程

执行者必须：

1. 逐条核对当前阶段完成条件。
2. 运行阶段全量测试和全局基础门禁。
3. 检查production引用，确认旧seam/writer已删除。
4. 检查Git差异只包含当前阶段获准范围和已知用户改动。
5. 更新`13-progress-ledger.md`的状态、实际commit占位、测试证据和偏差。
6. 创建`docs/refactor/handoffs/phase-XX.md`，使用`14-handoff-template.md`。
7. 未满足条件时保持`IN_PROGRESS`或`BLOCKED`，不得写`COMPLETE`。
8. 最终回复说明改动、测试、未完成事项、人工动作和下一阶段是否可开始。

## 9. Git协议

- 不执行`git reset --hard`、`git checkout --`、`git clean`或未确认的批量删除。
- 不自动提交或推送，除非当前用户请求明确授权。
- 用户授权提交时，提交只包含当前阶段文件；用户已有改动必须排除。
- 下一阶段开始前，用户应把上一阶段结果固化为明确commit，或在进度账本记录经确认的等价基线。

## 10. 外部与人工动作

以下动作始终由人工完成或单独授权：

- 真实平台登录、投稿、付费、撤回和换号。
- 生产HTTPS、DNS、证书、Cloudflare、WAF和代理配置。
- 真实Auth数据库恢复、删除备份、定义RPO/RTO。
- 正式安装包签名和发布。
- 读取或导出真实Cookie、API key、客户稿件、浏览器profile和诊断图像。

Codex可以准备命令、fixture、dry-run和检查表，但不能把未执行的人工步骤标记为已验证。

