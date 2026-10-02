# AutoPublish 工作约定

适用于整个仓库，统一维护本文件，不再分设子目录 AGENTS。默认中文沟通；从 [README](README.md) 选择主题，只读本次任务的直接源码、调用方、测试和合同。

## 修改与验证

- 修改前核对 Git、实现、schema、测试和产品说明；代码证明实际行为，产品说明表达应有行为，冲突先查已确认决策，不恢复已否定路线。
- 最小完整修复，复用已有能力，不顺手重构；兼容路径须有真实消费者。业务事实只有一个 owner，不在 UI、IPC、adapter 或缓存增加 writer；边界见 [架构](docs/architecture.md)。
- 外部操作区分未发送、明确失败、明确成功和结果不确定；不确定结果不自动重发。持久意图先于副作用，处理并发、重试、崩溃恢复；cleanup 失败不覆盖业务错误。使用稳定错误码和安全摘要，不泄漏敏感数据。
- 主进程保持 CommonJS，renderer 通过受控 preload/typed bridge 访问 Electron。子进程优先 executable + argv + env，外部输入不拼 shell；SQLite schema 只走正式 migration。
- 按 [开发说明](docs/development.md) 选择定向测试和必要集成；业务测试验证公开行为与持久事实，静态检查仅用于安全、依赖和构建合同。
- 实现 → 主审 → 修阻塞项 → 有限复审 → 完成。复审只查 finding、diff、受影响不变量和直接调用方；公开合同、schema、owner 或副作用边界变化才扩大范围。P0/P1 阻塞；P2 仅在影响当前正确性、一致性、幂等、安全或公开合同时阻塞，其余记录 owner。
- 完成绑定最终代码和实际验证，如实报告未验事项；源码变化后重验受影响部分。普通实现选择和范围内问题自行解决，仅实质产品歧义、不可逆数据风险、必要凭据/环境缺失或 owner 不明且继续有风险时暂停受影响部分。

## 数据与操作

- 保留已有未提交和未跟踪内容；不用破坏性 reset/checkout、git clean、git add . 或 force-add ignored 文件。未经本次授权不提交、推送、合并或发布。
- 不手改构建产物、日志、缓存、依赖、运行内容库或应用配置；生成物和运行数据默认不提交。自动化用合成数据、临时库和假 transport；真实模型、登录、上传、发布、付费、取消、服务器/TLS、部署、备份恢复和生产迁移须有本次明确授权与停止条件，历史记录不携带授权。
- 应用的 work、logs、failed、release-*、.playwright-cli、build、dist 属于运行数据或生成物；resources/content-templates 和 src/content/default-final-knowledge-prompt.md 是程序资产，不能当普通文档删除。

## 文档与文件存放

应用路径相对 `auto—publish/`，文档路径相对仓库根目录。

| 内容 | 存放位置 |
| --- | --- |
| 总导航、长期规则 | 根 README、本 AGENTS；不另建 AI-ENTRY、工作索引或归档总索引 |
| 当前产品行为 | docs/product，按知识与生成、投稿领域维护 |
| 架构、开发、运维、扩展 | docs 下对应主题文件；其他位置链接引用，不复制正文 |
| 未完成、阻塞、明确延期事项及下一步 | docs/work.md |
| 复杂活跃计划 | docs/plans/<主题>.md，一事一份；局部修改不建计划、审计或交接文件 |
| 一次性脚本、探针、截图、日志 | 应用 build/test-results/<任务名>/；不散落根目录、源码或新增 .scratch 任务树 |
| 本地验收证据 | 应用 build/evidence/<任务名>/，记录 source state、命令和结果；保留未验收任务的唯一证据 |
| 可复用工具、合成夹具 | 应用 scripts、tests/fixtures；运行模板和提示词留既有 owner，均须有明确消费者 |

- 长期文档直接更新正文，不堆日期补丁、阶段日报、测试数量、旧授权或 final/v2 副本；子项目 README 只写局部差异。
- 收尾把稳定结论归回主题、剩余事项归回 work，再删除已提交且无消费者的过程文件和一次性工具，修复链接、移除空目录。历史由 Git 承担，不建 archive/legacy/completed 堆积资料。
- 临时输出默认忽略且不提交，新目录配置精确忽略规则；长期保留最小合成证据须说明目的和消费者，不提交整个 build 或日志集合。
- 获授权清理后，先区分跟踪、未提交、未跟踪和 ignored 文件，核对字面引用、构造路径及读取逻辑；ignored 不等于无用，Markdown 也可能是程序资产，不按扩展名或目录名批量删。
- 客户资料、供应商原始响应、凭据、浏览器会话、备份及恢复记录默认保留；用途不明则报告位置与原因。删除/移动须验证绝对路径位于授权工作区，不跟随 junction/symlink；优先明确文件列表，目录须逐项分类且无活跃占用或保留资产。收尾报告清理类别、保留原因与检查结果。

## 仅适用于鉴权服务

- 修改 `auto—publish/auth-server/` 时先读其 [README](auto—publish/auth-server/README.md) 相关小节，再读直接相关的 package.json、源码、migration 和测试；只有代理源问题才读其 docs/proxy-source-manual-acceptance.md，不顺带读取桌面业务文档。
- 服务只拥有认证、session、entitlement 和最小审计事实；不接收客户内容、文章、模板、队列、Cookie 或桌面 workspace 路径。数据模型以本服务 migration、schema 源码和行为测试为准，不从桌面业务推导。
- 测试使用合成凭据和隔离数据库，不手改运行数据库、生产数据或部署文件；日志不得含密码、token、Cookie、数据库行、原始请求头或敏感路径。
- 从服务目录运行 `node --test tests/*.test.js` 或对应定向测试，不借用桌面测试结论。
