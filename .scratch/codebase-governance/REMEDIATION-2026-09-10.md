# 项目审查修复与限定复审（2026-09-10）

状态：COMPLETE（本轮本地修复与验证）；原始审查见 [PROJECT-REVIEW-2026-09-10.md](PROJECT-REVIEW-2026-09-10.md)。

结论：R1–R3 阻塞项关闭，河畔产品合同已按用户决定收敛，格式门禁通过，可开始新增功能。不需要再做全项目重构。R4 已减少约一半读取时间，千篇全量刷新仍是秒级，容量较大的新功能应由文章读模型 Owner 继续按实际需求做摘要分页和正文按需读取。

## 授权与范围

- 用户授权按审查报告实施修复、优化与退役，另明确“接口接受就算发布，退役审核跟踪”。
- 保持当前 master 工作区；未 stage、commit、merge、push 或发布。
- 测试均使用合成数据、隔离临时目录、假 transport/本地 HTTP/本地 Chromium；未操作真实账号、客户内容库、供应商订单、图片上传或生产服务器。
- 本轮修改没有 SQLite schema 变更，不删除正式 migration、运行数据或历史发布/订单证据。

## Finding closure

| Finding | 修复与唯一 Owner | 验证及结果 |
| --- | --- | --- |
| R1 / P1 | 普通队列和付费批次新增停止领取与 drain；workspace composition 先等待两者再释放 store/session；重复 dispose 共享同一个完成 Promise | 真实 composition/SQLite 测普通请求、准备、长间隔退出；付费真实 store 测复核与请求退出。成功先落库，后续项保持 queued，销毁后不能启动；PASS |
| R2 / P2 | desktop-task-service 改为读取两个现行执行 Owner 的活动投影，移除旧任务快照 writer；原 settings/切库/维护保护继续消费统一状态 | 在途普通投稿 getState 为 busy，配置保存拒绝；工作区装配验证现行两 Owner；内部河畔核验使用运行配置 adapter.test，避免被用户配置 test 的 busy guard 误拦；PASS |
| R3 / P2 | auth HTTP readBody 在 JSON.parse 成功后才置 settled | 真实本地 HTTP 非法 JSON 返回 400/AUTH_INPUT_INVALID，鉴权 64/64；PASS |
| R4 / P2 非阻塞 | ArticleStore 列表对稳定 JSON/Markdown 文件对做前后版本与锁/事务日志检查；发生竞争或待恢复时回到原锁内读取，不新增缓存 writer | 无文件写入的读取、跨文件读取间并发替换、事务中断恢复、稳定损坏拒绝以及原锁/CAS/回收回归通过；基准见下表 |

R4 的故障注入暴露了一个直接相关的既有缺口：JSON 已移到 backup、尚未装回时，原列表只枚举 JSON，会漏掉待恢复文章。列表现在同时识别文章 pair journal，去重后使用原事务恢复 Owner 恢复。没有通过忽略损坏或吞错来获得性能。

## 河畔审核跟踪退役

- 明确成功并返回有效文章 ID 即映射 accepted，pending/draft/未提供审核字段不再改变本地发布事实；失败和结果不确定的分类保留。
- 删除 GEO result 查询、remoteReview contribution、定时 reconciler、remote_pending 活跃合同及投影、对应旧测试；SPEC 同步用户决定。
- 对仍处于旧 outcome_pending/uncertain 的河畔接受回执，启动时复用 recordRegularAccepted 与既有 publication-success 事务恢复。保留原始 historicalAcceptanceObservation、remoteId 和首次正面观察时间；不再次提交远端。
- 新增恢复事务中途故障、回滚、重启恢复及重复打开的合成 SQLite 回归。remote_pending 字符串仅在读取历史回执和拒绝旧能力的测试中保留，不是可继续使用的发布状态。

## 有限退役与测试归属

| 已退役路径 | 当前能力及保留的验证 |
| --- | --- |
| ArticleList、ArticleEditor、article-editor-session、mockData、generation-runtime-snapshot-logic | 当前 GeneratedArticleEditorPanel/编辑器 snapshot 与 Renderer 编辑流程验收保留 |
| article-library-feature、content-production-feature、use-content-generation-feature、platform-event-router 及无人使用的测试 harness | 源资料隔离与错误行为测试改用 content-sources-feature；现行 generation/content feature 不增加 wrapper |
| core/articles.js 与旧 DOCX 扫描测试 | 当前 docx-text-extractor、client-material-store 及材料行为测试保留 |
| publication/article-identity、publication-targets、publication-state | 当前 domain 身份/账号目标合同、OperationalStore 状态转换与生命周期投影测试保留；移除旧正文 hash 身份和平台粒度目标测试，词汇测试继续验证现行投影 |
| media-publisher 与专属旧 workflow 测试 | ticket-25-d 使用与生产相同的 supplier.createOrder 接口；phase-11 保留规范输入/订单号/不确定结果测试，并新增非法正文、缺系统投稿标识等请求前拒绝测试 |
| snapshot CLI、run-task worker、publish-batch、legacyQueueImport/legacyQueue port | 三个内置平台均无该旧能力；同步 package scripts、definition、加载器、打包 gate；正式 legacy migration/evidence 不删除 |
| platform-task-state-store 及旧进度测试 | 由现行 orchestrator 活动投影与 shutdown/busy 回归替代，保留 desktop-task-service 的只读门面 |
| media:get-drafts、media:scan-articles、media-workbench-service、media-draft-store | 贯穿 composition/service/IPC/contract/preload/bridge/feature/readiness 删除，媒体合同由 22 项减为 20 项；资源、收藏、订单、付费预检不变；原磁盘草稿文件不读取、不删除 |

同步删除失效 fixture 和脚本清单，类型归属基线移除两个退役媒体 DTO。没有按 phase/ticket 名称批量删除测试。

## 同一合成基准对比

每篇正文 4096 bytes、三个客户；下表使用首次审查与最终 integration-final.log 中三次不插桩采样的中位数。不同运行负载会影响绝对值；不是冷盘或用户生产库测量。

| 每客户篇数 / 事实 | 修复前首次 / 刷新 | 修复后首次 / 刷新 | 修复后缓存命中 | 首次文件读取次数 |
| --- | --- | --- | --- | --- |
| 100 / 无发布 | 765 / 801 ms | 385 / 390 ms | 0.8 ms | 400 → 200 |
| 100 / 已发布 | 775 / 807 ms | 448 / 444 ms | 1.7 ms | 400 → 200 |
| 1000 / 无发布 | 6632 / 6559 ms | 2966 / 2972 ms | 7.5 ms | 4000 → 2000 |
| 1000 / 明确失败 | 6730 / 6618 ms | 3108 / 3097 ms | 9.6 ms | 4000 → 2000 |
| 1000 / 已发布 | 7046 / 7077 ms | 3360 / 3323 ms | 15.1 ms | 4000 → 2000 |

保留完整正文返回合同，因此并未解决全量响应大小。后续 Owner：ArticleStore / article-management-snapshot；触发点：客户达到千篇规模、批量产能扩展或交互延迟不能接受。不要以本次 PASS 宣称全量快照已具备低延迟容量保证。

## 最终验证

在 auto—publish 目录执行，Windows / Node v24.16.0：

| 命令 | 最终结果 |
| --- | --- |
| npm test | 61 文件，566/566 |
| npm run test:integration | 203 文件，1052/1052，包含本地 Chromium 流程与真实存储合成基准 |
| npm run test:maintenance | 16 文件，172/172，合成迁移和容量验收 |
| npm run test:auth | 64/64 |
| node --test tests/production-packaging.test.js tests/desktop-packaging.test.js tests/packaging-runtime.test.js tests/release-evidence.test.js tests/ci-workflow-contract.test.js tests/phase-06-production-ipc-fixture-matrix.test.js | 6 文件，59/59 |
| npm run lint / typecheck:main / typecheck:bridge / format:check | 全部 exit 0，包括原三处格式问题 |
| npm run build:renderer / build:preload | exit 0；Renderer 843.13 kB，gzip 238.22 kB，仍有 chunk 大小提示 |
| 最后测试文件空白整理后的 node --test --test-concurrency=1 | 15 文件，122/122；覆盖整理后的关键 Renderer/媒体测试，属于重复验证，不加入总数 |
| npm run test:discover | 发现 294 文件；发现数量不等于已运行数量 |
| git diff --check | 通过 |

主要套件合计 1913 项通过，不含重复定向验证；桌面运行 286/294 个发现文件，另有独立 auth。测试数量下降来自已退役专属合同，具体行为归属见上表。未跳过/todo/cancelled。

日志：auto—publish/build/evidence/governance-remediation-20260910/ 中 *-final.log、core-gates.json、regression-gates.json、cleanup-verification.log。该目录是忽略的本机 evidence，不提交生成物。

代码基准 HEAD：69b5fbd9a9b66f7d7eee42dc1914ad9bd164340a，验证对象是本轮未提交工作树。final-source-manifest.json 对 880 个源码/测试/脚本/配置条目及删除标记记录 SHA-256；集合指纹：f08a77aad0f58e0c12b2b2321bbaca9719fdd2a4502f8a6d1b7af46ce3502f4d。文档收尾不改变该代码集合。

## Bounded re-review 与剩余边界

- 只复查 R1–R4、河畔历史回执转换和退役的直接消费者/合同，没有重新发起 fresh 全库审查。
- 复查修复了新增 drain 后重复 composition.dispose 提前返回的问题，并补同 Promise 断言；准备退出、付费退出及历史接受恢复事务均通过直接回归。
- 确认发布成功仍由原唯一 primitive 写入，写入/CAS 仍走锁与事务，退出不自动重发不确定请求，历史 migration/审计数据保留。阻塞 finding 为零。
- 未运行完整 all/release、安装包端到端、Electron 特定焦点/打包导航、Linux Node 22/container 或真实外部验收。自动化通过不能替代真实登录/投稿/图片/付费验收；这些授权边界继续由工作索引链接的合同管理。
- 下一步可以新增功能；与大容量文章列表、打包交付或真实供应商能力相关的功能仍需相应专项验收。本轮治理已达到停止条件。
