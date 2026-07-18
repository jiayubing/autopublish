# 历史文章删除联动、蓝色河畔 Markdown 投稿与发布间隔计划

**日期：** 2026-07-18

**发布包：** `F:\官媒投稿\auto—publish\release-alpha\win-unpacked\AutoPublish.exe`

**源代码：** `F:\官媒投稿\auto—publish`

**内容工作区：** `F:\1`

**基线提交：** `a9b1663 docs: document configuration patch and queue recovery workflows`

**版本：** `1.0.1`

**目标：** 删除历史文章时安全撤销其尚未开始的投稿并移除队列副本；让蓝色河畔完整支持应用生成的 Markdown 投稿；提供可持久配置、可停止、可观察的河畔文章发布间隔。

本计划只定义修复和验证工作，不在诊断阶段修改程序、平台配置、文章、队列、发布账本或远端内容。自动化测试必须使用临时工作区、假 Cookie、假 Python runner 和假 HTTP 结果，不向蓝色河畔发起真实 POST。

---

## 1. 结论摘要

| 项目 | 已确认结论 | 优先级 |
| --- | --- | --- |
| 删除历史文章后河畔队列文件仍在 | 不是偶发清理失败。当前 `article-trash-service` 完全不知道投稿批次和发布账本，现有测试还明确要求“保留队列副本和记录”。 | P0 |
| 已删除文章仍可能出现在待发布队列 | 真实工作区已有 1 篇回收站文章仍对应有效的河畔 Markdown/sidecar pair；当前平台扫描和 worker 没有“源文章已删除”保护。 | P0 |
| 河畔不能投稿 Markdown | 通用队列扫描器接受 `.md/.txt/.docx`，但河畔 adapter 只按文件名生成标题、正文固定为空；Python 脚本更明确只接受 `.docx`。 | P0 |
| 河畔 TXT 能力 | 当前 Python 实现实际上也不支持 `.txt`。用户观察到的“可能支持 TXT”来自通用扫描能力，不代表河畔 POST 链路可用。 | P1 |
| 河畔文章发布间隔不可调 | 桌面串行 worker 紧接着执行下一项，忽略传入的 `intervalMs`；河畔配置 schema、safe status、worker payload 和页面都没有间隔字段。 | P0 |
| 长间隔与任务超时冲突 | 桌面父进程对整批平台任务使用固定 120 秒总超时。即使只增加等待，多个文章也会被父进程提前判定超时。 | P0 |

---

## 2. 已完成的复现与证据

### 2.1 发布包就是当前实现

以下打包文件与当前源文件 SHA-256 一致：

- `desktop/services/platform-workbench-service.js`
- `src/content/article-trash-service.js`
- `src/platforms/hepan/adapter.js`
- `src/platforms/hepan/hepan_publish.py`

发布包 `AutoPublish.exe` 的最后写入时间为 2026-07-18 20:57:27。因此以下结论适用于用户本次实际启动的版本，不是旧包与新源码不一致。

### 2.2 三项红色反馈测试

使用临时目录、真实领域模块和假发布 adapter 建立了 3 项诊断测试：

```text
1. 创建已审核文章 -> 加入 hepan 队列 -> 删除历史文章
   期望：队列 pair 消失
   实际：Markdown 仍存在

2. 将 # 标题 + Markdown 正文交给真实 hepan adapter
   期望：得到标题和非空正文
   实际：标题退化为文件名，正文为空

3. 两篇河畔文章设置 60ms 发布间隔
   期望：两次 POST 调用间隔至少 50ms
   实际：约 6ms
```

同一命令连续运行两轮，均为 `3/3 RED`，单轮约 0.2 秒。临时诊断文件已删除，工作树恢复 clean。

### 2.3 真实工作区只读核对

只读取路径和 sidecar 身份字段，不读取或输出正文、Cookie：

```text
F:\1\.autopublish\input\hepan
  Markdown：6
  submission sidecar：6

F:\1\.autopublish\article-trash
  tombstone：1

删除文章 ID 与河畔 sidecar 文章 ID 的交集：1
```

这证明第一个问题已存在于真实数据，不只是最小测试构造。诊断没有删除或改写这些文件。

### 2.4 删除行为的根因

当前调用关系：

```text
GeneratedArticlesView.trashSelected()
  -> content:trash-articles
  -> ai-content-service
  -> article-trash-service.trashArticles()
  -> articleStore.moveArticleToTrash()
```

`article-trash-service` 只依赖 `articleStore`，没有注入：

- submission batch store；
- publication ledger；
- queue pair 检查/取消能力；
- 平台 worker 状态。

现有测试 `article-trash-service.test.js` 的第一个用例名称和断言就是：

```text
creates a minimal tombstone, keeps queue copies and records...
```

所以当前实现对旧规格是正确的，但与现在确认的产品语义冲突。需要修改领域规则，而不是补一个 `unlink()`。

### 2.5 为什么不能在页面里直接删除 hepan 文件

队列 Markdown 不是孤立文件，它与以下数据共同描述一次投稿：

```text
Markdown + .submission.json
  <-> submission batch item
  <-> publicationId + attemptId
  <-> publication ledger status
```

只删除 `.md` 会留下 sidecar、`queued` 账本和陈旧批次；只按文件名删除还可能误删同名文章。必须复用已有的“pair 未修改校验 + attempt 身份 + cancel reservation”能力，并保留发布审计记录。

### 2.6 Markdown 根因在河畔专用链路

通用平台扫描器已经接受：

```js
const ARTICLE_EXTENSIONS = [".md", ".txt", ".docx"];
```

但 `src/platforms/hepan/adapter.js`：

- 自己的 `scanArticles()` 只扫描 `.docx`；
- `parseArticleFiles()` 用 `fileBaseName` 作为标题；
- `body` 固定为 `""`；
- `publishArticle()` 只把原文件路径交给 Python。

`hepan_publish.py` 的 `publish_one()` 又执行：

```python
if article_path.suffix.lower() != ".docx":
    raise RuntimeError("hepan only supports .docx articles")
```

因此 Markdown 虽然能出现在“其他平台投稿”列表中，却必定在真正 POST 前失败。问题不是蓝色河畔 POST 接口不能接收 Markdown；远端接收的是标题和 HTML，限制来自本地文件预处理。

### 2.7 发布间隔根因与潜在超时

当前 `platform-workbench-service.submitSelectedPlanSerially()` 使用普通 `for` 循环，上一项结束后立即进入下一项，没有等待逻辑。诊断即使传入 `intervalMs` 也被忽略。

桌面真实链路还会丢失配置：

```text
HepanProviderSettings
  -> 没有 publishIntervalSeconds

desktop-task-service.startPlatformSubmit()
  -> hepanRuntime 只含 Python/category/vendor/Cookie path
  -> submitOptions 固定，不含平台节流策略

platform worker
  -> 直接调用 submitSelectedPlanSerially()
```

此外父进程用 120 秒对整批任务做 `Promise.race`。若默认间隔 30 秒、文章较多，即使 worker 正常等待也会被误判超时。因此“增加 sleep”不是完整修复。

### 2.8 现有测试为何仍全部通过

以下 48 项相关测试全部通过：

```powershell
node --test `
  tests/article-trash-service.test.js `
  tests/content-submission-batch.test.js `
  tests/submission-batch-worker-integration.test.js `
  tests/platform-workbench-service.test.js `
  tests/hepan-provider-settings.test.js `
  tests/hepan-settings-patch-contract.test.js `
  tests/desktop-task-service.test.js `
  tests/renderer-article-history.test.js
```

覆盖缺口：

- 删除测试锁定的是旧规则“保留队列副本”。
- 投稿批次测试只测手动撤销批次，没有从文章删除入口跨到队列生命周期。
- 平台测试使用会正确返回正文的假河畔 adapter，没有调用真实 `hepan.parseArticleFiles()`。
- 没有河畔 Markdown/TXT 解析测试，也没有 Python payload 合同测试。
- “串行”测试只断言调用顺序，不断言两次远端调用之间的时间。
- desktop task 测试没有覆盖长间隔下的父进程 watchdog。

---

## 3. 目标领域规则

### 3.1 删除文章不等于删除发布历史

遵守 ADR 0004：发布账本是历史和防重权威来源，队列文件只是运行材料。

历史页的主动作统一命名为“移入回收站”，与不可恢复的“永久删除”明确区分。移入回收站必须检查该文章的全部发布目标，不只处理当前页面或当前平台。

删除历史文章时按发布状态处理：

| 状态 | 是否允许删除文章 | 队列 pair | 发布账本 |
| --- | --- | --- | --- |
| `queued`，attempt 匹配且 pair 未修改 | 允许 | 删除 Markdown + sidecar | 标记 `cancelled`，原因 `ARTICLE_TRASHED_BEFORE_SUBMISSION` |
| `failed`，pair 未修改 | 允许 | 清理失败队列 pair | 保留 `failed` 记录和错误码 |
| `cancelled` / `failed-cleaned` | 允许 | 无需处理 | 原样保留 |
| `published`，无活动队列 pair | 允许 | 无需处理 | 永久保留发布证据 |
| `submitting` / `submitted` | 暂时阻止 | 不删除 | 不改变；等待执行结束/核对 |
| `uncertain` | 阻止 | 不删除 | 必须先人工核对 |
| pair/sidecar/hash 冲突 | 阻止 | 不删除 | 返回明确冲突原因 |

关键不变量：成功进入回收站的文章不得仍保留可被普通 worker 执行的活动队列项。

补充规则：

- 平台批次正在运行时，只要目标文章仍为 `queued`、远端尚未开始，就允许取消该单篇文章；worker 在每次远端调用前重新检查账本和文章状态并安全跳过。
- 同一文章加入河畔、头条、付费媒体等多个目标时，预检必须覆盖全部目标。任一目标为 `submitting/submitted/uncertain/conflict`，整次选择都不可提交。
- 冲突状态不在历史页提供“强制删除”。用户只能进入独立队列修复流程，选择保留、另存或清理后再重试。

### 3.2 删除采用一次预检、一次确认和全有或全无

新接口：

```text
previewTrashArticles(selections)
  -> token
  -> articleCount
  -> queuedToCancel
  -> failedToClean
  -> blockedItems[]
  -> canCommit

trashArticles({ selections, token, confirmed: true })
  -> transactionId
  -> status: committed | pending_recovery
  -> articleCount
  -> queueActions[]
```

- token 绑定文章 ID、`publicationId + attemptId`、pair hash 和预检时间。
- 任一选中文章存在阻止项时 `canCommit=false`，整批不执行；用户取消选择阻止项后重新预检。
- 预检后任一状态变化则返回 `ARTICLE_TRASH_PREVIEW_STALE`，整批不开始。
- 用户只确认一次，确认内容明确列出文章数、按平台统计的 queued 撤销数、failed 清理数，以及发布记录继续保留。
- 开始提交前再次验证全部文章和全部目标；只有全部通过才写入删除事务并开始改变状态。
- 批量操作在产品语义上全有或全无，不返回“成功删除 5 篇、意外留下 1 篇”的普通部分成功结果。
- 恢复文章不会恢复已取消的队列项；如需投稿，用户必须重新审核/入队。

### 3.3 删除使用前向恢复事务

跨文章文件、队列 pair、批次和发布账本无法依赖单个文件系统 rename 完成原子提交，因此使用小型事务日志保证崩溃后前向恢复：

```text
确认删除
  -> 写入 removal transaction（intent + 全部身份/hash）
  -> 再次验证全部选择
  -> 撤销 queued / 清理 failed
  -> 将全部文章移入回收站
  -> 标记 committed
  -> 删除已完成事务日志
```

- 每个步骤都记录完成位置，重复执行幂等。
- 如果队列动作已经发生，不尝试重新创建队列或把 `cancelled` 倒退为 `queued`。
- 应用重启时继续完成用户已经确认的事务；恢复期间对应文章和队列不可投稿、不可再次删除。
- 遇到 hash/sidecar/attempt 冲突时停止在 `needs_repair`，不猜测、不强删，并在界面提供独立修复入口。
- 只有事务整体 `committed` 后，Renderer 才显示删除成功；`pending_recovery` 明确显示“正在恢复已确认的删除操作”。
- 事务日志只保存身份、状态、hash 和安全错误码，不保存正文、Cookie 或完整远端响应。

### 3.4 发布标题、尝试历史与回收站保留规则

发布记录新增不可变 `titleSnapshot`：

- 在该文章—目标首次入队时捕获，最大 200 个字符。
- 后续本地改名、删除或重试不得改写。
- 它表达“当时实际投稿的标题”，并与 `contentHash`、目标和尝试历史共同构成审计证据。
- 旧记录缺少标题时，在文章仍存在且身份可验证的删除预检中补齐；无法可信回填时显示“已删除文章 · ID 后六位”，不编造标题。
- 所有发布尝试永久保留，不自动压缩或删除。

永久删除只清除文章正文、可恢复副本和非必要内容；保留标题快照、文章/内容身份、目标、状态、时间、远端 ID/URL 和全部尝试。回收站默认永不自动清空，只能由用户手动永久删除。

当前真实发布账本为 7 个文件、合计约 11.85 KB、平均约 1.7 KB/记录；增加不超过 200 字符的标题快照不会形成实际容量压力。若未来达到数十万小文件并出现扫描性能问题，再单独迁移 SQLite，不在本轮提前引入数据库。

回收站继续提供只读发布详情，但不允许编辑或重新投稿：

- 可执行“恢复文章”“查看发布记录”“永久删除正文”。
- 恢复文章不恢复已经取消的队列。
- 已发布文章恢复后如需修改，必须复制为新版本。

### 3.5 阻止旧残留误发

升级后不能只修新删除操作。对 sidecar 含 `clientId + articleId` 的队列项：

- 队列扫描时检查文章是否在回收站。
- 已删除来源显示“源文章已删除，禁止投稿”，不可勾选。
- worker 在远端调用前再次检查，避免扫描后删除文章形成竞态。
- 提供“检查并清理已删除文章的队列残留”预检/确认入口。
- 修复动作只处理 `queued` 或明确 `failed` 且 pair 未修改的项目。
- 不自动处理 `submitting/submitted/uncertain`，不推断远端结果。
- 不在升级启动时静默删除真实文件；先阻止误发，再由用户确认修复。

真实工作区当前检测到的 1 个残留应通过这个入口处理，而不是手工删除文件或编辑 JSON。

### 3.6 河畔文章输入成为一个深模块

新增 `hepan-article-source` 模块，向 adapter 暴露一个小 interface：

```text
parseArticle(file)
  -> { title, contentHtml, sourceStem, sourceFormat }
```

模块 implementation 负责：

- `.md` / `.markdown`：第一个 H1 或第一个非空行作为标题；正文转换为 HTML。
- `.txt`：第一非空行作为标题；正文按段落转成安全 HTML。
- `.docx`：保持现有 Python DOCX 解析兼容路径，避免本轮改变既有版式。
- UTF-8 BOM、CRLF、空标题、空正文、超大文件和非法扩展的稳定错误。
- Markdown 原始 HTML默认关闭，链接协议受限，避免把任意脚本带入远端文章。

Markdown 转换建议使用一个固定版本、Node 侧随安装包发布的解析依赖（例如 `markdown-it`，`html: false`），而不是要求用户额外安装新的 Python 包。新增依赖必须锁定版本、检查许可证并通过安装包依赖验证。

### 3.7 Node 负责文档解析，Python 只负责河畔 POST

对于 Markdown/TXT：

```text
hepan adapter
  -> parseArticle()
  -> 随机临时 payload JSON
     { title, contentHtml, sourceStem }
  -> hepan_publish.py --payload-path ...
  -> 图片上传 + requests.post
  -> finally 删除 payload
```

这样可以：

- 在不依赖本机 Python 的普通 Node 测试中完整验证 Markdown 解析。
- 避免把长正文放进命令行参数、日志或进程列表。
- 保留 Python 现有 Cookie、图片上传和 POST 实现。
- 让 DOCX 继续使用 `--article`，降低兼容风险。

临时 payload 必须位于应用本地临时目录，使用不可预测文件名，只允许普通文件，任务成功、失败、停止和异常退出都尽力清理；不得写入可迁移内容库或日志。

### 3.8 发布间隔的精确定义

新增河畔应用配置：

```text
publishIntervalSeconds: integer
默认：30
范围：0–3600
```

- `0` 表示不增加额外等待，界面显示频率风险警告。
- 间隔从一次河畔远端调用完成时开始，到下一次河畔远端调用开始时结束。
- 第一篇之前和最后一篇之后不等待。
- 明确失败或 uncertain 也算已经发生远端调用，下一篇前仍需等待。
- 在远端调用前停止/跳过的任务不启动间隔计时。
- 混合平台任务只限制河畔到河畔；其他平台执行耗时可以抵扣已过去的河畔间隔。
- 本计划提供统一的“每两篇河畔文章之间的间隔”，不提供每篇文章不同的定时发布时间。

配置中心提供常用值（10/30/60 秒）和自定义秒数；投稿确认区显示本批河畔文章数、配置间隔和预计最少等待时间。

### 3.9 等待必须可停止、可观察、可测试

platform workbench 的 interface 增加目标级策略，而不是河畔专用 `sleep` 散落在循环中：

```js
submitSelectedPlanSerially(plan, {
  intervalByTargetMs: { hepan: 30000 },
  now,
  wait,
  shouldStop,
  onTaskState
})
```

- `now` 和 `wait` 可注入，测试使用假时钟，不真实等待 30 秒。
- 等待状态发出 `waiting-interval`、`waitRemainingMs` 和下一任务摘要。
- 停止请求在等待中最多 250ms 内生效，不会启动下一次 POST。
- 等待期间下一任务仍为 `queued`，不能提前标成 `submitting`。
- 设置在批次启动时快照；运行中配置中心继续只读，修改只影响下一批。

### 3.10 固定总超时改为进度 watchdog

移除“整批固定 120 秒”的总时限，改为：

- worker 每次任务状态或等待心跳都刷新 liveness。
- 等待倒计时属于正常进度，不触发超时。
- 单次 Python/远端调用仍有独立上限。
- 长时间无状态、无心跳才判定 worker 卡死。
- 用户停止与 watchdog 超时必须区分错误码。

否则 5 篇文章、30 秒间隔就可能越过现有 120 秒上限。

---

## 4. 分阶段实施任务

### Task 0：建立正式红色回归测试

**Create：**

- `tests/article-trash-submission-lifecycle.test.js`
- `tests/hepan-article-source.test.js`
- `tests/hepan-publish-contract.test.js`
- `tests/hepan-publish-interval.test.js`

**Modify：**

- `tests/article-trash-service.test.js`
- `tests/platform-workbench-service.test.js`
- `tests/desktop-task-service.test.js`
- `tests/renderer-article-history.test.js`
- `scripts/verify.js`

实施：

- [ ] 将本次临时 3 项诊断固化为正式测试，先确认旧实现失败。
- [ ] 使用真实 article store、真实 submission service、真实 trash 入口验证删除到队列的跨模块 seam。
- [ ] 覆盖批量全有或全无：任一文章有 `submitting/uncertain/conflict` 时，全部文章、队列和账本都不改变。
- [ ] 在删除事务的每个阶段注入崩溃，重启后断言前向恢复最终完成且不重建队列。
- [ ] 覆盖运行中批次取消尚未远端开始的单篇文章，断言 worker 永不调用该目标。
- [ ] 覆盖首次入队标题快照不可变、永久删除后仍可读、全部 attempts 保留。
- [ ] 覆盖回收站不自动过期、恢复不恢复队列和只读发布详情。
- [ ] 固定“回收站文章仍在队列时不可执行”的 worker 前置保护测试。
- [ ] Markdown fixture 覆盖标题、段落、列表、链接、中文、BOM、CRLF 和原始 HTML 禁用。
- [ ] TXT 和 DOCX 兼容测试分别锁定。
- [ ] 间隔测试使用假时钟，覆盖 0、10、30、3600 秒而不发生真实等待。
- [ ] 记录红色失败输出后再进入实现。

### Task 1：共享投稿生命周期模块

**Modify：**

- `desktop/main.js`
- `desktop/services/content-submission-service.js`
- `src/content/submission-batch-store.js`
- `src/content/submission-export-service.js`
- `src/publication/publication-ledger.js`
- `src/publication/publication-ledger-store.js`
- `desktop/ipc/content-submission-ipc.js`
- `tests/content-submission-batch.test.js`
- `tests/article-trash-submission-lifecycle.test.js`
- `tests/publication-ledger-store.test.js`

实施：

- [ ] 在 main 中只创建一个共享 `contentSubmissionService`，同时注入投稿 IPC 和文章删除协调逻辑。
- [ ] 增加按 `clientId + articleId` 查找所有批次项目的受控 interface。
- [ ] 查询必须覆盖文章的全部普通平台和付费媒体目标，不按当前 UI 平台过滤。
- [ ] 复用 `publicationId + attemptId`、sidecar 和内容哈希判断是否可取消/清理。
- [ ] 实现 `previewArticleRemovalImpact()` 和 `applyArticleRemovalImpact()`，不向调用方暴露真实文件路径。
- [ ] 对 queued 使用现有 cancel 语义；对 failed 使用现有 cleanup 语义。
- [ ] queued 即使位于运行中批次，只要远端尚未开始也可按单篇取消；worker 调用 adapter 前必须重新检查。
- [ ] 发布记录增加最大 200 字符的不可变 `titleSnapshot`，首次 reserve 捕获，所有 attempts 永久保留。
- [ ] 旧记录在文章身份可信且正文仍存在时补齐标题；无法可信补齐则保持 null，不编造内容。
- [ ] 多批次、多平台、重复调用保持幂等。
- [ ] 禁止页面或 trash 模块自行扫描/删除平台目录。

### Task 2：将文章删除升级为协调操作

**Create：**

- `src/content/article-removal-service.js`
- `src/content/article-removal-transaction-store.js`

**Modify：**

- `src/content/article-trash-service.js`
- `desktop/services/ai-content-service.js`
- `desktop/ipc/ai-content-ipc.js`
- `desktop/preload.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `tests/article-trash-service.test.js`
- `tests/article-trash-submission-lifecycle.test.js`

实施：

- [ ] 增加删除影响预检和一次性 token。
- [ ] token 绑定文章选择、队列 attempt 和 pair hash，并设置短有效期。
- [ ] 预检任一阻止项即 `canCommit=false`；执行前任一状态变化即整批拒绝，不能产生普通部分成功。
- [ ] 写入 removal transaction 后才开始改变队列/账本，并按“全部队列动作 -> 全部文章入回收站 -> commit”推进。
- [ ] 每个阶段可重复执行；应用启动恢复未提交事务，已经 cancelled 的 attempt 不倒退、不重建队列。
- [ ] 冲突事务进入 `needs_repair`，历史页不提供 force delete。
- [ ] 只有 committed 才返回整体成功；崩溃/中断返回 `pending_recovery` 并继续前向恢复。
- [ ] 更新旧测试：保留发布记录，但不再要求保留可取消的活动队列 pair。
- [ ] 恢复文章时明确返回“队列未恢复”状态。
- [ ] 永久删除正文和可恢复副本，但保留 titleSnapshot、最小 tombstone、发布记录和全部 attempts。
- [ ] 不实现回收站自动到期或自动清空。

### Task 3：更新历史文章删除体验

**Modify：**

- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- `media-workbench/src/types.ts`
- `media-workbench/src/electron-api.ts`
- `tests/renderer-article-history.test.js`
- `tests/renderer-history-editor-flow.test.js`

实施：

- [ ] 历史页主按钮从“删除历史文章”改为“移入回收站”；“永久删除”只在回收站出现。
- [ ] 点击后展示：文章数、按平台统计的 queued 撤销项、failed 清理项和阻止项。
- [ ] 确认文案说明“一次确认将移入回收站并联动全部发布目标；发布记录继续保留”；移除旧说明。
- [ ] 有 submitting/submitted/uncertain/conflict 时列出平台和原因，整批阻止；用户取消选择风险文章后重新预检。
- [ ] 成功后刷新历史、批次摘要、发布摘要和平台队列计数。
- [ ] 回收站恢复提示“恢复文章不会重新加入投稿队列”。
- [ ] 回收站显示不可变标题快照和只读发布详情，只提供恢复、查看记录、永久删除正文。
- [ ] `pending_recovery` 显示事务恢复状态；错误和修复入口在操作区就近显示并可聚焦。

### Task 4：保护并修复已存在的删除后队列残留

**Modify：**

- `desktop/services/platform-workbench-service.js`
- `desktop/services/content-submission-service.js`
- `src/content/article-store.js`
- `desktop/ipc/content-submission-ipc.js`
- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- 对应 preload/electron-api/types
- `tests/article-trash-submission-lifecycle.test.js`
- `tests/submission-batch-worker-integration.test.js`

实施：

- [ ] 根据 sidecar 身份判断源文章是否在回收站，不通过文件名猜测。
- [ ] 平台队列返回 `sourceArticleState: trashed` 和稳定 reason code，Renderer 禁止选择。
- [ ] worker 在 `before-remote` 前再次检查，发现 trashed 时绝不调用 adapter。
- [ ] 增加残留修复预检/确认接口，安全取消 queued、清理 failed。
- [ ] 对 submitting/submitted/uncertain/冲突 pair 只报告，不自动更改。
- [ ] 冲突项不提供历史页强删；独立修复流程提供打开文件夹、保留、另存或确认清理。
- [ ] 修复重复运行保持幂等；真实工作区的 1 个残留只在用户确认后处理。

### Task 5：新增河畔文章输入模块

**Create：**

- `src/platforms/hepan/article-source.js`
- `tests/hepan-article-source.test.js`

**Modify：**

- `src/platforms/hepan/adapter.js`
- `package.json`
- `package-lock.json`
- 安装包依赖/许可证验证脚本（按仓库现有机制）

实施：

- [ ] 扫描 `.md/.markdown/.txt/.docx`，排除 sidecar、临时文件和符号链接。
- [ ] Markdown 解析关闭原始 HTML，限制危险 URL scheme。
- [ ] TXT 转义 HTML，并保留段落/换行。
- [ ] 输出统一的标题、HTML、source stem 和 format。
- [ ] 空标题、空正文、非法编码、超限文件返回稳定 `HEPAN_ARTICLE_*` 错误。
- [ ] adapter 改为 factory + 默认实例，允许测试注入 fs、runner 和临时目录。
- [ ] DOCX 继续走现有 Python 路径，先不改写其排版实现。

### Task 6：扩展 Python POST payload 合同

**Modify：**

- `src/platforms/hepan/adapter.js`
- `src/platforms/hepan/hepan_publish.py`
- `tests/hepan-publish-contract.test.js`
- `tests/hepan-provider-settings.test.js`

实施：

- [ ] Python 新增 `--payload-path`，严格读取 `{title, contentHtml, sourceStem}`。
- [ ] 校验 payload 普通文件、JSON shape、标题/正文长度和空值。
- [ ] Markdown/TXT 使用 payload；DOCX 继续支持 `--article`。
- [ ] 图片匹配使用安全的 source stem，不信任 payload 中的路径。
- [ ] adapter 用随机本地临时文件传递正文，`finally` 清理。
- [ ] fake runner 在文件存在时读取 payload，断言标题/正文正确，结束后断言文件消失。
- [ ] Python 错误只返回稳定错误码/安全消息，不在日志回显正文、Cookie 或 payload 路径。
- [ ] 保留现有 POST 字段、Cookie、category ID、图片上传和 published/uncertain 判定。

### Task 7：增加河畔发布间隔配置

**Modify：**

- `desktop/services/platform-settings/hepan-settings-adapter.js`
- `desktop/services/platform-settings-service.js`（仅在通用 schema 支持需要时）
- `media-workbench/src/components/settings/HepanProviderSettings.tsx`
- `media-workbench/src/types.ts`
- `tests/hepan-provider-settings.test.js`
- `tests/hepan-settings-patch-contract.test.js`
- `tests/renderer-responsive-layout.test.js`

实施：

- [ ] schema 增加 `publishIntervalSeconds`，整数 0–3600，默认 30。
- [ ] safe status 返回间隔，不返回其他受保护配置。
- [ ] 旧配置缺字段时读取为默认 30，不要求用户重输 Python/Cookie，不破坏 patch 保存语义。
- [ ] 环境配置支持 `HEPAN_PUBLISH_INTERVAL_SECONDS`；应用配置被环境覆盖时保持只读。
- [ ] 配置中心提供预设和自定义输入，0 秒显示风险警告。
- [ ] 保存/测试不混淆：间隔只需本地校验，测试登录不发生等待或 POST。

### Task 8：实现目标级可取消节流

**Modify：**

- `desktop/services/platform-workbench-service.js`
- `desktop/services/desktop-task-service.js`
- `desktop/worker/run-task.js`
- `src/core/stop-signal.js`（仅在等待取消需要时）
- `tests/hepan-publish-interval.test.js`
- `tests/platform-workbench-service.test.js`
- `tests/desktop-task-service.test.js`

实施：

- [ ] desktop task 从河畔 runtime 快照间隔并传为 `intervalByTargetMs.hepan`。
- [ ] workbench 根据上一次同目标远端结束时间计算剩余等待。
- [ ] 注入 `now/wait/shouldStop`，自动化测试使用假时钟。
- [ ] 等待期间发出倒计时状态；停止最多 250ms 生效。
- [ ] skipped-before-remote 不计时，failed/uncertain/published/submitted 均计时。
- [ ] mixed target 只节流河畔；已过去时间抵扣等待。
- [ ] 设置只在批次启动时读取一次，运行中不会漂移。
- [ ] 替换固定 120 秒整批 timeout 为进度 watchdog，保留单次远端调用上限。

### Task 9：投稿确认与运行反馈

**Modify：**

- `media-workbench/src/components/PlatformWorkbench.tsx`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/types.ts`
- `desktop/ipc/platform-ipc.js`
- `desktop/preload.js`
- Renderer 平台投稿测试文件

实施：

- [ ] 选择河畔目标时显示当前间隔和预计最少等待总时长。
- [ ] 确认弹层明确“第一篇立即执行，后续河畔文章间隔 N 秒”。
- [ ] 运行时显示“等待下一篇河畔文章：N 秒”，与正在 POST 区分。
- [ ] 等待时允许停止；停止后不启动下一篇。
- [ ] 0 秒设置在确认区再次显示频率风险。
- [ ] 队列中 sourceArticleState=trashed 的项目不可勾选并提供修复入口。

### Task 10：文档、全量验证和打包验收

**Modify：**

- `docs/content-generation-operations.md`
- `docs/platform-workbench-react-ui.md`
- `docs/clean-machine-installation.md`
- `docs/alpha-packaging-checklist.md`
- `scripts/verify.js`

实施：

- [ ] 记录删除文章对 queued/failed/uncertain/published 的不同影响。
- [ ] 记录“移入回收站”整批全有或全无、一次确认、全发布目标联动和事务恢复语义。
- [ ] 记录恢复文章不会恢复投稿队列。
- [ ] 记录永久删除仍保留不可变标题快照、最小发布账本和全部尝试；回收站默认不自动清空。
- [ ] 记录冲突队列只能进入独立修复流程，历史页没有强制删除。
- [ ] 记录河畔支持 `.md/.markdown/.txt/.docx` 及 Markdown 安全限制。
- [ ] 记录发布间隔默认值、范围、环境变量和 0 秒风险。
- [ ] 验证新 Node 依赖被正确打包且许可证可接受。
- [ ] 正式候选从 clean commit 构建并执行第 7 节验收矩阵。

---

## 5. 建议提交顺序

1. `test: reproduce article trash queue drift and Hepan pacing gaps`
2. `feat: preserve immutable publication title snapshots`
3. `fix: coordinate all-target article removal with submission lifecycle`
4. `fix: make article removal all-or-none and crash recoverable`
5. `fix: block and repair queues whose source article is trashed`
6. `feat: normalize Markdown and text for Hepan publishing`
7. `feat: pass safe article payloads to the Hepan POST script`
8. `feat: configure cancellable Hepan publication intervals`
9. `fix: replace platform batch timeout with progress watchdog`
10. `feat: surface trash transactions and Hepan pacing in the renderer`
11. `docs: document Hepan formats pacing and deletion semantics`

每个提交只包含对应实现和测试，不顺手格式化无关文件，不修改真实工作区数据。

---

## 6. 自动化验证命令

### 6.1 专项测试

```powershell
node --test `
  tests/article-trash-service.test.js `
  tests/article-trash-submission-lifecycle.test.js `
  tests/content-submission-batch.test.js `
  tests/submission-batch-worker-integration.test.js `
  tests/hepan-article-source.test.js `
  tests/hepan-publish-contract.test.js `
  tests/hepan-publish-interval.test.js `
  tests/hepan-provider-settings.test.js `
  tests/hepan-settings-patch-contract.test.js `
  tests/platform-workbench-service.test.js `
  tests/desktop-task-service.test.js `
  tests/renderer-article-history.test.js `
  tests/renderer-history-editor-flow.test.js `
  tests/renderer-responsive-layout.test.js
```

### 6.2 全量验证

```powershell
npm run build:renderer
npm test
npm run verify
```

### 6.3 打包验证

```powershell
npm run pack:alpha
```

最终发布候选必须来自 clean commit。诊断或自动化测试不得读取真实 Cookie、向远端 POST 或清理 `F:\1`。

---

## 7. 打包版手工验收矩阵

所有写操作先复制到专用测试工作区。真实蓝色河畔 POST 只在用户明确批准的测试账号/栏目中使用无敏感内容的测试文章执行一次。

| 场景 | 操作 | 期望结果 |
| --- | --- | --- |
| 删除 queued 文章 | 已审核文章加入 hepan 后点击“移入回收站” | 一次预检/确认；Markdown/sidecar 消失，账本为 cancelled，文章进回收站 |
| 多平台删除 | 同一文章加入多个普通平台/付费媒体目标后移入回收站 | 检查全部目标；所有安全 queued pair 一并撤销；记录按目标保留 |
| 运行批次取消单篇 | worker 正处理其他文章，目标文章仍 queued 时移入回收站 | 允许取消；worker 二次检查后跳过该篇，不调用远端 |
| 批量全有或全无 | 选择 3 篇，其中 1 篇为 uncertain | 预检整批阻止；3 篇文章、全部队列和账本均不改变 |
| 删除 failed 文章 | 明确失败后删除 | 清理未修改 pair；账本仍为 failed |
| 删除 submitting | POST 正在执行时删除 | 明确阻止，不删除文章或队列，不伪造结果 |
| 删除 uncertain | 结果待确认时删除 | 明确阻止并引导人工核对 |
| pair 被修改 | 手改测试队列 Markdown 后删除 | 整批阻止，不提供强删；可进入独立修复流程 |
| 删除事务崩溃 | 分别在写事务、撤销队列、移动首篇文章后模拟崩溃 | 重启后前向完成已确认的整批删除，不重建 cancelled 队列 |
| 恢复文章 | 从回收站恢复 | 文章恢复；不会自动重新入队 |
| 回收站发布详情 | 打开已发布文章的回收站记录 | 显示不可变标题和只读发布详情，不允许编辑/投稿 |
| 永久删除 | 永久删除已发布文章正文 | 正文和可恢复副本消失；标题快照、目标记录、远端链接和全部 attempts 保留 |
| 回收站保留 | 调整系统日期或长期不操作 | 不自动清空，只有用户手动永久删除才移除正文 |
| 标题快照 | 首次入队后修改本地标题再删除 | 发布记录仍显示首次入队标题，最大 200 字符，不被后续改名覆盖 |
| 旧残留保护 | 加载“文章已删除但队列仍在”fixture | 队列标记禁止投稿，worker 不调用远端 |
| 旧残留修复 | 点击检查并清理 | 预检后安全取消/清理；重复执行幂等 |
| Markdown 投稿 | 含标题、段落、列表、链接的 `.md` | 预览标题正确、正文非空；测试 POST 版式可读 |
| Markdown 安全 | `.md` 含 script/raw HTML/危险 URL | 不把危险 HTML/协议发送到远端 |
| TXT 投稿 | UTF-8 中文 `.txt` | 第一行标题、后续正文正常发布 |
| DOCX 回归 | 使用既有 DOCX fixture | 标题、正文和图片行为不退化 |
| 单篇河畔 | 间隔设 30 秒但只发 1 篇 | 第一篇立即执行，无多余等待 |
| 多篇河畔 | 间隔设 10 秒发 3 篇 | POST 起点间隔符合定义；UI 显示倒计时 |
| 0 秒间隔 | 配置 0 秒 | 保存成功并显示风险；确认后不增加等待 |
| 停止等待 | 倒计时中点击停止 | 250ms 内停止等待，不启动下一次 POST |
| mixed target | 河畔与其他平台混合 | 只约束河畔到河畔，其他平台不被无条件 sleep |
| 长间隔 | 3 篇、间隔 60 秒 | 正常完成/可停止，不被固定 120 秒总超时杀死 |
| 旧河畔配置 | 升级前配置没有间隔字段 | 自动使用默认 30 秒，Python/Cookie/vendor/category 不变 |

---

## 8. 完成标准

- [ ] 三项原始红色反馈测试在修复后全部转绿。
- [ ] 成功删除的历史文章不再留下可执行的 queued/failed 队列 pair。
- [ ] “移入回收站”只需一次影响确认，并联动文章的全部发布目标。
- [ ] 批量操作全有或全无；任一阻止项出现时没有文章、队列或账本被改变。
- [ ] 已确认删除具有持久事务，任一阶段崩溃后可前向恢复且不重建 cancelled 队列。
- [ ] 发布账本和批次记录仍完整，首次入队标题快照不可变，全部 attempts 永久保留。
- [ ] 永久删除只移除正文/可恢复副本；回收站不自动清空，并保留只读发布详情。
- [ ] 运行中批次的 queued 单篇可以安全取消，worker 在远端前二次检查并跳过。
- [ ] 冲突队列只能进入独立修复流程，历史页不存在强制删除。
- [ ] 已存在的“删除后残留”默认禁止投稿，并有显式、安全、幂等的修复入口。
- [ ] 应用生成的 Markdown 能完整形成河畔标题和非空 HTML 正文。
- [ ] TXT 可用，DOCX 行为无回归，危险 Markdown HTML 不被透传。
- [ ] 配置中心可以设置 0–3600 秒的统一河畔文章间隔，默认 30 秒。
- [ ] 等待只发生在相邻河畔远端调用之间，失败/uncertain 后也节流。
- [ ] 等待可停止、可观察，长批次不受 120 秒整批超时影响。
- [ ] 专项测试、全量测试、Renderer build、verify 和打包验收全部通过。
- [ ] 安装包不包含真实 Cookie、临时 payload、真实正文或工作区队列。

---

## 9. 非目标与数据保护

- 不在本计划中改变蓝色河畔远端栏目、账号、Cookie 获取方式或 POST 业务字段。
- 不把文章删除解释为删除发布账本；审计记录和重复发布保护必须保留。
- 不删除或压缩历史发布 attempts，不在永久删除时移除不可变标题快照。
- 不实现回收站自动过期、30 天清理或后台静默清空。
- 不允许历史文章页面绕过冲突预检强制删除队列文件。
- 不自动清理 submitting/submitted/uncertain 或已修改的真实队列文件。
- 不在升级启动时静默删除 `F:\1` 中已经存在的 1 个残留；先阻止误发，再由用户确认。
- 不自动恢复、重试或重新入队任何失败/取消的文章。
- 不在日志、IPC DTO、错误信息或命令行参数中暴露正文、Cookie 或完整临时 payload。
- 不要求用户为了 Markdown 支持额外安装新的 Python Markdown 包。
- 不提供每篇文章不同的预约发布时间；本轮提供的是河畔文章之间统一可调的节流间隔。
- 不把发布间隔错误地应用到付费媒体、头条、猎局或 AI 生成任务。
- 不在自动化测试中触发真实蓝色河畔 POST。
