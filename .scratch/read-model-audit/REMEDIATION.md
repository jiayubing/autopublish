# 读模型修复与有界复审

基线：`8662e11dddfe43602b179c0afdbf38b4f11a2174`。用户在审计后授权实施；本次未 commit/push，证据绑定最终工作树而非虚构的新 HEAD。

## 实现

| Finding | 修复与 owner | 验证 |
| --- | --- | --- |
| R1 | ArticleStore 提供 getArticleSummary/listArticleSummaries；ContentStore 身份索引存摘要，仅身份恢复消费者按 ref 取完整文章；生成标题优先使用任务已有 client/article ref | 新摘要真实文件测试、content-store、generation read amplification/progress |
| R2 | attention 只在候选待办需要时查询文章，每次查询按 client/article 去重；生产读者使用共享摘要接口和 tombstone；permission 读取请求文章摘要 | 空待办 0 文件读取；50 篇中查 1 篇只读 1 份摘要；同文章不同待办只读 1 份摘要 |
| R3 | management 和 IPC 改为 ArticleSummary；不返回当前文章正文及材料/调研/模板正文；编辑器按需加载详情；显式关键词查询仍匹配全文及模板正文 | 17 项文章库浏览器交互；正文搜索、空结果、失败重试、迟到结果、编辑和投稿上下文；完整生成到发布集成 |
| R4 | workspace invalidation 维护统一 articleReadRevision；具体问题/研究来源变更不使三个快照内容失效，公开 revision 仍单调增加；宽泛 CONTENT_SOURCE_CHANGED 和未知变更保守失效 | 摘要组合测试、原有 snapshot/revision/IPC 回归 |
| R5 | MediaResourceStore 以文件版本复用已解析资源 JSON，返回调用方副本；写入/删除失效，外部替换/损坏可见 | 两页只读一次、返回值隔离、外部替换、坏 JSON 与删除回归 |

`.summary` 是派生缓存，不是新事实 writer。正常保存完成后 best-effort 原子写缓存；缓存版本包含原 JSON/Markdown 的设备、inode、大小、mtimeNs 和 ctimeNs。缓存缺失/坏 JSON/版本不匹配时走原文件对验证，锁或 journal 存在时走原锁内读。读取原文前后的版本变化不能缓存混合结果。安全路径检查继续由既有 path policy 负责。永久删除清理活动摘要缓存；恢复后按实际文件版本校验。

源文章写入失败仍按原事务语义处理；派生缓存失败不会将已经提交的文章报告为失败。摘要 `hasContent` 仅供展示/生命周期投影，正文内容合同、锁内 CAS、发布 snapshot 和最终授权不改。未执行真实账户、发布、付款、生产迁移。

## 测量

Windows / Node v24.16.0；2 个客户各 1000 篇、正文 4096 字节的相同合成数据。时间为单次测量，文件次数为 readFileSync 调用，不是物理磁盘 cache miss。

| 场景 | 审计基线 | 修复后 |
| --- | --- | --- |
| 一个已知任务标题，服务重建后 | 4000 文件，2000 次 Markdown，约 5054 ms | 1 份摘要，0 Markdown，约 1.61 ms |
| 空 attention | 2000 文件，约 2512 ms | 0 文件，约 0.02 ms |
| 当前客户 management + attention | 4000 文件，6,577,080 字节，约 5169 ms | 999 份摘要（此前标题已热 1 份），2,505,080 字节，约 1566 ms |
| 无关问题更新后再查询 management | 4000 文件，约 4953 ms | 0 文件，约 5.53 ms |
| 单篇权限查询 | 2002 文章文件 + 2 锁读取 | 已热摘要 0 文件；独立冷读回归为 1 份摘要 |

原真实存储/SQLite 基准也已调整为摘要入口，并保留发布事实检查：100/1000 篇 × 无历史/失败/已发布客户全部通过。1000 篇首次为 1000 份摘要，保存一篇后刷新仅 1 份摘要。基准含文件 stat/path 检查、运行事实和序列化，当前无历史客户首次中位约 2.30 秒、刷新约 0.89 秒；不能宣称列表查询已经零成本。

证据：`probe-results.jsonl` 为原始审计；`remediation-probe-results.jsonl` 为修复后；`cost-final.log` 为真实存储/SQL矩阵。

## 有界复审

只检查 R1–R5、修改 diff、直接消费者与相关不变量，没有重新审计整个仓库。

- 发现并修复：摘要 projection 复用 content-identity.clone 时将 crypto/path 带进 preload，导致 sandbox preload 不可用；现为无 Node 依赖的纯投影，真实 Electron 测试通过。
- 发现并修复：搜索出口遗漏；当前显式 feature 查询支持并发请求，组件按 scope/query 接收，避免命令 busy 丢弃新的搜索。
- 发现并修复：编辑器过去先接收整篇列表对象；现在先显示加载状态，取得详情后才打开；失败反馈、客户切换迟到防护保留。
- 发现并修复：窄版本不能把宽泛来源变化或未知 mutation 当作无关，已采用保守失效。
- 测试调整保留真实断言：正文来源/研究引用改在详情入口验证；列表验证正文 absence；发布 archive 仍与真实完整文章比对，不删除生成/发布证据断言。
- 格式门禁还暴露两份既有格式问题，`regular-submission-permissions.ts` 与 `types/content.ts` 仅做 Prettier 格式修正，没有改行为。

## 验证

应用目录命令：

- `npm run test:desktop-core`：1755/1755，0 fail/skip/cancel/todo（`desktop-final.log`），最终退出码 0。
- `node --test tests/renderer-history-editor-flow.test.js`：17/17，正文搜索/重试/迟到结果及原 16 项。
- `node --test tests/generation-read-amplification.test.js tests/article-management-snapshot-storage-cost.test.js`：5/5。
- `node --test tests/r5-generation-publication-integration.test.mjs tests/renderer-article-attention-actions.test.js tests/article-summary-read-model.test.js`：9/9。
- `node --test tests/production-preload-sandbox.electron.test.js`：2/2，沙箱外执行真实合成 Electron；首次沙箱内 GPU 子进程启动失败，未降低断言。
- `npm run test:packaging`：49/49；`npm run test:migration`：68/68；`npm run test:production-ipc-matrix`：6/6。
- `npm run lint`、`npm run typecheck:main`、`npm run typecheck:bridge`、`npm run build:renderer`、`npm run build:preload`、`npm run format:check`：通过。renderer build 含自身 TypeScript 检查；保留现有 bundle-size 警告。
- 最终 `git diff --check` 通过；source-state.json 的修改源码/测试集合 SHA-256 为 `99a364c99fdf51aba8992f0bfecb8a25c6e187904717f2347f7697f05f81d93c`。最终完整桌面测试后源码/关键测试未再修改。

这些集合有重叠，不将数量相加作为独立覆盖数。前几次失败日志保留为过程 evidence，不能当作最终通过证据。

## 保留边界与风险

- 老文章首次无摘要仍需完整校验；新建/保存维护摘要后可复用。没有把未验证的 JSON 当 metadata，也没有迁移原始文件格式。
- 搜索是用户显式请求时读正文；当前仍同步搜索一个客户完整文章，并非全文索引或后台线程。空关键词列表和普通刷新不再读正文。
- 发布档案保留原证据合同（可能含不可变发布正文），本轮不裁剪发布证据。1000 篇已发布客户快照仍可能约 10.16 MB；不能把当前文章 summary 的改进冒充所有 archive 也实现按需详情。下一步如有实测需求，owner 为 publication archive query/详情合同。
- 身份未知的全库恢复查询仍需枚举各客户摘要；不会承诺所有查询只访问一篇。已知生成任务标题走 ref 定位。
- 文件版本检测仍有同步路径/stat 成本；未引入 worker、数据库或文件监听器；缓存不感知外部修改事件，但下一次实际摘要读取会验证源版本。既有 management revision 缓存对外部编辑的约定不变。
- 媒体分页避免重复文件读取/JSON.parse，但 normalize/filter/copy 仍随资源总数增长；没有声称获得数据库式分页。
- 本轮没有运行远端 CI、生成安装包或执行真实外部验收。

最终状态：COMPLETE / bounded re-review PASS。本轮阻塞回归均已关闭，不再开启 fresh full review。用户新增的 `pelican-bicycle.html` 未触碰；未 commit/push，远端 CI 尚未触发。
