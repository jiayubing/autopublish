# 阶段4：平台运行期与Publisher Adapters

## 1. 阶段目标

重构平台执行生命周期和所有publisher adapter，使一个run拥有完整不可变上下文，每个平台只负责外部协议和证据采集。完成后新增平台不需要修改PublicationWorkflow，stop/watchdog/旧消息不会污染新run，模糊远端结果统一为`uncertain`。

关联工作：OPT-004、005、006、007、008、011、029；覆盖F-H03、F-H06、F-H08～H11、F-M16～M18。

## 2. 开始条件

- 阶段3为`COMPLETE`。
- PublicationWorkflow、Publisher interface和OperationalStore production切换完成。
- 阶段3交接列出每个平台证据缺口和当前contract fixture。
- 平台账号档案已进入target identity。

## 3. 必读输入

- 总纲、目标架构、协议、进度账本和阶段3交接。
- M08、M11、M12、M24、M25、M26、M27、M30 module报告。
- 当前desktop task/run、worker protocol、jobs、Playwright runtime、platform loader及四个平台implementation。
- OPT-004～008、011、029及风险决策文档。

## 4. 允许修改

- PlatformRun、worker protocol、publisher registry和平台adapter implementation。
- Playwright/runtime path、安全诊断和临时工件生命周期。
- 平台账号探测与本地account profile配置。
- 平台contract/fixture/fake server/worker/package测试。
- 为fail-closed需要的设置校验；不重构Renderer页面结构。

## 5. 禁止修改

- PublicationWorkflow外部interface和OperationalStore权威关系。
- 在adapter中重新引入ledger/batch/archive/attention访问。
- 使用生产账号、真实稿件或付费接口自动验收。
- 为兼容弱成功判断继续返回无证据`published`。
- 把原始DOM、Cookie、正文或整页截图写入诊断。

## 6. 实施步骤

### 6.1 建立PlatformRun深module

一个run context必须不可变持有：

- runId、publisher/account/target；
- child与消息channel；
- start time、heartbeat、watchdog；
- AbortController、stop reason；
- cleanup registry；
- phase和terminal result。

状态至少为`starting/running/stopping/terminal`。只有自己的terminal transition可以释放start gate；旧callback/finally不能清理新run。

外部interface保持小，例如`start(command)`、`stop(runId)`、`snapshot()`；pause若属于batch领取策略，不混进child生命周期。

### 6.2 重写worker协议

- 所有message携带schemaVersion、runId和闭集type。
- Worker只执行Publisher调用并返回outcome/heartbeat/progress。
- Main拒绝旧run、未知type、超大payload和敏感字段。
- Watchdog知道是否已进入remote-started；终止前由PublicationWorkflow保持durable intent。
- Stop是幂等请求，remote-started后直到child终结都不允许第二run。

### 6.3 头条adapter

- 账号探测返回稳定本地account profile和可脱敏remote fingerprint。
- 成功证据必须来自与当前文章绑定的response、remote ID、详情URL或同一内容节点。
- 跨行标题+状态、同名稿、无关toast、通用成功文案均不能`published`。
- 使用脱敏DOM/response fixture建立正负contract tests。
- 没有获批测试账号时，production启用保持人工验证门；本地implementation仍可完成。

### 6.4 列举adapter

- 移除整页通用success substring谓词。
- 优先解析当前请求响应或文章详情证据。
- 无文章级证据返回`uncertain`。
- 覆盖无关成功提示、同名内容和页面延迟。

### 6.5 河畔adapter

- 用异步child替代`spawnSync`，heartbeat和abort不被240秒阻塞。
- Python outcome包含stage、requestMayHaveBeenSent和安全错误code。
- POST前明确失败可`failed`；POST可能发送后的timeout/断连/protocol错误为`uncertain`。
- Cookie/payload使用最小权限临时目录、精确owner和启动残留清理。
- Production resolver只返回`app.asar.unpacked`中可执行的普通脚本文件。
- Fake HTTP server覆盖接收后断连、慢响应、HTTP拒绝和非法JSON。

### 6.6 媒体adapter

- endpoint必须显式配置，不保留隐式公网HTTP默认值。
- HTTPS无需额外确认；服务商当前仅提供HTTP时，必须由操作者显式勾选`allowInsecure`，未确认则在发送body前拒绝。
- HTTP状态必须持续显示“不加密连接”风险；媒体请求不自动跟随重定向，不允许从HTTPS静默降级；该例外仅适用于媒体provider。
- Production媒体发布只能由main进程通过platform settings解析完整config并构造client；旧worker `publishArticle -> createMediaAdapter()`空参路径必须退出production，不得为修复它而把API key发进worker message。
- 无production caller的旧`media/preflight.js`非dry-run和standalone空参client路径应删除或明确退出production，不能依赖隐式endpoint复活。
- Target使用media resource identity，outcome包含remote order evidence。
- 价格变化、资源下架、重复idempotency和超时结果明确分类。
- TLS、证书错误和fake server测试不使用真实API key。

### 6.7 安全诊断

- 默认只保存结构化诊断摘要和diagnosticId。
- 原始整页截图路径删除；确有需求时只能保存固定安全区域、遮罩后图像和短TTL，并由人工决策另行启用。
- DTO、日志、fixture和临时文件扫描不得含Cookie、API key、正文、账号名称或绝对路径。
- Cleanup归PlatformRun owner，正常、失败、stop、watchdog和启动恢复均覆盖。

### 6.8 删除旧运行路径

删除或退出production：

- 共享可变`activePlatformRunId`式状态；
- 旧jobs对ledger/archive的协调；
- 同步Hepan运行；
- 弱页面成功谓词；
- 原始截图；
- 返回`app.asar/...py`伪路径的resolver；
- 平台粒度、无账号的普通target构造。
- 媒体worker空参publisher和无caller的非dry-run preflight网络路径。

## 7. 测试要求

- PlatformRun快速start/stop、旧消息、旧finally、watchdog、cleanup恰好一次。
- 100轮stop-start交错和短真实child强杀。
- 每个平台Publisher contract及脱敏fixture正负测试。
- Hepan fake server、异步child、打包脚本self-test。
- Media显式HTTP确认/拒绝、3xx不跟随、HTTPS/TLS错误、main-process runtime config caller、remote ID和resource target测试。
- 账号切换：旧队列明确阻断，不静默改target。
- 敏感信息静态/像素/文件扫描。
- `electron-builder --dir`最终制品worker/Playwright/Python smoke。

## 8. 完成条件

- PlatformRun是唯一run lifecycle owner，旧run无法污染新run。
- Stop后child终结前第二start明确拒绝。
- 所有publisher只返回证据化outcome；弱证据全部`uncertain`。
- 换号后旧队列阻断，target记录accountProfileId。
- Hepan异步、可abort、heartbeat不阻塞，脚本在最终制品执行。
- Media无隐式公网HTTP默认值；HTTP只有在显式配置并确认风险后可用，未确认时不发送body。
- 无原始诊断截图和异常退出秘密残留。
- 新增fake publisher无需修改PublicationWorkflow即可通过contract suite。

## 9. 停止条件

- 必须用生产账号/付费投稿才能证明基本正确性。
- 平台无法获取文章级证据且implementation仍试图返回`published`。
- Publisher需要访问OperationalStore才能工作。
- Stop/cleanup要求callback读取全局当前run。
- implementation尝试静默启用HTTP、跳过`allowInsecure`确认，或把媒体例外扩展到其他provider。
- Fixture无法脱敏。

## 10. 人工验收

本阶段可在无真实账号下完成代码和fixture验收，但以下项目必须保持“待人工”直到获授权：

- 头条/列举受控测试账号成功投稿及remote ID核对。
- 河畔测试账号断连后的远端核对。
- 媒体服务商HTTP endpoint的人工风险确认、测试资源投稿；服务商未来提供HTTPS后优先迁移验证。
- Production签名制品中的真实浏览器登录。

人工项未完成不允许正式release，但不阻止阶段5本地重构。

## 11. 交接重点

列出PlatformRun状态机、worker message schema、publisher registry、每个平台证据优先级、所有待人工项、禁用feature flags、package smoke结果和已删除旧运行路径。

