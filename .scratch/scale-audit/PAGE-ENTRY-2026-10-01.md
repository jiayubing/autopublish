# 内容生产、文章库、投稿中心性能检查

状态：检查及本地优化完成；最终结果见文末。基线 `d05d4250`，分支 `codex/geo-knowledge-base`。用户随后明确授权修复优化；不推进 GEO CP-5，不修改生产数据或外部系统，不提交或推送。以下检查部分保留优化前证据。

## 范围与结论

用户请求检查客户、文章增加后的三个页面进入性能。沿当前 App → feature → desktop service → 文件/SQLite 查询链检查，并使用临时合成数据复测。既有跨页面客户目录复用、文章摘要与快照缓存、普通队列和付费批次查询端分页仍有效，但下列问题仍存在。所有发现属于 EXPOSED_PREEXISTING；不是本轮引入。

### P1：三个页面共用客户目录读取呈平方增长

`ai-content-service.js:listClientsSafe` 先列客户，再逐客户调用 `listMaterialMetadata`。后者为定位目录调用默认 `clientKnowledge.getClient`；`client-knowledge.js:getClient` 用 `listClients(workspaceRoot).find(...)` 查找一个客户，先读取所有客户的一层资料全文。因此一次目录读取重复 N 遍全库资料，且使用同步文件 API，占用 Electron 主进程事件循环。前端 initial 缓存仅避免部分重复进入；首次进入、手动刷新与失效后的读取仍受影响。

Windows / Node v24.16.0；每客户一个16KiB合成 facts.md + client.json；真实 createAiContentService 默认装配。观察 readFileSync 次数和返回字节，不代表物理磁盘读量。单次诊断数据：

| 客户数 | 服务调用耗时 | 文件读取次数 | 读取数据 MiB |
| --- | ---: | ---: | ---: |
| 10 | 194ms | 210 | 1.57 |
| 50 | 4122ms | 5050 | 39.14 |
| 100 | 19877ms | 20100 | 156.58 |

可复现脚本：`node .scratch/scale-audit/page-entry-probe.cjs`。本次实际执行的是与保存脚本等价的 stdin 版本，保存脚本已做语法检查；未把保存后重跑冒充已执行。100客户资料正文总量仅1.5625MiB。数据点不足以给1000客户推算可靠秒数；读取次数符合2N²+N。

同一根因也影响内容生产 getClientDetails：读取目标客户时仍加载其他客户资料。修复 owner 为 client-knowledge、client-material-store、ai-content-service；应批量复用本次已解析的客户身份，只枚举资料元数据，详情仅读目标客户。必须保留路径边界、重复身份和外部资料变更语义；仅把全文读取换成每客户全库 stat 仍会留下平方级扫描。

### P2：文章库首次读取仍与当前客户全部文章数量成正比

article-management-snapshot 返回当前客户全部文章、生命周期与档案摘要。摘要与同版本请求合并有效，命中缓存不重读文件/SQL；但首次访问仍构建全部快照。以下为现有真实临时 ArticleStore + SQLite 合成测试的三次中位数，每篇正文4KiB，3个客户分别无发布、失败、已发布（各保留一篇可编辑文章）。测试文件并行运行，数字为诊断而非SLA。

| 当前客户文章数/状态 | 首次快照 | 缓存命中 | 单篇修改后刷新 | 返回体 |
| --- | ---: | ---: | ---: | ---: |
| 1000/无发布 | 1546ms | 4.9ms | 464ms | 913KiB |
| 1000/失败 | 1472ms | 6.0ms | 567ms | 1418KiB |
| 1000/已发布 | 1678ms | 11.2ms | 851ms | 2981KiB |

不包含 Electron IPC、React 渲染、客户目录加载，也不等于磁盘缓存清空后的冷启动。已发布样本SQL返回累计约17.79MiB，虽然最终DTO约2.91MiB，内部读取仍有优化空间。owner：article-management-snapshot 与 OperationalStore 生命周期/档案读模型；后续优先核对所需字段和查询范围，不改变持久发布证据。

### P2：文章库展开与批量勾选没有渲染规模限制

GeneratedArticlesList 默认折叠，进入页面不必渲染全部文章行；但展开后直接 `group.articles.map`，无分页或虚拟列表。GeneratedArticlesView 对全部筛选文章逐个 `selected.includes`，行组件也使用 includes；全选大量文章时复杂度会接近平方增长。不能声称这些交互已达到某个实测秒数，本轮未做大数据UI计时。owner：GeneratedArticlesView/List；建议限制可见行数、复用选择Set，并保留全组选择、筛选、导航定位语义。

### P2：文章库快照缓存无客户数量或字节预算

article-management-snapshot 为每个访问过的客户保留一个序列化完整快照，只淘汰同客户旧版本或整体invalidate，没有总容量限制。多客户逐个访问会累积内存；与投稿中心/attention已有64项限制不同。本轮通过源码确认生命周期，未运行长时RSS测试，不把DTO大小直接当堆内存。owner：article-management-snapshot；建议有界淘汰并保留版本、在途合并和迟到结果隔离。

### P2：投稿中心需处理分区仍全量读取后分页

submission-center-snapshot 在 Promise.allSettled 中无论当前显示标签都请求 regular/paid/attention；attention.list 构建全部匹配待办，再在 snapshot 中slice。普通队列及付费批次已下推分页，不能把它们描述为仍全量读取。大量异常待办场景需单独量化，不能由正常队列分页测试推定。owner：article-attention-query 与 submission-center-snapshot。

## 验证与边界

在 auto—publish 执行：

`node --test tests/article-management-snapshot-storage-cost.test.js tests/regular-queue-pagination.test.js tests/paid-batch-pagination.test.js tests/submission-center-snapshot.test.js tests/renderer-page-navigation.test.js`

结果17/17通过，0失败、0跳过，126.37秒。覆盖真实合成文件/SQLite文章读取、超过20000条的队列/批次分页和客户端隔离、以及浏览器跨页面导航与读取范围。详细本地日志：`auto—publish/build/page-performance-audit.log`（生成物，不提交）。未运行全套测试、打包、真实客户应用测试或大数据UI交互计时；本轮无生产改动，因此不声称修复后验收通过。

修复顺序：先关闭共用客户目录P1，再测文章库查询/渲染/缓存；最后对大量attention做专项测试。检查已收敛，不启动无边界全仓审计。

## 用户授权后的优化

- 客户目录：沿用本次枚举的物理目录，资料store再次验证路径边界，直接列元数据，不逐客户调用全库getClient。单客户getClient改为身份定位后仅读目标目录；material store默认身份定位不读取正文。客户目录拒绝重复ID；保留外部资料编辑检测、路径边界和现有DTO。
- 文章渲染：每组50篇分页，默认折叠、全组选择、跨页勾选与直接导航保持；选择计算使用Set，避免全选后逐条扫描选择数组。
- 文章缓存：LRU至多64个客户、32MiB序列化字符串预算（UTF-16估算）；超过预算的单快照正常返回而不缓存。保留在途合并、版本失效、返回副本隔离。
- 文章查询：生命周期查询只读recovery intent的detail；submission item读取在SQL端移除publicationSnapshot，避免把随后会丢弃的正文送到JS。完整success evidence仍完整读取并校验；不改schema、writer、发布权限或持久证据。
- 待办分页：现有attention owner支持分页返回，缓存完整计数；投稿中心只投影当前页，不二次切页，末页与空页保留真实total。无页读取仍被文章权限/处理消费者使用，不是退役兼容路径。

### 修复后测量

同一客户探针实际运行 `node .scratch/scale-audit/page-entry-probe.cjs 10 50 100 1000`：10/50/100/1000客户分别26/113/213/2682ms，对应读取10/50/100/1000次；1000客户约0.03MiB元数据，未读取资料正文。先前无并行测试的一次修复后100客户为185ms；不择优替代最终复测213ms。约19.9秒降到0.21秒针对客户目录服务调用，不是完整页面SLA。

最终源码存储专项测试2/2通过。1000篇失败/已发布样本SQL返回量分别由10.82/17.79MiB降到1.85/8.80MiB，最终DTO仍为1418/2981KiB，未删减业务输出。该轮与集成/core并行，首读中位数分别2281/2410ms（无发布1138ms），并未证明首读耗时优于基线；记录读取量收益，不以受资源竞争影响的时延宣称加速。日志为 `auto—publish/build/page-performance-storage.log`。

新增 `page-entry-performance.test.js` 验证真实合成目录读取预算、单客户隔离、外部编辑、重复身份、越界目录拒绝、LRU/超大快照与待办页计数/动作。新增 `renderer-article-list-capacity.test.js` 将真实TSX打包到无头Edge，使用1234篇合成文章验证每页50行、末页34行、全组选中、跨页取消、打开文章、空态与翻页禁用态。既有存储压测增加SQL结果不得包含无关正文的断言。

### 保留的规模边界

完整客户目录仍线性枚举文件，1000客户首次读取仍需约2.7秒。文章库仍需为当前客户全部文章构建生命周期快照；本批减少多余SQL载荷及DOM量，没有新增持久索引或改变整个读模型合同。待办首次聚合仍需全量计算策略与排序才能保持准确总数/动作，分页优化的是返回、转换与后续翻页；并未实现SQL端跨来源待办分页。此类更大规模查询重构应另行设计，不能把本批称为任意规模恒定耗时。

有界复核仅覆盖以上改动、直接消费者和版本/路径/选择/分页不变量，不扩展全仓审计。最终测试和文件hash另见本目录 `PAGE-ENTRY-FIX-EVIDENCE.json`。

### 最终验证

- `npm test`：651/651，0失败/跳过，CLOSED。
- `npm run test:integration`：1329/1329，0失败/跳过，CLOSED，246文件。最后一轮已包含SQL载荷改动；期间把原有客户范围过滤移到attention缓存构建处，该最后增量另跑attention/query/page-entry共25项通过，随后lint与主进程类型检查通过，未再修改源码。
- `npm run lint`、`npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run build:renderer`、`git diff --check`通过。Renderer构建仍有既有chunk大小提示，不影响构建成功。
- 未做安装包、真实客户库或真实外部发布验收；本次无preload/IPC外形变化。未宣称任意规模下页面瞬间加载。
- 保持 `codex/geo-knowledge-base` / `d05d4250`；代码、测试和记录在工作区，未提交/推送。详细日志是本地生成物，不纳入提交。
