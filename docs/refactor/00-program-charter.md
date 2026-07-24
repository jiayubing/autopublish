# 重构工程总纲

## 1. 工程目标

本工程把 AutoPublish 从“功能持续叠加的小工具”重构为可以由多个 Codex 任务长期维护的规范工程。目标不是追求目录整齐或框架流行，而是让复杂业务规则归属于少数深module，使新增平台、任务类型、账号、状态和页面时不再跨多个caller复制协调知识。

重构完成后应具备以下性质：

- 每种持久业务事实有唯一权威owner。
- 外部投稿前后均有可恢复的持久意图，不确定结果不会盲重试。
- 新增平台只需要实现publisher adapter并注册，不修改ledger、batch、archive和renderer。
- 新增renderer mutation只修改对应feature module，不在多个页面手工订阅刷新。
- 测试和production caller通过同一seam。
- 内容库迁移、恢复、打包和真实运行拓扑都有自动门禁。
- 后续 Codex 任务可以通过module、interface、状态不变量和定向测试快速定位修改范围。

## 2. 已接受的假设

- 产品继续是单用户、单机内容运营桌面应用，不在本轮改为多租户云平台。
- 未来会增加较多平台、工作流、账号、查询、调度和恢复能力。
- 可以冻结普通功能开发并承受计划内停机和高风险重构。
- 不维护长期新旧实现、长期双写或旧可执行文件继续写升级workspace的能力。
- 现有用户内容和业务历史仍有价值，不能以“无需兼容”为由直接丢弃或不可逆覆盖。
- 普通平台未来按账号区分发布目标；即使UI暂时只允许每个平台一个账号，内部identity也必须account-aware。

若产品方向改为多人协作、云端统一调度或多机器同时操作同一内容库，应停止本工程并重新设计部署形态；当前计划不为这些场景建立伪扩展点。

## 3. 范围

### 包含

- Git根CI、测试发现、production seam和打包门禁。
- publication、attempt、batch、order、remote evidence、recovery intent的SQLite权威状态。
- 外部平台运行期、publisher interface和adapter证据语义。
- 内容身份、生成交接、投稿队列、trash/removal生命周期。
- Renderer feature状态、请求identity、IPC DTO和失效消费。
- Auth灾备、限速容量、代理来源、构建发布、安全工件和结构化诊断。
- 旧runtime/controller/store writer和影子测试的删除。
- JavaScript到严格类型的随module渐进迁移。

### 不包含

- 转换到Tauri、浏览器Web应用或云端微服务。
- 为“可能有一天需要”建立消息队列、分布式事务或插件框架。
- 在架构重构中新增普通产品功能。
- 真实生产账号投稿、付费、撤回、换号、DNS/证书配置或生产数据库覆盖。
- 一次性全仓改写TypeScript、全量改名或纯格式化。
- 长期支持旧版本写入新schema。

## 4. 风险姿态

本工程接受：

- 阶段内大范围修改；
- 删除已被新seam替代的旧implementation；
- 内容库升级后旧版本拒绝打开；
- 在隔离副本上进行破坏性迁移演练；
- 为建立正确module而修改当前内部文件格式和调用路径。

本工程不接受：

- 未备份就迁移现有内容库；
- 将远端未知事实改写为`failed`并自动重试；
- 长期双写旧JSON和SQLite；
- 同一阶段存在两个production writer；
- 为通过测试而保留影子runtime或测试专用production seam；
- 使用真实Cookie、API key、客户稿件、生产备份或真实付费接口作为自动测试数据；
- 未验证就删除旧业务历史。

## 5. 串行阶段规则

1. 阶段0建立门禁后才能修改核心架构。
2. 阶段1冻结领域语言、身份和interface后才能建立数据库schema。
3. 阶段2完成单一OperationalStore后，阶段3才能切换PublicationWorkflow。
4. 阶段3稳定远端事实协议后，阶段4才能逐平台切换。
5. 内容和renderer可在平台切换后重构，但不得重新发明publication规则。
6. Auth/构建阶段不能修改已经冻结的publication模型。
7. 只有阶段8完成旧代码删除和全链验收，普通功能开发才重新开放。

任一阶段发现前一阶段interface错误，应回到前一阶段重新打开状态，不得在后续caller中增加绕行适配。

## 6. Worktree、分支和提交规则

- 整个工程使用一个长期worktree：`F:\官媒投稿-refactor`。
- 整个工程使用一条严格串行分支：`codex/refactor-program`，不为每个阶段再创建分支。
- 同一时间只允许一个Codex任务修改该worktree；多个任务只能按阶段或阶段内子步骤依次接力。
- 阶段内可以有多个小commit，但阶段收口任务必须运行完整验收，并形成一个可明确识别的阶段里程碑commit。
- 下一阶段只从已确认的上一阶段里程碑commit开始，不从未审查的脏工作区继续。
- Codex默认不自行创建commit；只有阶段调用提示明确授权时才提交。未授权时由用户在验收后固化里程碑。
- 原工作区`F:\官媒投稿`只作为规划来源和历史参考，不执行阶段代码，不与重构worktree双向复制未提交改动。
- 当前原工作区存在用户已有文档删除，任何任务不得用reset、checkout或clean处理。

## 7. 全局完成指标

- `src → desktop`反向依赖为0，并由静态门禁保护。
- production runtime/controller各只有一个seam。
- OperationalStore只有SQLite production writer；旧JSON/JSONL writer为0。
- 所有外部publisher返回证据化`published/failed/uncertain`。
- 强杀、断连、磁盘满、迁移失败和archive失败均得到安全、可观察、可恢复结果。
- 新增一个普通平台adapter不修改PublicationWorkflow implementation。
- 新增renderer mutation不需要修改两个以上的feature module。
- 默认CI覆盖`.js/.mjs`、auth、lint/typecheck、renderer build、migration、故障注入和production package smoke。
- 所有37条审查finding均有最终关闭、重新处置或人工决定记录。
