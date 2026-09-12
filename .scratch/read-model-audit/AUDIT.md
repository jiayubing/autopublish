# 读模型、缓存、索引与数据访问审计

日期：2026-09-12。基线：`8662e11dddfe43602b179c0afdbf38b4f11a2174`，Windows / Node v24.16.0。

## 结论与范围

用户提出的审计方向合适，当前最值得先解决的是文章读取边界，而非引入 SQLite 迁移、Redis 或 CQRS 框架。一次 Primary Audit 已完成；没有在本轮证据中发现 P0/P1 或可确认的数据一致性错误。存在四项文章链路性能/架构问题及一项独立媒体读取问题，均登记为后续整改；这不代表目标轻量架构已验收通过。

审计覆盖 ArticleStore、ContentStore/identity、生成标题、management、permission、attention、queue、submission center、publication lifecycle 和直接 Renderer/IPC 消费者；媒体部分只跟踪资源分页读取链，不扩展到第三方刷新、订单执行或整个媒体子系统。

检查的不变量：内容 writer 唯一；身份索引更新与内容 mutation 共用入口；不把展示缓存作为投稿授权；客户端/workspace 隔离；过期结果防护；不削弱正文完整性、锁、事务恢复或不确定远端结果规则。未进行真实外部操作，也未修改生产代码。

## read model 与缓存盘点

不能把每个 DTO 或纯函数都算作一套独立缓存。下表是本轮实际检查的读取路径，不是整个应用全部缓存的穷举。

| 读取面 | 数据来源与载荷 | 保存/失效机制 | 判断 |
| --- | --- | --- | --- |
| ArticleStore 列表/详情/回收站 | 文件对；JSON 本身含正文，另读 Markdown 验证一致性 | 不保存列表缓存；稳定列表读检查版本，必要时锁内恢复 | 保存 owner 正确，但没有真正摘要读取 |
| Content identity index | 全客户 listArticles；三张 Map 指向含完整文章的索引对象 | ContentStore 实例内懒建；create/save/session 更新，trash 删除，部分 restore/purge 重建 | 是一套索引的三个键，不是三个 owner；冷读全库，热查仍 clone 完整文章 |
| generation title projection | task ID → identity result → title | 活动批次 titleCache；事件复用，显式 get/list/state 刷新；结束/释放清除 | 独立、受限展示缓存，不是持久标题真源 |
| article management snapshot | 当前客户文章/回收站、运行事实、archives、attention | 序列化快照；每客户保留一个 revision，workspace 实例隔离 | 含正文；与 attention 组合重复读 |
| regular submission permission | 请求文章逐篇 getArticle + 生命周期 facts + 客户 attention | 没有长期缓存；revision 前后校验、最多重读一次 | 输出轻，但整个调用链不按请求篇数收敛 |
| regular queue group query | OperationalStore 冻结 publicationSnapshot.title；客户名称 | SQL 查询；客户名称 Map 只在单次调用内去重 | 不读文章目录/正文；冻结标题是发布事实，不能替换为可变当前标题 |
| attention query | publication/order/removal 等事实，加文章存在性/完整性/标题 | 按客户+workspace revision 缓存；revision 变化清空 | scoped 查询先读整客户文章，即使没有待办 |
| submission center snapshot | queue、paid batches、attention | runtime/client/page/revision；只保留最后一个结果 | 自己不重新拥有生命周期，但继承 attention 成本 |
| lifecycle/publication projection | OperationalStore 事实 + 内容完整性；纯生命周期/安全字段映射 | 本轮检查的投影函数没有独立持久缓存 | 应保留独立运行事实 owner，不合并进内容 metadata writer |
| platform/media DTO | 对应用查询结果做受控映射 | DTO 投影模块本身无长期缓存 | DTO 数量不等于失效规则数量 |
| media resource page | 完整本地资源 JSON → normalize/filter → paginate | 持久供应商资源缓存，setAll 更新；每页重新读文件 | 独立于文章，分页并非底层有界读取 |
| Renderer management view | IPC 完整快照；列表正文/模板正文搜索 | 当前视图状态 + query identity 序号/workspace/client 防迟到；事件/命令后刷新 | 不是第二套生命周期 writer，但持有大载荷 |

主要失效家族是：ContentStore 内容 mutation、workspace revision、活动生成批次、供应商资源刷新；Renderer 的 scope/sequence 是异步结果接收边界。不能据此声称存在五六套互相冲突的文章事实 owner。management/attention/submission center 共用 revision，但各有缓存容器和保留策略。

## Findings

### R1 — P2 / EXPOSED_PREEXISTING：标题与身份查询冷读整个内容库，热查仍复制正文

Owner：`src/content/content-store.js`、`content-identity-index.js`。

证据：ContentStore 35–45 行将 ArticleStore.listArticles 注入 index；index 77 行开始枚举全部客户；ContentStore 63 行的标题接口先调用完整身份查询，closedCardinalityResult 返回 snapshotArticle 的深拷贝。即使结果只取 title，热路径仍做与该文章正文大小相关的序列化拷贝。三个 Map 共享索引文章对象，不能把内存误算为简单三倍。

影响：一个已完成任务的标题请求可被无关客户的文章规模拖慢；冷建索引还保留整个库的文章正文。2 客户各 1000 篇的实测，9 字节标题响应触发 4000 次文章文件读取、约 5.05 秒；第二次没有文件读取。热查复制成本是源码确认，本轮未做堆内存/超大正文独立基准。

最小整改：先定义 ContentStore 的 metadata/identity read side，使标题取得标量、身份结果维持 none/one/many；需要完整文章的恢复/写操作消费者再按 ref 读取。不可直接把现有 `result.article` 偷换为摘要，需逐个迁移真实消费者。不要再给标题单独新增持久缓存。

### R2 — P2 / CROSS_COMPONENT_INTERACTION：attention 预先读全客户，抵消按篇权限查询并重复 management 读取

Owner：`desktop/services/article-attention-query.js`，与 management/permission 的直接组合。

证据：attention `entries()` 654 行先调用 batchArticleLookup，随后才构建事务、发布、订单和归档待办；batchArticleLookup 读取 active/trash 全集。生产装配 `workspace-runtime-composition.js:495` 注入真实文章列表。management 自己先 listArticles，再 attention.list；permission 自己 getArticle 后也调用客户 attention。两条 IPC 路径都注入同一真实 query。

影响：1000 篇且无待办时，空 attention 返回 61 字节仍读 2000 个文章文件；management 冷读是 4000 次；只请求 1 篇 permission 仍读 2002 个文章文件，另有 2 次锁 owner 读取。attention 已命中时不会重复这些读取，不能称每次必然扫描。

最小整改顺序：先列候选待办，候选为空就不访问内容；再针对候选 refs 批量读取 metadata，并在一次查询内按 ref 去重。management 可复用同一内容 read side；不新建 UI 专属缓存。保留 unavailable/missing/trash 的不同语义及操作入口的最终复核。

### R3 — P2 / EXPOSED_PREEXISTING：列表载荷、缓存与搜索耦合完整正文

Owner：ArticleStore/ContentStore，management IPC 合同，Renderer article management feature / GeneratedArticlesView。

证据：ArticleStore 69–83 行同时读取含正文 JSON 与 Markdown；articleForPersistence 克隆完整文章，所以“只读 JSON”也不等于摘要读取。management 保存/返回 articles 原对象字段；IPC 使用 editor 的 generatedArticle/projectArticle 合同，content 字段未去除。GeneratedArticlesView 227 行搜索 article.content 与 templateSnapshot.body；已有独立 getArticleEditor 入口。

影响：1000 篇 × 4096 字节正文，在本轮空运行事实探针中 management 返回 6,577,080 字节，缓存命中仍返回同样大小；文件缓存只消除文件读取，不消除主进程 JSON.parse、IPC 载荷与 Renderer 持有成本。已发布历史、图片/来源快照的真实大小可能不同，本轮不外推。

最小整改：定义独立 ArticleSummary DTO，正文/完整来源通过详情入口按需加载；同时保留搜索行为，可以由内容 read side 执行有界搜索并返回摘要。正文还用于编辑、投稿/付费确认、完整性/指纹、导出等，不能只允许“编辑时读取”。资格展示所需 hasContent/完整性必须由内容 owner 在可靠版本下派生，不能靠 title 或 Renderer 自行推断。正式提交仍按 SPEC §确认规则在锁内读取权威正文和指纹。

### R4 — P2 / EXPOSED_PREEXISTING：全局 revision 放大无关失效

Owner：`desktop/workspace-data-invalidation.js` 与三个 snapshot query。

证据：invalidate 每次都增加一个全局 revision；scopes 只用于 Renderer 通知。management、attention、submission center 的缓存键读取同一个 revision，而不是对应内容/运行事实版本。探针在 management hit 后触发 CONTENT_QUESTION_UPDATED，下一次直接请求 management 又读 4000 个文章文件。

影响：与文章列表无关的写入降低下次命中率；不表示该事件立即触发文章 UI 请求，因为 contentSources scope 不通知 articleManagement。当前是性能问题，未证实 stale correctness bug。

最小整改：在共享 invalidation owner 内按实际依赖维护有限版本，不让每个 UI 发明失效规则；先解决 R2/R3，再评估是否还需要改版本粒度。版本拆分必须覆盖文章保存、回收/恢复、发布/订单 observation、任务终态及 workspace 切换。

### R5 — P3 / EXPOSED_PREEXISTING：媒体资源分页仍读整个资源文件

Owner：`desktop/services/media-resource-service.js`、`src/platforms/media/media-resource-store.js`。

证据：getCachedResourcePage/searchResourcePage 先 readCachedResources 再分页/筛选；MediaResourceStore.getAll→_read 同步 readFileSync + JSON.parse。生产 composition 注入该资源 store。media-read-model 只是返回字段投影，不拥有此缓存。

影响与限制：一次分页读取成本随资源总量增长；本轮没有媒体规模/延迟实测，因此不提升为阻塞项、不混入文章整改。后续媒体 owner 再决定是否需要可复用的资源读取快照与明确刷新版本。

## Electron main 热路径

调用链经 ipcMain handler 直接调用这些 service/ContentStore，当前链路未跨 worker：

- 文章列表/attention：readdirSync、lstat/stat 检查、JSON/Markdown readFileSync、排序/clone；恢复或变更时进入锁与文件事务。
- 生成标题：首次 identity enumeration；后续完整身份对象 JSON clone。
- permission：逐篇 getArticle 锁内读取，加 attention 的同步列表。
- management hit：JSON.parse 完整缓存；miss 还 stringify 与 IPC 投影。
- 媒体资源分页：同步读取完整资源 JSON。
- OperationalStore 使用同步 SQLite，队列 SQL 在库内 json_extract 冻结标题；无文章文件读取不等于零 SQL 解析成本。

`async`、`await read()` 或 `Promise.resolve(contentStore.getArticle(...))` 不会把内部同步工作移出主进程。探针证明同步调用量与耗时，不等于已测量 Electron UI 卡顿；本轮没有启动实际 Electron 进行事件循环延迟采样。先减少载荷和扫描，再决定是否迁后台执行，避免先增加线程与跨线程一致性协议。

## 验证及证据边界

1. `node .scratch/read-model-audit/probe.cjs`：14 个测量场景，断言通过，结果见 probe-results.jsonl。仅合成临时目录，真实 ArticleStore/ContentStore 与 attention/management/permission；运行事实为空的假端口，不代表有订单/发布历史的生产总成本。读取次数为 readFileSync 调用，不是物理磁盘 I/O；不含 stat/readdir 计数。每个规模只测一次时间，不是 percentile 或 OS 冷缓存基准。
2. 应用目录运行 `node --test tests/article-management-snapshot-cache.test.js tests/article-attention-query.test.js tests/regular-submission-permission-query.test.js tests/content-generation-batch-title-cache.test.js tests/content-generation-title-projection.test.js tests/content-generation-task-index.test.js tests/submission-center-snapshot.test.js`：实际 30 项通过，见 tests.log。命令中误列的 content-generation-task-index.test.js 不存在，Node 此次没有执行它；不计作覆盖。
3. 应用目录补跑 `node --test tests/content-store.test.js tests/article-store.test.js tests/generation-progress-cost.test.js`：46 项通过，见 storage-tests.log。覆盖真实存储、身份 none/one/many、合法 mutation 更新及生成读成本；总计 76 项，不含未执行的文件。
4. 当前 `article-management-snapshot-storage-cost.test.js` 源码确认它测真实存储/SQL但未注入 attention，不能代表完整生产组合读取；本轮未重跑其重型历史矩阵。用户提供的 3.0–3.4 秒属于历史结果，本报告不当作本轮测量。
5. 没有修改生产源码/UI/schema，未运行完整 CI、打包或实际 Renderer 交互；本轮为数据访问审计，不能据此宣称所有 UI/发布路径验收通过。

测试证据缺口：已有 permission 的“只读请求文章”与 attention 的“固定批量调用次数”测试在各自 seam 上成立，但没有证明组合后的物理文件/正文读取边界。后续应将 R2 的组合场景变成持续回归，并验证冷/热/保存/回收恢复/重启/跨客户/修复中/迟到读矩阵；不要只断言调用 listArticles 一次。

## 后续整改与收敛

优先顺序：R2 消除空待办及重复读取 → R1/R3 共用 metadata/identity read side 与 summary/detail/search 合同 → 根据新成本决定 R4；R5 留给媒体 owner。metadata 必须是可重建派生物，明确版本、原子更新、崩溃恢复和数据不完整时的 fail-closed 行为；不能另立事实 writer。

Blocking：本轮没有已证实必须立刻阻塞现有提交的 P0/P1/正确性 P2。Deferred：R1–R4 性能/架构 P2，R5 P3，均有明确 owner。仅做了审计，没有把 findings 标成已修复。

Re-audit scope：实施后只检查这些 findings、直接调用方、摘要完整性/失效/搜索语义、读成本和相关回归；不重新开启全仓 fresh audit。审计交付 COMPLETE，轻量读取整改尚未实施。
