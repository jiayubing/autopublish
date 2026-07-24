# 阶段3：Publication工作流与恢复

## 1. 阶段目标

建立并切换唯一production `PublicationWorkflow`，把publication、attempt、batch、remote evidence、order reference、recovery intent和post-processing统一交给OperationalStore。阶段结束时旧publication/batch/order JSON writer和publication文件锁必须退出production，所有现有平台通过最终Publisher interface接入，即使其证据implementation要在阶段4继续强化。

关联工作：OPT-002、003、009、013、014；吸收F-H04、F-H05、F-H07、F-H12、F-M13、F-M14。

## 2. 开始条件

- 阶段2为`COMPLETE`。
- OperationalStore、migration dry-run、backup/restore和main-only write owner已验证。
- 当前workspace或合成迁移fixture有可重复manifest。
- 用户已明确授权在哪个隔离workspace副本执行正式迁移演练；不得默认选择真实内容库。

## 3. 必读输入

- 总纲、目标架构、执行协议、进度账本及阶段1/2交接。
- M13、M20、M22、M23、M24、M27 module报告。
- 当前`jobs.js`、platform workbench、publication ledger/store、submission batch/store、sidecar、archive、attention、media order/workbench。
- OPT-002、003、009、013、014及验证矩阵。

## 4. 允许修改

- PublicationWorkflow application/domain modules。
- OperationalStore事务用例和查询，但不得破坏阶段2schema不变量；schema变化必须新增versioned migration。
- Submission、archive、attention、media order和workspace composition生产caller。
- Worker结果协议，使worker不再写OperationalStore。
- 一次性旧状态migration/cutover和旧writer删除。
- 对应测试、文档和运行诊断。

## 5. 禁止修改

- 平台DOM selector、HTTP判定和Python内部发布逻辑；阶段4处理。
- Renderer页面结构；本阶段只保持现有bridge可消费的新DTO。
- Auth领域。
- 通过长期双写维持旧JSON和SQLite一致。
- 将旧无账号记录自动归到当前登录账号。

## 6. 核心不变量

- 文章—target在任一时刻最多一个非终结attempt。
- 远端调用前必须存在durable recovery intent。
- 远端调用后outcome和证据在一个SQLite事务中提交。
- Outcome未提交时不能归档、清队列或创建“完成”projection。
- `uncertain/submitted/submitting`阻断新attempt。
- Post-processing失败不篡改已保存的远端outcome。
- Attention可由OperationalStore和ContentStore完全重建。
- Worker只返回outcome/message，不写数据库、batch、archive或order store。

## 7. 实施步骤

### 7.1 实现PublicationWorkflow

实现并测试：

- `publish(command)`：验证文章/target/account、重复保护、创建attempt和intent、调用Publisher、提交outcome、安排后处理、返回安全结果。
- `recover()`：扫描未终结intent、陈旧run和待处理job，转换为可解释的安全状态。
- `reconcile(command)`：仅允许对明确目标和attempt进行人工核对，保留审计证据。

Interface不得要求caller手动依次调用reserve、markSubmitting、recordOutcome和archive。

### 7.2 建立最终Publisher适配

为现有Toutiao、Lieju、Hepan和Media implementation建立满足阶段1 Publisher interface的真实adapter。此adapter是最终seam，不是临时`LegacyPublisher`透传层：

- 输入使用统一identity/account/target。
- 输出转换为闭集outcome和证据。
- 旧implementation缺少可靠证据时保守返回`uncertain`。
- Adapter不再获得ledger、batch、archive或order store。

阶段4可以替换adapter内部implementation，但不得改变PublicationWorkflow interface。

### 7.3 切换batch和queue

- Submission batch/item迁入OperationalStore。
- Queue Markdown可以作为待投稿内容副本继续存在，但其执行/归档状态由SQLite拥有。
- Sidecar只保留必要的可移植内容快照；不得成为第二publication事实源。
- Main是batch唯一claim/update owner，worker通过消息返回结果。
- Revision、claim token和幂等完成在同一事务中执行。

### 7.4 切换媒体订单关联

- Remote order ID和publication attempt在提交outcome事务中关联。
- 订单展示projection失败不丢remote ID。
- Media retry保留resource target和account identity，不降级为通用platform target。
- 旧JSONL订单记录由migration导入后只读，不继续append。

### 7.5 建立post-processing

Archive、清理队列副本、本地文章回收和projection更新作为可恢复job：

- Job有稳定identity、输入fingerprint、attempt上限和错误分类。
- 远端outcome先提交，post-processing随后领取。
- 失败进入attention并可重试，不重新调用远端Publisher。
- 强杀后重复领取不得重复删除或归档错误文件。

### 7.6 重建attention/reconcile

- Attention从OperationalStore查询和内容文件现实状态派生。
- `submitting`陈旧、`uncertain`、known outcome未完成后处理、身份冲突和migration人工项必须可见。
- DTO包含稳定target/attempt/account/resource identity和允许动作闭集。
- Renderer无法提交未在允许动作中的任意状态修改。

### 7.7 执行production切换

按顺序：

1. 关闭应用并对授权副本生成manifest和备份。
2. Dry-run migration并人工核对所有冲突。
3. 生成全新operations数据库并完成验证。
4. 原子安装数据库和schema marker。
5. 切换composition root到PublicationWorkflow/OperationalStore。
6. 删除旧production writer和publication文件锁路径。
7. 启动恢复扫描和只读旧文件诊断。
8. 运行完整本地E2E；不连接真实外部平台。

旧文件保留在迁移快照中，但代码不得继续写入。旧版本打开升级workspace应明确拒绝，而不是部分写入。

## 8. 故障注入矩阵

至少覆盖：

- intent事务前/后强杀。
- Publisher调用前、调用中、返回后强杀。
- outcome事务失败或磁盘满。
- post-processing领取前、中、完成后强杀。
- batch两个并发claim和旧worker迟到消息。
- remote ID已知但projection失败。
- attention查询时内容文件缺失/变化。
- 同一target重复命令和不同账号target。
- migration完成后旧writer尝试启动。

## 9. 阶段验证

- 阶段0全局门禁。
- OperationalStore全套回归。
- PublicationWorkflow interface、fake Publisher、每个平台contract adapter测试。
- Worker→main result→outcome transaction→post-processing→attention端到端测试。
- 进程强杀/重启、磁盘满和并发claim测试。
- 合成旧workspace migration、升级后重启和完整回滚快照演练。
- 静态搜索证明worker/adapter不引用OperationalStore writer，旧JSON writer无production引用。

## 10. 完成条件

- Production只有一个PublicationWorkflow和一个OperationalStore write owner。
- 旧publication/batch/order writer、publication文件锁和跨文件read-modify-write退出production。
- 所有平台通过最终Publisher interface接入；弱证据为`uncertain`。
- 任一故障点重启后只能得到安全终态、可恢复job或明确attention。
- Remote outcome和order evidence不因projection/archive失败而丢失。
- Attention可删除并重建，不是第二事实源。
- 迁移、备份、旧版本拒绝和回滚快照均验证。

## 11. 停止条件

- Caller仍需理解transaction、intent或archive顺序。
- 为保持旧路径而出现双写。
- Worker/adapter仍直接写数据库或队列状态。
- 未知远端结果被自动判`failed/published`。
- Migration存在未解释冲突或旧账号被自动猜测。
- 回滚无法恢复迁移前完整workspace副本。

## 12. 交接重点

记录最终PublicationWorkflow/Publisher/OperationalStore入口、production调用图、删除的旧writer、schema版本、迁移报告、故障测试数量、所有attention动作和阶段4需要强化的各平台证据缺口。

