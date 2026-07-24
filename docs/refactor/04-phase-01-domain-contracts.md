# 阶段1：领域契约与目标module骨架

## 1. 阶段目标

在修改存储和业务执行前，冻结身份、状态、远端证据、错误协议、依赖方向和组合根规则。建立目标module的真实production骨架与类型/运行时验证，但不迁移用户数据、不切换publication writer。

关联工作：为OPT-002～029提供共同interface；正式解决OPT-029的账号identity设计前置。

## 2. 开始条件

- 阶段0为`COMPLETE`，当前代码位于其完成commit。
- 默认CI和production seam测试全绿。
- `auto—publish/CONTEXT.md`、ADR-0003和ADR-0004已纳入当前基线。

## 3. 必读输入

- 本工程总纲、目标架构、执行协议、进度账本。
- `CONTEXT.md`和`auto—publish/CONTEXT.md`。
- `docs/adr/0001`～`0004`。
- `docs/review/01-project-map.md`、`02-architecture-review.md`、`04-cross-cutting-review.md`。
- M03、M04、M05、M20、M22、M23、M24、M25、M26、M27 module报告。
- 当前publication targets/state、IPC response、workspace composition、platform loader和renderer bridge类型。

## 4. 允许修改

- 新的domain/application contract、identity、runtime validation和安全错误module。
- Electron唯一组合根及仅用于组装新module骨架的代码。
- 架构/contract测试和构建/typecheck配置。
- `CONTEXT.md`、ADR和本阶段文档。

## 5. 禁止修改

- 现有publication、batch、order的持久化implementation。
- 平台DOM/HTTP/Python行为。
- 用户workspace数据和迁移。
- Renderer业务页面和产品行为。
- 为尚无第二个adapter的implementation创建公共port。

## 6. 固定的领域决策

本阶段实现下列已确定语义，不重新讨论同义命名：

- 应用账号、客户、平台账号档案是三个不同identity。
- 普通平台target包含`platformId + accountProfileId`。
- 媒体target包含`mediaResourceId`。
- `published`、`submitted`、`failed`、`uncertain`按目标架构定义。
- `published`必须带远端发布证据；`uncertain`阻断自动重试。
- Attention是派生查询，不是持久publication状态。
- Renderer snapshot不是权威状态。

若代码存在相反行为，本阶段记录迁移需求，不用兼容字段模糊上述语义。

## 7. 实施步骤

### 7.1 建立identity value objects

为ClientId、ArticleId、PublicationId、AttemptId、BatchId、AccountProfileId、MediaResourceId和RemoteId建立：

- 唯一构造/解析入口；
- 空值、长度、字符集和规范化规则；
- 不可混用的类型；
- 安全序列化形式；
- runtime validator；
- 不暴露绝对路径的错误。

不得让string wrapper扩散大量无价值方法；identity module应隐藏验证和target key生成复杂性。

### 7.2 固定publication target

建立闭集target：

- 普通平台target：平台 + 平台账号档案。
- 媒体target：媒体资源；如媒体服务也支持账号，再显式增加而不是复用平台字符串。

旧无账号记录的迁移语义固定为`legacy-unknown-account`且不可自动执行。Target key生成只存在一个implementation。

### 7.3 固定Publisher interface和outcome

实现`01-target-architecture.md`中的publisher interface、证据类型和安全错误。至少提供：

- 一个本地fake publisher adapter用于contract tests；
- 对现有平台implementation的编译期/运行时适配验证，不在本阶段切换production调用。

publisher interface是多个真实平台共同变化的seam，不为每个平台再暴露相同的公共wrapper层。

### 7.4 固定command/result DTO

- Domain types不携带文件路径、Electron对象、Playwright page或renderer callback。
- IPC/worker/network DTO使用显式版本和闭集字段。
- 运行时拒绝额外敏感字段、未知状态和非法组合。
- Error DTO只有稳定code、category、retryability、userMessage和可选diagnosticId。

### 7.5 建立目标组合根骨架

在唯一workspace composition root中预留新application modules的组装位置。依赖由外部创建并注入，module内部不自行`new`数据库、publisher或Electron资源。

本阶段骨架不得成为透传旧implementation的第二套production runtime；如果尚未切换，只能在测试/构建中实例化，production仍保持阶段0唯一seam。

### 7.6 确定主进程类型构建方式

用一个最小真实module证明：

- strict类型检查；
- Node/Electron main可以加载；
- worker可以加载共享DTO；
- renderer只能加载不含Node implementation的共享contract；
- production package包含正确编译产物和source map策略；
- 不把密钥或本地路径打入renderer bundle。

允许选择TypeScript emit、受控bundle或严格checked JavaScript，但必须以真实packaging smoke决定。选择结果记录ADR；禁止仅凭偏好全仓改写。

### 7.7 建立依赖方向门禁

自动拒绝：

- domain/application引用desktop、renderer或具体publisher implementation；
- `src`内层新增`desktop`引用；
- renderer引用Node builtin或infrastructure；
- platform adapter引用OperationalStore/renderer；
- 测试绕过public interface读取内部implementation来证明架构。

## 8. 测试要求

- 所有identity合法/非法/规范化/不可混用测试。
- 所有target组合和稳定key测试。
- Publisher contract对published/submitted/failed/uncertain的正负测试。
- outcome和error敏感字段拒绝测试。
- IPC/worker DTO版本与未知字段测试。
- composition root生命周期测试。
- dependency rule测试。
- 主进程、worker、renderer和production package加载smoke。

## 9. 完成条件

- 领域术语、identity、target、outcome和安全错误只有一份权威定义。
- 普通平台target已account-aware；旧未知账号迁移规则已测试。
- Publisher interface可由fake和至少两个平台contract fixture共同验证。
- 主进程类型策略通过真实Electron/worker/package smoke并有ADR。
- 依赖方向门禁进入默认CI。
- 本阶段未切换持久writer、未创建真实workspace数据库、未改变产品行为。
- 交接明确阶段2可直接使用的类型、module路径和schema约束。

## 10. 停止条件

- 无法让main、worker和renderer安全共享contract而不暴露Node implementation。
- 平台账号identity无法定义，导致target key仍只能按平台。
- 类型构建破坏production package且没有可验证替代方案。
- 新module interface要求caller继续协调ledger、batch或archive。
- 出现必须修改持久数据才能证明contract的情况。

## 11. 交接重点

列出所有稳定interface及其入口文件、类型构建ADR、dependency rules、target key示例、旧记录迁移规则、尚未切换的production caller和阶段2禁止改变的schema语义。

