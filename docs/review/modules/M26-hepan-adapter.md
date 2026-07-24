# M26 河畔 Node/Python adapter 深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；业务代码、配置、依赖和测试相对第一阶段基线无变化，工作区变化仅为 `docs/review/` 审查文档。

## 模块职责和边界

M26 将河畔队列中的 Markdown/TXT/DOCX 转为受限 HTML，通过 Node 创建临时 payload 并调用 Python；Python 加载 Cookie、检查发布/上传能力、可选上传封面、提交文章并返回安全 JSON outcome。设置层使用 safeStorage 配置的 Cookie 创建短期明文文件，worker 注入运行时后串行执行。模块还负责 Python/vendored pure-Python 依赖的开发态和打包态路径解析。

十项维度均已覆盖。文章源拒绝 symlink/超大/非法 UTF-8，Markdown 原始 HTML被转义，payload 具有大小、闭集字段和危险 HTML 校验；Python HTTP 只访问固定 HTTPS origin，错误 JSON 不回显 Cookie/正文。核心问题是远端传输异常被错误降为可重试失败、正式 ASAR 包的脚本路径未指向 unpacked 文件，以及强杀/崩溃会留下明文 Cookie/正文临时文件。

## 已检查的目录与关键文件

- 全部 M26 自有生产文件：`auto—publish/src/platforms/hepan/{adapter,article-source,runtime-paths}.js`、`src/platforms/hepan/hepan_publish.py`。
- 设置/worker 调用方：`desktop/services/platform-settings/hepan-settings-adapter.js`、`desktop/services/desktop-task-service.js`、`desktop/worker/run-task.js`、`desktop/services/platform-workbench-service.js`。
- 打包边界：`resources/hepan/requirements.txt`、`electron-builder.{alpha,production}.yml`、`scripts/verify-alpha-package.js`、`tests/production-packaging.test.js`。
- publication/归档契约：`src/publication/publication-state.js`、M22/M24 直接调用路径。
- 相关测试：`hepan-{article-source,python-payload-runtime,publish-contract,login-check,provider-settings,publish-interval,settings-patch-contract}.test.js`、`production-packaging.test.js`、`adapter-workspace-injection.test.js`、worker/IPC/archive tests。
- `resources/hepan/vendor-pure/` 为第三方 vendored 源码，按范围约束不逐文件深审；已检查 8 个 dist-info 版本、161 个跟踪文件、requirements 对齐和打包 include/exclude 边界。

## 关键调用链

1. 设置保存 → safeStorage 配置 → `createTemporaryCookie` 写本地 runtime temp → main 将路径传给 worker。
2. worker `setRuntimeConfig` → platform workbench `markSubmitting/remote-started` → adapter parse article/create payload → `spawnSync(python, hepan_publish.py, ...)`。
3. Python `read_payload/read_docx_article` → `load_cookie` → capability page/formhash/upload context → 可选 `upload_image` → `publish_article` → JSON stdout。
4. Node `parseJsonOutput` → publication outcome → ledger/batch/archive；`failed` 允许产生新 attempt，`uncertain` 才阻止盲重试。
5. 正常 `finally` 删除 payload，main task `finally` 删除 Cookie；进程级强杀不会执行这些回调。

## 发现列表

## TEMP-M26-01：河畔 POST 的超时/连接异常被记为 failed，允许盲重试并可能重复发布

- 分类：错误处理 / 远端不确定性 / 幂等性
- 所属模块：M26 河畔 Node/Python adapter
- 严重程度：高
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/src/platforms/hepan/hepan_publish.py:303-321` `publish_article`；`:725-730` `main`；`src/platforms/hepan/adapter.js:95-111` `runHepan`；`:229-244` `publishArticle`；`src/publication/publication-state.js:56-61`
- 问题描述：文章 POST 已经开始后，`requests.Timeout`、连接断开等 `RequestException` 无法证明服务器是否已提交文章。Python 把这些异常统一输出为 `HEPAN_REMOTE_REQUEST_FAILED`；Node 因先匹配任意 `HEPAN_*` errorCode，直接返回 `status:"failed"`，绕过其 `remoteCallStarted` 的 `uncertain` 保护。ledger 的 `failed` 明确允许重新 reserve。
- 代码证据：Python 顶层仅按 `isinstance(exc, requests.RequestException)` 输出失败码，没有区分请求是否已发送/响应是否完整；Node `payload.errorCode` 分支位于 `!payload.ok` 和 catch 之前；publication state 的 `canReserveAgain` 对 `failed` 返回 true。
- 触发条件：河畔文章 POST 已到达服务器或服务器已提交，但客户端在读取响应时超时、连接重置、TLS/代理链中断；操作员随后按“失败”重试。
- 可达路径或调用链：worker `markSubmitting` → Python `requests.post` → 远端可能提交 → response 读取异常 → `HEPAN_REMOTE_REQUEST_FAILED` → Node `failed` → ledger failed → 新 attempt → 第二次 POST。
- 实际影响：同一文章可能在河畔重复发布；本地记录会把第一次的潜在成功错误描述为确定失败，无法通过 `uncertain/reconcile` 流程安全核对。
- 影响范围：所有河畔文章 POST 的传输异常；180 秒 requests timeout、240 秒 Node timeout和现场网络波动均可能触发。
- 现有测试是否覆盖：测试覆盖了这一路径，但断言了错误行为：`hepan-publish-contract.test.js:117-149` 期望 `HEPAN_REMOTE_REQUEST_FAILED` 映射为 `failed`，因此测试通过不能证明业务语义正确。
- 验证方法与结果：向真实 adapter 注入 Python runner 输出 `{ok:false,errorCode:"HEPAN_REMOTE_REQUEST_FAILED"}`，结果稳定为 `{status:"failed",errorCode:"HEPAN_REMOTE_REQUEST_FAILED"}`；退出码 0。联合测试 59/59 也复现现有契约。
- 修复方向：区分本地前置失败与远端调用后的模糊失败；文章 POST 一旦可能发出，timeout/connection/read/protocol 异常均持久化为 `uncertain`，并提供基于远端文章 ID/标题/时间的核对流程；更新现有测试为不可盲重试契约。
- 关联发现：TEMP-M24-02、TEMP-M22-01。

## TEMP-M26-02：正式 ASAR 包解析到 app.asar 内的 Python 路径，外部 Python 无法执行已解包脚本

- 分类：构建与部署 / 运行时依赖 / 正确性
- 所属模块：M26 河畔 Node/Python adapter
- 严重程度：高
- 置信度：高
- 验证状态：部分验证
- 位置：`auto—publish/src/platforms/hepan/runtime-paths.js:16-36`；`src/platforms/hepan/adapter.js:50-52,77-78,102`；`electron-builder.production.yml:8-12`；`tests/production-packaging.test.js:16-19`
- 问题描述：production 开启 ASAR 并把 `hepan_publish.py` 解包到 `app.asar.unpacked`，但 `resolveHepanScriptPath` 仍无条件返回 `path.join(__dirname,"hepan_publish.py")`。打包后 adapter 的 `__dirname` 位于 `.../app.asar/src/platforms/hepan`，该伪路径只对 Electron/Node 的 ASAR 文件 API有意义；作为参数传给外部 Python 时不会自动改写到 `app.asar.unpacked`。vendor resolver 已显式处理 `app.asar.unpacked`，脚本 resolver 没有对应逻辑。
- 代码证据：production `asarUnpack` 明确列出脚本；script resolver 不读取 `process.resourcesPath`/packaged 状态，而 vendor resolver 在同文件 `:23-27` 正确尝试 unpacked 路径。packaging 测试只正则匹配配置中出现脚本名，没有执行最终路径。
- 触发条件：使用 `electron-builder.production.yml` 生成并启动正式 ASAR 包，执行河畔 payload self-test、登录测试或投稿。
- 可达路径或调用链：packaged adapter `__dirname=...app.asar/...` → `scriptPath()` → `spawnSync(python,[...app.asar/.../hepan_publish.py])` → Python 文件不存在/无法打开 → 河畔配置测试或投稿失败。
- 实际影响：正式包中的河畔功能可能整体不可用；alpha 的 `asar:false` 不触发，因此开发态和 alpha 测试会继续通过。
- 影响范围：所有正式 ASAR 制品中的河畔设置测试、登录检查、payload 验证和投稿；其他平台不受该脚本路径影响。
- 现有测试是否覆盖：未覆盖最终解析路径。`production-packaging.test.js` 只检查 YAML 文本；alpha package verifier 运行在非 ASAR边界。
- 验证方法与结果：使用项目已安装的 `@electron/asar` 创建最小 ASAR并将 `.py` 解包；`app.asar.unpacked/...py` 存在，而 `python app.asar/...py` 退出码 2且不能执行，最小复现命令整体退出码 0。未生成需要签名凭据的完整 production 安装包，故标记部分验证。
- 修复方向：packaged 模式下从 `process.resourcesPath/app.asar.unpacked/src/platforms/hepan/hepan_publish.py` 解析并用 `lstat` 验证普通文件；让 settings adapter 与 publish adapter 共用同一 resolver；增加从真实 `electron-builder --dir` 输出启动 Python `--help/--validate-payload` 的打包集成测试。
- 关联发现：M30 构建/打包审查中的 ASAR 与运行时资产专题。

## TEMP-M26-03：进程强杀或清理失败会留下可读的明文 Cookie 与文章 payload

- 分类：安全性 / 敏感数据生命周期 / 资源清理
- 所属模块：M26 河畔 Node/Python adapter
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/desktop/services/platform-settings/hepan-settings-adapter.js:233-246` `withTemporaryCookie`；`:249-273` `createTemporaryCookie`；`src/platforms/hepan/adapter.js:114-140` `createTemporaryPayload`；`:213-247` `publishArticle`；`desktop/services/desktop-task-service.js:157-182,244-246`
- 问题描述：加密存储的河畔 Cookie在任务前被写成明文临时文件，Markdown/TXT 正文也写成明文 JSON；删除只依赖当前进程的 `finally/cleanup`，而删除错误被完全吞掉。没有启动期按严格文件名/所有者/年龄扫描残留，也没有 durable cleanup 记录。worker 被 watchdog/崩溃强杀时 payload `finally` 不运行；主进程崩溃时 Cookie cleanup 不运行。
- 代码证据：两个 cleanup 都是 `existsSync/unlinkSync` 包裹空 catch；临时文件没有 close-on-exec/删除句柄语义。全仓搜索只有创建、正常 cleanup和打包排除规则，没有应用启动恢复。
- 触发条件：payload 创建后 worker 被 M24 watchdog 强杀或异常退出；临时 Cookie 创建后 Electron 崩溃/断电；或 Windows 锁文件/杀毒软件使 `unlinkSync` 失败。
- 可达路径或调用链：safeStorage 解密 Cookie → main 写 `.hepan-cookie-*.tmp` → fork worker；worker 写 `.hepan-payload-*.json` → 同步 Python/远端调用 → 进程终止 → finally 未执行/错误被吞 → 文件长期驻留本地状态目录。
- 实际影响：河畔会话凭据和待投稿正文可被同用户进程、备份、诊断采集或后续本地访问读取；Cookie 可用于冒用远端账号直到失效。
- 影响范围：异常终止时正在执行的河畔任务；每次强杀可遗留一个 payload，主进程崩溃可同时遗留一个 Cookie。
- 现有测试是否覆盖：现有 provider/publish tests 只验证正常返回或 runner 抛错时 `finally` 删除；没有独立进程强杀、unlink 失败、启动恢复或 Windows ACL 断言。
- 验证方法与结果：两个独立 child-process 最小复现分别在 Cookie 创建后退出 74、在 payload 创建后退出 73；父进程确认各残留 1 个文件，Cookie 内容仍可读且等于原值，命令退出码均为 0；验证目录随后已删除。
- 修复方向：使用权限已验证的应用本地私有目录并显式核对 Windows ACL；启动和任务前仅按严格命名/普通文件/目录边界/年龄安全清理；cleanup 失败需形成安全诊断；可行时用 stdin/匿名 pipe 传 payload/Cookie，减少落盘。强杀路径应与 M24 的 recovery lifecycle 联合测试。
- 关联发现：TEMP-M24-02。

## 测试与依赖情况

- 定向联合命令：`node --test tests/platform-browser-session-lifecycle.test.js tests/platform-archive-worker-boundary.test.js tests/hepan-python-payload-runtime.test.js tests/hepan-publish-contract.test.js tests/hepan-login-check.test.js tests/hepan-article-source.test.js tests/hepan-provider-settings.test.js tests/hepan-publish-interval.test.js tests/hepan-settings-patch-contract.test.js tests/production-packaging.test.js tests/adapter-workspace-injection.test.js tests/platform-workbench-service.test.js tests/platform-ipc-boundary.test.js tests/legacy-submission-path-audit.test.js tests/runtime-publication-wiring.test.js`：59/59 通过，退出码 0，约 3.4 秒。
- 当前运行时：Python 3.13.14、Node 24.16.0、npm 11.13.0。真实 Python payload、symlink 拒绝、UTF-8/大小/HTML安全和登录 DOM fixture 均通过。
- requirements 与 vendored dist-info 完全一致：beautifulsoup4 4.15.0、certifi 2026.6.17、charset-normalizer 3.4.9、idna 3.18、requests 2.34.2、soupsieve 2.9、typing-extensions 4.16.0、urllib3 2.7.0；未安装或升级依赖。
- Python 使用 `dict[str,...]`、`X | None`，声明 3.10+；本地 3.13通过。仓库没有可在当前环境同时执行 3.10/3.11/3.12 的解释器矩阵，其他版本仅由语法/依赖声明支持，未现场运行。

## 未覆盖区域与现场不可验证项

- 未向 `www.hepan.com` 发出请求，不验证真实 Cookie、分类权限、上传 token、响应 HTML或限流行为。
- 未生成需要真实签名证书的完整 production installer；ASAR finding 通过最小等价 archive验证，最终制品仍需发布环境确认。
- `vendor-pure` 第三方源码按第一阶段范围排除逐文件深审；未做 CVE/许可证在线查询，只确认锁定版本、元数据和打包闭包一致。
- 未现场验证 Windows local-state ACL、杀毒软件锁文件、断电时机和 Python 子孙进程终止语义。
- 封面图片只按扩展名/存在性选择，未拒绝 symlink、未限制大小/MIME；当前 Windows 环境创建文件 symlink 因权限 1314失败，故保留为待验证输入边界，没有升级为有效 finding。
- 图片先上传、文章后发布，后段失败可能留下远端孤立图片；远端是否提供删除/复用 API未知，作为剩余不确定性记录，不虚构已确认缺陷。

## 模块审查结论

M26 已完成全部自有生产代码、直接调用链、requirements 和打包边界的代码级深审，第三方 vendor 排除范围已明确。共 3 条候选发现（高 2、中 1）：最优先的是把 POST 传输异常保持为 `uncertain`，以及修正正式 ASAR 包的 Python script resolver。模块达到深审完成门槛，但在修复设计前仍需用真实 production 制品验证脚本启动，并在隔离测试账号上验证远端核对语义。
