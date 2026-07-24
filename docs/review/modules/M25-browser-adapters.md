# M25 头条/列举与共享浏览器会话深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；业务代码、配置、依赖和测试相对第一阶段基线无变化，工作区变化仅为 `docs/review/` 审查文档。

## 模块职责和边界

M25 负责为头条和列举各自建立隔离的 Playwright daemon/profile/state，会话登录、表单填写、远端提交与结果确认；共享 lifecycle 统一 daemon 探测、启动、状态保存和关闭。它不拥有 publication 状态、队列归档或 worker 进程生命周期；adapter outcome 经 M24 `platform-workbench-service` 写入 M22 ledger，再决定本地归档。

适用的正确性、输入、错误处理、依赖、生命周期、安全、性能、可维护性和测试维度均已检查。两个平台均在点击远端按钮后把异常保守映射为 `uncertain`，平台之间也使用不同 session/profile/state 路径；主要缺口在于“published”证据没有稳定绑定到当前文章/远端记录，且 session 与 publication target 都没有绑定账号身份。

## 已检查的目录与关键文件

- 全部 M25 生产文件：`auto—publish/src/platforms/toutiao/adapter.js`、`src/platforms/lieju/adapter.js`、`src/platforms/shared/browser-session-lifecycle.js`。
- 直接运行依赖：`src/core/{playwright,operator-flow,stop-signal,files,logger}.js`、`scripts/config.js`。
- 上下游契约：`desktop/worker/run-task.js`、`desktop/services/{desktop-task-service,platform-workbench-service}.js`、`src/publication/{publication-targets,publication-state,publication-ledger}.js`。
- 相关测试：`platform-browser-session-lifecycle.test.js`、`platform-archive-worker-boundary.test.js`、`platform-workbench-service.test.js`、`platform-ipc-boundary.test.js`、`runtime-publication-wiring.test.js`。全仓搜索未发现直接执行头条/列举真实 adapter DOM、登录和结果判定的测试。
- 未纳入第三方 Playwright 实现和真实远端页面；这些属于外部系统，不是遗漏的自有生产文件。

## 关键调用链

1. worker 装载 adapter → `ensureSession` → shared lifecycle `isAlive/ensureStarted` → 平台专属 daemon/profile。
2. `ensureLoggedIn` → load state → 平台页面登录探测 → 必要时等待人工登录 → save state。
3. `platform-workbench-service` 先 `ledger.markSubmitting` 并发出 `remote-started` → adapter 填表/点击 → 返回 `published/uncertain/failed`。
4. outcome → `ledger.recordOutcome` → submission batch；仅 `published` 进入本地归档流程。
5. worker `finally` → adapter `closeSession` → save state → Playwright close；worker 被强杀时的 heartbeat/ledger 后果已归 M24，本报告不重复建立根因 finding。

## 发现列表

## TEMP-M25-01：头条列表核验可把不同文章行的标题与状态拼成“已发布”证据

- 分类：正确性 / 远端结果协议 / 数据一致性
- 所属模块：M25 头条/列举与共享浏览器会话
- 严重程度：高
- 置信度：高
- 验证状态：部分验证
- 位置：`auto—publish/src/platforms/toutiao/adapter.js:255-266` `articleListShowsPublished`；`:269-284` `verifyPublishFromArticleList`；`:342-352` `publishArticle`
- 问题描述：头条的后备核验读取整个文章列表页的 `document.body.innerText`，只分别判断“页面任意位置包含当前标题”和“页面任意位置包含已发布/已推送/审核中之一”，没有把二者约束在同一列表行，也没有核对远端文章 ID、详情 URL或提交时间。页面中一个同名旧稿/草稿加另一篇文章的状态即可被判为当前提交已发布。
- 代码证据：`articleListShowsPublished` 先执行 `text.indexOf(title)`，随后对全局 `text` 执行三个独立 `indexOf`；`verifyPublishFromArticleList` 成功后直接返回 `{status:"published"}`。上游没有二次远端核验。
- 触发条件：自动提交后的 URL 核验未在 10 秒内成功，列表页存在目标标题（例如同名旧文章或当前草稿），同时页面任意其他文章显示“已发布”“已推送”或“审核中”。
- 可达路径或调用链：平台 worker → `markSubmitting` → 头条点击发布 → URL 核验超时 → 跳转文章列表 → 全页文本谓词命中 → `published` → ledger/batch → 本地归档。
- 实际影响：没有证明本次投稿成功时仍会固化 `published`，阻止安全重试并可能归档本地队列；运营人员看到的发布事实与远端真实状态不一致。
- 影响范围：使用头条自动提交、且进入列表后备核验的任务；同名标题和列表混合状态会显著提高触发概率。
- 现有测试是否覆盖：未覆盖。没有直接加载头条 adapter 或验证列表行绑定的测试；现有 worker 测试只注入预制 outcome。
- 验证方法与结果：用与源码相同的两个独立全局谓词构造 `目标标题/草稿` 与 `另一篇文章/已发布` 的页面文本，结果为 `true`；命令退出码 0。未连接真实头条，故远端 DOM 形态和出现频率仍待现场验证。
- 修复方向：只接受与当前标题绑定的单行/详情节点，并优先取得远端文章 ID 或详情 URL；无法建立文章级证据时返回 `uncertain`，不要使用全页独立关键词拼接成功事实；为同名行、跨行状态和空/延迟列表增加 adapter 级测试。
- 关联发现：TEMP-M25-02、TEMP-M24-03。

## TEMP-M25-02：列举把页面任意通用成功词当作本次投稿成功

- 分类：正确性 / 远端结果协议
- 所属模块：M25 头条/列举与共享浏览器会话
- 严重程度：中
- 置信度：中
- 验证状态：部分验证
- 位置：`auto—publish/src/platforms/lieju/adapter.js:16-17` `PUBLISH_SUCCESS_WORDS`；`:146-179` `isPublishSuccessPage/waitForPublishSuccess`；`:247-259` `publishArticle`
- 问题描述：列举在未命中宽泛详情 URL/页面结构时，只要整个 accessibility snapshot 出现“发布成功”“提交成功”“操作成功”或英文 `success` 任一子串，就把当前任务标为 `published`。谓词没有要求提示来自投稿响应、没有绑定标题/远端 ID，也不排除城市切换、导航提示或页面其他内容的成功文本。
- 代码证据：`waitForPublishSuccess` 对完整 `snapshot` 循环执行不区分来源/上下文的 `indexOf`，命中即返回 true；随后 `publishArticle` 直接返回 `published`。
- 触发条件：点击投稿后 25 秒轮询期间，页面 snapshot 中残留或出现与本次投稿无关的任一通用成功词，而真正投稿被校验拒绝、仍处理中或结果未知。
- 可达路径或调用链：worker → 列举表单/城市切换 → 点击 `#sub` → snapshot 通用词命中 → `published` → ledger/batch → 归档。
- 实际影响：可能把失败或未知的远端操作固化为发布成功，造成错误归档和重复保护误阻断。
- 影响范围：列举自动投稿任务，尤其页面同时显示其他操作反馈或英文 `success` 文案时。
- 现有测试是否覆盖：未覆盖。没有列举 adapter 结果判定测试，也没有负向 snapshot fixture。
- 验证方法与结果：用源码相同词表对“城市切换操作成功，投稿表单仍在当前页面”执行谓词，稳定返回 true；退出码 0。真实列举页面是否会保留这类文本未现场验证，因此置信度和严重程度低于 TEMP-M25-01。
- 修复方向：以投稿响应后生成的文章 ID/详情 URL、与标题绑定的确认节点或平台明确响应码为成功证据；通用 toast 只能作为辅助信号，缺少文章级证据时返回 `uncertain`；增加成功、校验失败、无关 toast 和超时 fixture。
- 关联发现：TEMP-M25-01、TEMP-M24-03。

## TEMP-M25-03：浏览器 session 和 publication target 均未绑定账号，换号后队列可投到错误账号

- 分类：身份边界 / 正确性 / 重复发布保护
- 所属模块：M25 头条/列举与共享浏览器会话
- 严重程度：中
- 置信度：中
- 验证状态：部分验证
- 位置：`auto—publish/src/platforms/toutiao/adapter.js:15,63-79,117-140,434-446`；`src/platforms/lieju/adapter.js:13,41-67,272-307`；`src/core/playwright.js:36-56` `pwSessionConfig`；`src/publication/publication-targets.js:33-51`
- 问题描述：两个 adapter 使用固定的 `toutiao`/`lieju` session/profile/state，登录检查只证明“某账号已登录”（头条仅看 `/profile_v4/`，列举仅看退出链接），从不提取或持久化账号身份。ledger 目标也只有 `platform:toutiao`/`platform:lieju`。队列建立后若用户退出并登录另一账号，执行器无法发现账号变化。
- 代码证据：adapter 没有 account ID/display name 读取或 expected-account 参数；`publicationTarget` 明确是 platform 粒度；`resolvePublicationTarget` 的 `targetKey` 不含账号维度。shared lifecycle 只按固定 session 文件保存/恢复状态。
- 触发条件：队列入队与实际提交之间，浏览器 session 被重新登录到另一头条/列举账号，或共享本机/内容库被另一操作员使用同一平台 session。
- 可达路径或调用链：文章入队（目标仅平台）→ session 账号变化 → `ensureLoggedIn` 仍通过 → 填表/提交到当前账号 → ledger 仍记录原 `platform:<id>` 目标。
- 实际影响：文章可能发布到错误的外部账号；之后 ledger 同时会阻止对预期账号重试。当前界面/记录无法证明是哪一账号执行了发布。
- 影响范围：存在账号切换、多人共用或多品牌账号运营的头条/列举部署；若产品现场严格保证每平台永久单账号，风险显著降低。
- 现有测试是否覆盖：未覆盖账号身份；只覆盖平台 session 路径隔离和 lifecycle 的正常 save/close。
- 验证方法与结果：静态搜索确认两个 adapter、publication target 和直接调用链均无账号身份字段或比较点；平台间 profile 隔离已由现有测试验证。未进行真实换号投稿，且仓库未声明是否支持多账号，故标记部分验证、置信度中。
- 修复方向：在保存/使用 session 时提取稳定账号 ID，并把队列预期账号与执行时账号比较；若多账号是正式能力，应把账号纳入发布目标和 profile 身份；若明确只支持单账号，也应在账号变化时阻断并要求重新确认。
- 关联发现：TEMP-M25-01、TEMP-M25-02。

## 测试情况

- 定向联合命令：`node --test tests/platform-browser-session-lifecycle.test.js tests/platform-archive-worker-boundary.test.js tests/hepan-python-payload-runtime.test.js tests/hepan-publish-contract.test.js tests/hepan-login-check.test.js tests/hepan-article-source.test.js tests/hepan-provider-settings.test.js tests/hepan-publish-interval.test.js tests/hepan-settings-patch-contract.test.js tests/production-packaging.test.js tests/adapter-workspace-injection.test.js tests/platform-workbench-service.test.js tests/platform-ipc-boundary.test.js tests/legacy-submission-path-audit.test.js tests/runtime-publication-wiring.test.js`：59/59 通过，退出码 0，约 3.4 秒。
- M25 直接相关的 shared lifecycle 正常路径 1/1 通过；worker/archive/IPC 契约通过。
- 远端成功谓词最小复现退出码 0，确认头条跨行证据和列举无关成功词均可命中。
- 默认 `npm test`/CI 是否执行上述每个文件由 M31 汇总；本模块没有运行全量 suite。

## 未覆盖区域与现场不可验证项

- 未登录或提交到真实头条、列举，避免外部副作用；当前 DOM selector、验证码/风控、跳转 URL、toast 生命周期和详情页结构待现场验证。
- 未验证现场是否只允许每平台单一账号，也未取得账号切换操作规范。
- 未做 Windows 强杀 Playwright daemon、profile/state ACL 或浏览器升级压力测试；强杀与 watchdog 根因由 M12/M24 记录。
- 没有平台提供的测试环境、响应录制或脱敏 DOM fixture，因此三条发现中的远端出现频率不能量化。

## 模块审查结论

M25 已阅读全部自有生产文件、直接契约与相关测试，达到代码级深审完成门槛。平台间 session 隔离和远端异常后的 `uncertain` 基本正确，但“published”证据仍可由页面级弱信号误构造，且账号身份未进入执行契约。共 3 条候选发现，最高为高；真实页面行为和单/多账号产品约束仍须在进入修复设计前现场确认。
