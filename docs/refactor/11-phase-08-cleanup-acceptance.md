# 阶段8：旧架构删除与最终验收

## 1. 阶段目标

删除重构期间剩余的旧production seam、writer、compatibility adapter、无效测试和过期文档，执行全链故障、迁移、容量、制品和人工门验收，正式判断项目是否可以重新开放大量功能开发。

本阶段不新增架构能力；任何需要新interface的发现都应重新打开其所属前序阶段。

## 2. 开始条件

- 阶段0～7均为`COMPLETE`；允许阶段4/7列出的production人工验收处于明确`PENDING_HUMAN`，但正式release会继续blocked。
- 每阶段交接文件存在且列出的旧路径删除任务均可追踪。
- 当前分支基于阶段7完成commit，工作区无未解释变化。

## 3. 必读输入

- `docs/refactor/`全部总纲、阶段文档、进度账本和handoffs。
- `docs/refactor/12-traceability-matrix.md`。
- `docs/review/05-final-findings.md`和全部finding disposition。
- `docs/optimization/03-verification-matrix.md`、`04-risk-and-decisions.md`。
- 当前production入口、package/build配置和所有architecture tests。

## 4. 允许修改

- 删除已确认无production引用的旧module、writer、adapter、hook、bridge、测试和文档。
- 收紧依赖、lint、类型、package和architecture gates。
- 修正因删除暴露的同阶段遗漏。
- 最终运行手册、架构图、CONTEXT、ADR状态、migration/release文档。
- 追踪矩阵、进度账本和最终handoff。

## 5. 禁止修改

- 新增产品功能。
- 设计新的domain/application interface。
- 为保留旧测试重新引入wrapper。
- 未经数据证明的全仓性能重写。
- 删除migration备份或用户历史。
- 将待人工验收伪装为自动通过。

## 6. 实施步骤

1. 从真实production入口生成当前module、writer、worker、IPC和renderer调用图，与全部阶段handoff逐项比较。
2. 按“production seam → writer →测试→依赖→文档”的顺序删除旧路径，每删除一组立即运行对应interface和caller回归。
3. 收紧静态架构、类型、package和敏感信息门禁，确认删除后没有通过新wrapper重新引入同一复杂性。
4. 依次执行功能、故障、安全、迁移、容量和制品验收；任一类别失败时重新打开所属阶段。
5. 执行功能开发准入模拟，更新追踪矩阵、进度账本、架构图、运维/release文档和最终交接。

## 7. 清理清单

### 7.1 Production seam

确认并删除：

- 影子workspace runtime/controller/hooks。
- 旧publication ledger/batch/order JSON writers和文件锁。
- 旧jobs远端协调与adapter直写状态路径。
- 旧共享PlatformRun可变字段和过时worker message。
- 页面级重复invalidation订阅、共享busy和native confirm。
- 客户路径拼接、可选unique finder和启动一次恢复器。
- 原始publish-log和整页诊断截图路径。
- 公网HTTP默认配置及不安全确认豁免。

### 7.2 测试

- 新interface测试存在后删除穿透旧implementation的测试。
- 默认测试没有重复验证同一旧/新行为。
- Test double不能拥有production adapter没有的能力。
- 架构测试读取真实production入口。
- 所有skip有平台原因和issue；无“暂时跳过重构失败”。

### 7.3 依赖与构建

- `src → desktop`反向引用为0。
- Domain/Application不引用infrastructure implementation。
- Renderer不引用Node/infrastructure。
- Worker/adapter不引用OperationalStore writer。
- 无未使用依赖、重复工具链和无owner脚本。
- Generated output不进入Git，production package不含测试/fixture/敏感数据。

### 7.4 文档

- 更新项目地图和架构图为当前production现实。
- CONTEXT只保留业务语言，不混入implementation。
- ADR状态与最终实现一致；被放弃决策明确superseded。
- README、运维、备份、迁移、release和故障处理命令可执行。
- 原审查记录保持不改；通过追踪矩阵记录关闭证据。

## 8. 最终验收矩阵

### 8.1 功能与领域

- 客户/文章/模板/生成/入队/发布/订单/attention/trash全链离线E2E。
- 每个平台使用fake/fixture通过Publisher contract。
- 多账号target、媒体resource target和重复保护。
- Draft、handoff、排序、删除/恢复和迁移。

### 8.2 故障与恢复

- 外部调用前后强杀。
- timeout、接收后断连、弱页面证据。
- SQLite事务/磁盘满/WAL/损坏。
- Post-processing/archive失败。
- 旧worker消息、快速stop/start。
- Removal重复runner和最大重试。
- 应用重启后attention和run snapshot重建。

### 8.3 安全

- Electron sandbox/preload/IPC认证。
- HTTP拒绝、TLS错误和账号切换阻断。
- DTO/log/fixture/temp/package敏感信息扫描。
- Path traversal、symlink、普通文件和workspace包含关系。
- Auth密码/token、代理来源和限速容量。

### 8.4 迁移与回滚

- 旧合成workspace dry-run→迁移→重启→验证。
- 损坏、冲突、unknown account和重复migration。
- Operations DB与内容文件引用一致。
- Backup destination和隔离restore。
- 迁移失败恢复整个快照。
- 旧版本对升级workspace明确拒绝。

### 8.5 容量与制品

- 1万publication、多attempt、5000 batch items。
- 1万媒体资源分页/去重/IPC限制。
- 500/5000生成任务索引。
- 100k Auth limiter identity。
- Windows production `--dir`、Python、Playwright、SQLite和migration CLI smoke。
- Auth Linux容器smoke。

## 9. 功能开发准入测试

用三个模拟变更验证架构深度，不实际开发产品功能：

1. **新增fake平台**：只实现Publisher adapter和registry配置，PublicationWorkflow、OperationalStore和Renderer无需修改。
2. **新增publication查询字段**：只调整权威query/DTO和对应feature snapshot，不在多个View手工刷新。
3. **新增content command**：通过Content application interface、typed IPC和一个feature module完成，不接触路径/数据库implementation。

如果任一模拟要求跨越多个不相关module学习内部顺序，重新打开相应阶段深化interface。

## 10. 完成条件

- 所有旧production seam/writer清单为0引用并删除。
- 全局依赖规则和唯一owner规则由CI自动保护。
- 37条finding及29个OPT都有最终证据、重新设计说明或明确人工状态。
- 全部自动验收全绿，无未解释skip。
- Migration、rollback、fault injection、容量和制品证据齐全。
- 三个模拟功能变更通过深度测试。
- 项目地图、架构、CONTEXT、ADR、运维和release文档与代码一致。
- `13-progress-ledger.md`将工程标记为`COMPLETE`，并给出可开始功能开发的基线commit。

## 11. Release与功能开发判断

- 若自动验收完成但平台账号、HTTPS、签名或真实Auth恢复演练未完：架构重构可以完成，普通本地功能开发可开放，正式production release保持blocked。
- 若存在远端未知事实、迁移未解释冲突、旧writer或回滚失败：重构和功能开发均不得开放。
- 后续新功能必须先声明它属于哪个Domain/Application/Renderer feature module；无法归属时先做设计评审，不直接添加跨层caller。

## 12. 停止条件

- 仍存在旧production writer、影子runtime/controller或长期compatibility adapter。
- 全链验收出现无法归属到权威module的状态或错误。
- Migration、backup或rollback无法证明现有内容和运行历史可恢复。
- 自动测试需要真实外部账号、秘密或生产数据才能通过。
- 功能开发准入模拟要求修改多个无关module或学习implementation顺序。
- 追踪矩阵中仍有未解释finding/OPT，或人工项被误标为自动完成。

触发时重新打开所属前序阶段并保持工程`IN_PROGRESS`；不得通过阶段8局部wrapper或跳过测试收口。

## 13. 最终交接

创建`docs/refactor/handoffs/phase-08.md`及一份最终工程报告，列出：完成commit、自动/人工证据、最终module地图、schema版本、迁移工具、release blockers、已关闭finding/OPT、剩余技术债和首个新功能应该使用的开发模板。
