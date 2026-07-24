# 阶段6：Renderer状态与Typed IPC

## 1. 阶段目标

把Renderer从分散的页面状态、请求竞态和命令busy重构为按业务feature拥有snapshot与生命周期的module；IPC只承担认证、运行时验证和DTO转换。完成后View不再解释publication/content内部规则，新增mutation不需要在多个页面重复订阅和刷新。

关联工作：OPT-015、020、021、022、023、024、027；覆盖F-H01、F-M03～M08、F-L01。

## 2. 开始条件

- 阶段5为`COMPLETE`。
- Publication、Content和Platform的application interfaces及DTO稳定。
- 当前Renderer可以通过阶段0门禁构建和类型检查。

## 3. 必读输入

- 总纲、目标架构、协议、进度账本和阶段3～5交接。
- M05、M06、M07、M08、M09、M10、M23 module报告。
- 当前preload、IPC registrars、renderer bridges、App、ContentWorkbench、PlatformWorkbench、GeneratedArticlesView、SettingsView、OrdersView、attention/workspace stores。
- OPT-015、020～024、027及验证矩阵。

## 4. 允许修改

- Renderer feature modules、views、controllers/stores/hooks。
- Preload能力面、IPC adapters、共享DTO和runtime validators。
- Workspace invalidation消费和query/command infrastructure。
- Renderer E2E、deferred promise、焦点和容量测试。
- 删除被新feature module替代的旧hooks/controller/bridge订阅。

## 5. 禁止修改

- Domain/Application interface来迁就View局部状态。
- OperationalStore、ContentStore和平台adapter implementation。
- 让Renderer获得文件路径、数据库handle、Cookie、原始Error或任意IPC channel。
- 同时保留新feature module与旧页面订阅作为长期双轨。
- 为状态管理而默认引入大型框架；只有现有需求证明interface收益时才增加依赖。

## 6. Renderer目标结构

每个feature module至少拥有：

- query参数与当前scope；
- 单调request identity或AbortSignal；
- 当前snapshot；
- command级busy/error，不共享一个全局布尔值；
- invalidation reason→query映射；
- subscribe/dispose；
- stale response丢弃；
- 安全、稳定的View commands。

建议feature：`workspace`、`content`、`generation`、`platform`、`media`、`attention`、`settings`。Feature数量以真实状态所有权为准，不按页面一一创建浅wrapper。

## 7. 实施步骤

### 7.1 统一Typed IPC

- 每个command/query有显式channel、schemaVersion、request DTO、result DTO和错误code闭集。
- Preload只暴露领域能力，不暴露通用`invoke(channel, payload)`。
- IPC adapter执行认证、runtime validation、application module调用和安全错误转换。
- Renderer bridge不重复实现验证和错误映射。
- Event携带revision、scope、reasonCode；未知scope安全忽略并记录诊断。

### 7.2 建立请求identity infrastructure

- 每个query scope拥有request token。
- Scope切换、invalidation和dispose会使旧token失效。
- initial load、refresh和command后的reload通过同一identity规则。
- 响应提交前同时验证token和当前scope identity。
- 旧客户/文章/资源响应不能写入新scope。

先实现该基础，再迁移各feature。

### 7.3 迁移content/generation

- Content feature拥有客户、文章、编辑会话和生成状态snapshot。
- View不直接组合多个bridge请求猜测阶段。
- Destructive command采用`prepare → modal confirmation → execute`，prepare reject必须进入错误状态而非unhandled Promise。
- Generation command的启动、暂停、停止、继续按独立operation token收敛。

### 7.4 迁移platform

- Platform feature以PlatformRun snapshot为权威busy来源。
- Submit、pause、stop分别有独立command owner；一个command失效不让另一个永久busy。
- 旧run message和stale command result不覆盖当前snapshot。
- `stopping`在UI明确可见，terminal前不允许重新start。

### 7.5 迁移media

- 资源查询保持真实分页，不再通过`pageSize:99999`跨IPC全量复制。
- Feature按ID去重、检测重复页/total/hasNext矛盾并报告截断。
- 服务端有maxPages/maxResources硬上限，Renderer不能绕过。
- Resource selection、submission和order query分别有scope identity。
- 大数据测试测量IPC payload和Renderer内存，而非只断言数组长度。

### 7.6 统一attention与invalidation

- 一个workspace query coordinator消费`workspace:data-invalidated`。
- Reason→scope映射只存在一处；feature订阅自己的query结果。
- 同一reason不会让多个View重复发相同请求。
- Attention action使用后端允许动作闭集，不由View根据状态字符串猜测。

### 7.7 统一confirmation host

- 移除业务中的`window.confirm/confirm`。
- 独立host负责queue、backdrop、焦点陷阱、初始焦点、Escape、Tab和焦点恢复。
- Cancel执行零业务command，Confirm恰好一次。
- 高风险command显示目标identity和不可逆影响，不显示绝对路径/秘密。

### 7.8 修正剩余交互语义

- Settings自检成功/失败/finally后按钮均恢复。
- 订单“清空”如果只清本地projection，改成准确文案/筛选行为；本轮不实现远端删除。
- 所有`void asyncCommand()`入口有统一错误捕获。
- View卸载后不得set state、发I/O或保留订阅。

### 7.9 删除旧状态路径

按feature迁移完成即删除：

- 页面级重复workspace invalidation订阅；
- 已无production引用的controller/hooks；
- 重复bridge event wrapper；
- 全局共享busy布尔值；
- native confirm；
- 全量资源`99999`请求；
- 只验证旧hook存在的架构测试。

## 8. 测试要求

- Deferred Promise：A→B客户、initial→refresh、unmount、旧command交错。
- 每个feature subscribe/dispose和invalidation去重。
- Platform submit/pause/stop 100轮交错。
- Media重复页、远端忽略page、1k/10k资源容量和IPC payload上限。
- Prepare reject、重复点击、cancel/confirm恰好一次。
- Modal focus、Tab、Shift+Tab、Escape和焦点恢复。
- Settings success/failure和Orders文案刷新。
- IPC未知channel/字段/status、未认证和敏感错误拒绝。
- Static search无业务native confirm、无renderer Node import、无旧controller production引用。

## 9. 完成条件

- 每个feature有单一snapshot owner，View只渲染和发命令。
- 所有initial/refresh/command结果使用同一request identity规则。
- 无跨客户stale state、永久busy或unhandled rejection。
- Workspace invalidation只有一个消费协调点。
- Media资源有界、分页可观察且无全量IPC绕过。
- 所有确认通过独立host，可访问性测试通过。
- Preload没有通用任意IPC能力，错误DTO安全。
- 被替代旧hooks/controller/订阅已删除。

## 10. 停止条件

- 为解决View状态需要向Domain/Application加入页面专用方法或状态。
- 新状态module只是转发旧bridge且View仍知道刷新顺序。
- 引入状态库但无法减少caller必须知道的interface。
- Renderer需要读取路径/数据库或原始错误。
- 分页上限会静默漏数据而无诊断。

## 11. 交接重点

列出feature modules、每个snapshot/command owner、typed IPC清单、invalidation映射、删除的旧hooks/订阅、容量基线和阶段7可使用的结构化diagnostic/error接口。

