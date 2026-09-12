# 后续性能优化与验证

基线：`8e270ece`（上一轮修复已由用户提交）。本轮只修改本地工作树，不 commit/push，不执行真实外部操作。日期 2026-09-12，Windows / Node v24.16.0。

## 实现与边界

### 发布档案摘要/详情

- 原 publication success/archives owner 保留完整证据查询与校验；新增窄摘要查询，在 SQLite 中 `json_remove(e.evidence_json, '$.body')`，不把正文带回 JavaScript 再删除。无需 schema migration。
- 摘要 parser 与完整 parser 共用身份、时间、目标、定位信息和安全字段规则，摘要不包含 body；完整 parser 始终校验正文/指纹，不能用 summary 选项绕过。摘要没有成为写入发布事实的有效 DTO。
- management 和 IPC 列表使用摘要；新增 `content:get-published-article-archives`，按 client/article 复核身份，只读单篇完整 archive。跨客户结果拒绝，不泄漏正文。
- 发布详情显示摘要里的状态与时间；打开时异步读取完整正文，提供加载、失败重试。关闭/切换后丢弃迟到结果；档案缺失作为读取失败，不伪装成历史正文不可得。
- 历史 contentAvailable=false 仍保持 unavailable；全文与不可变发布记录没有删除、重写或迁移。

### 搜索响应性与摘要列表

- ArticleStore 将原稳定列表单篇读取提取为同 owner 的内部函数；搜索不再先构造所有正文的数组，而是逐篇匹配并返回 ID。
- 搜索与生产摘要列表约每 8 ms 检查一次让出事件循环。单文件读取仍是同步 I/O，8 ms 是让出检查预算，不是任何磁盘状况下的硬性最大阻塞保证。
- management 按客户结束被新搜索替代的查询，保留 revision 前后校验、重读与错误语义。
- 同次批量读复用 path policy 已验证的目录链；每个文件前核对整条目录链的类型、符号链接、dev/ino，文件对仍检查版本与锁/journal，目录被替换则 fail closed。没有增加跨查询目录缓存或新的列表失效规则。
- 保留同步 listArticleSummaries 给身份恢复等既有消费者，生产 management 使用 async 入口；这是同一摘要读取实现的同步与分片调用形式，不是两个事实 owner。

### 媒体资源分页

- MediaResourceStore 现有文件版本缓存保存规范化、深度冻结的资源快照；相同版本/投影不重复整库 parse、clone、normalize。
- service 只对返回页深拷贝，调用方不能改动共享快照；文件替换、损坏和删除继续由版本检查观察。
- 无关键词分页的热路径不随全库记录数反复复制；关键词搜索仍线性检查资源文本，没有新增搜索缓存、数据库或通用缓存框架。

## 实测

合成数据，不是真实客户。时间受本机缓存/并发负载影响，不宣称跨机器 SLA。

真实 ArticleStore + SQLite、1000 篇/客户、每篇 4096 字节、每阶段三次非插桩计时中位值（`followup-cost.log`）：

| 客户状态 | 上轮首次 / 刷新 ms | 本轮首次 / 刷新 ms | 上轮 / 本轮返回字节 |
| --- | --- | --- | --- |
| 无发布历史 | 2300 / 893 | 975 / 224 | 2,596,291 / 2,596,291 |
| 失败历史 | 1714 / 950 | 1041 / 319 | 3,879,028 / 3,879,028 |
| 已发布历史 | 1960 / 1180 | 1178 / 428 | 10,155,776 / 6,053,882 |

已发布快照约减少 40.4%；首次仍读 1000 份摘要，保存一篇后的刷新读 1 份摘要。减少的是重复路径验证和发布正文载荷，未删除运行事实和历史证据字段。

独立事件循环/媒体探针（`followup-performance.cjs`、`followup-performance.jsonl`）：

| 场景 | 时间 | 定时器运行次数 | 最大采样间隔 |
| --- | --- | --- | --- |
| 1000 篇摘要首次读取 | 924 ms | 108 | 10.1 ms |
| 1000 篇摘要热读 | 173 ms | 20 | 9.1 ms |
| 1000 篇全文搜索 | 1939 ms | 210 | 11.6 ms |
| 10000 媒体资源，100 条/页 | 首次 11.8 ms；后续 30 次中位 0.089 ms | 不适用 | 不适用 |

这是 service 事件循环探针，不是 Electron UI 帧率或操作系统磁盘 I/O 基准。全文搜索总耗时没有承诺消失，但不再在一个连续同步循环中占用主进程近两秒。

## 复审与回归

一次 Primary Review，只针对四项优化及直接调用方；修复期间的有界复审检查以下不变量：

- 摘要不能送入完整 evidence writer；完整详情损坏正文后仍拒绝（实际修改合成数据库 evidence 后验证）。
- 摘要 SQL 返回的 evidence_json 不含 body（观察 SQLite 公共 statement 结果，不读源码证明）。
- 详情跨客户拒绝；旧不可得证据保持不可得；显示时间仍用历史发布事实。
- 搜索/摘要读取能让定时器运行；新搜索 abort 后拒绝旧结果；批间目录替换失败，不继续读新的目录。
- 资源同版本只投影一次；深冻结且调用方返回值隔离；替换、损坏、删除可见。
- 浏览器验证打开前无正文请求、打开后加载、失败重试、关闭后迟到响应丢弃；原搜索/编辑/投稿操作回归保留。

期间修复的直接回归：旧测试把全文 archive 送入列表合同，按摘要/详情分别验证；Renderer 静态渲染 fixture 补 hooks；类型 owner 清单和 preload IPC fixture 补新只读能力。没有降低完整 evidence 的安全校验来让测试通过。

验证命令（应用目录）：

- `node --test tests/renderer-history-editor-flow.test.js tests/article-lifecycle-ticket-22.test.js tests/article-summary-read-model.test.js tests/media-resource-read-cache.test.js`：40/40（有重叠，不累加为独立覆盖）。
- `node --test tests/article-management-snapshot-storage-cost.test.js`：2/2，100/1000 × 三种状态基准。
- `npm run test:packaging`：49/49；`npm run test:migration`：68/68；`npm run test:production-ipc-matrix`：6/6。
- lint、typecheck:main、typecheck:bridge、build:renderer（含 renderer typecheck）、build:preload、format:check 通过。
- 最终 `npm run test:desktop-core`：1760/1760，无 fail/skip/cancel/todo，退出码0，见 followup-desktop-final.log。
- `git diff --check` 通过；34份修改源码/测试的集合 SHA-256 为 `de4449c4586ed237b1528f9827071caa00d6251cc3e820b9c3380937369d49ef`，清单见 followup-source-state.json；完整测试后重新核对无变化。HEAD仍为 `8e270ece9e5ff4c8a5b9154b27c5619e6e711e9e`，没有虚构新提交或远端 CI 结果。

保留限制：OperationalStore 生命周期事实查询仍读取并验证完整成功 evidence 和部分运行 payload，以维持安全事实合同；本轮仅为展示 archive 增加摘要投影，没有顺手改写 lifecycle 授权边界。已发布列表仍约 6 MB，后续若需更低可独立评估分页/事实载荷，但不能声称此次已做数据库级全链路分页。

状态：COMPLETE / bounded re-review PASS。没有遗留本轮阻塞回归，不再扩大 scope。尚未提交、推送或运行远端 CI；未生成安装包或执行真实发布/付费验收。
