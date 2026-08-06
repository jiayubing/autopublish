# 06 — 统一文章编辑、改投与回收权限

**What to build:** 用一个集中策略决定文章能否编辑、入队、改投和回收，保证一篇文章最多一个活动发布目标，首次成功后永久只读。

**Blocked by:** 04 — 扩展 SQLite 生命周期与队列事实；05 — 移除审核与生成来源投稿门槛

**Status:** ready-for-agent

## 启动约定

- 确认 04 已提供原子活动目标约束，05 已停止使用审核决定资格。
- 先建立文章事实到编辑/入队/改投/回收权限的完整决策表，并覆盖当前发布、订单、删除事务和结果不确定事实。

## 执行过程

1. 以 `article-lifecycle-projection.js` 作为公开权限 owner 建立集中文章操作策略，输入只读事实，按动作输出 `operations.edit|queue|retarget|trash = { allowed, reasonCodes, safeMetadata }`；展示文案仍由投影边界映射。允许提取内部纯策略模块，但不得形成第二个公开 owner 或第二套事实归一化路径。
2. 区分新文章首次持久化、用户修改既有文章和迁移/恢复内部写入，并使用不同命令边界。编辑器读模型在持久化 article DTO 之外返回服务端签发的不透明 `editFingerprint`；既有文章保存请求必须携带 `expectedFingerprint`，成功响应返回新的 `editFingerprint`，stale save 统一返回 `ARTICLE_EDIT_CONFLICT` 和不含正文/路径的安全 metadata，并要求调用方刷新后再编辑。fingerprint 不写入文章正文文件，Renderer 不自行计算或解释。新建命令不得覆盖已有身份；迁移/恢复内部写入口不暴露给 Renderer。所有用户可达写入口使用同一编辑守卫，队列等待、远端执行、活动订单、不确定结果和发布成功都拒绝写入；底层 article store 只负责持久化，不反向依赖 OperationalStore。
3. 统一活动目标授权与存储冲突规范化，但不公开可任意解冻文章的通用 `release`。`PUBLICATION_DUPLICATE`、`PUBLICATION_TARGET_CONFLICT` 映射为 `ARTICLE_ACTIVE_TARGET_CONFLICT`，`PUBLICATION_UNCERTAIN` 保持为对应 queue/retarget 动作的 `PUBLICATION_UNCERTAIN`。活动目标只能由携带 owner identity、expected current target 和明确终态证据的转换命令收口；持久化不变量继续由 OperationalStore 门面拥有。
4. 回收预检只允许未发布且没有活动队列、订单或不确定结果的文章；永久删除仍遵守最小审计保留。
5. 将权限结果接入文章管理投影、编辑器和命令端口，删除 Renderer 自行组合锁定条件。
6. 在应用层建立窄的 article mutation coordinator，向调用方暴露保存既有文章、为当前发布执行授权活动目标和回收等明确命令，内部隐藏共享锁、事实重读、策略复核和副作用顺序。锁 key 固定为 `clientId + articleId`；coordinator 是跨 article store 与 OperationalStore 业务变更的唯一文章级锁 owner。重构 article store 当前内部锁接缝，使 coordinator 通过仅供该协调边界使用的窄 mutation session 完成已加锁读取、CAS 替换或回收，禁止外层锁再次调用会自行取得同一锁的 `saveArticle/getArticle/moveArticleToTrash`，也禁止公开通用 callback 或无锁写方法。先取得可跨进程恢复的文章锁，再读取正文和运行事实并复核策略；需要写 SQLite 时只在锁内开启短事务，持有 SQLite 事务时不得等待文件锁，锁内不得远端调用。现有 `publication-workflow/execution.js` reserve 路径必须在任何远端调用前接入同一 coordinator。busy/timeout 统一映射为安全稳定错误；若副作用已提交但释放锁失败，返回不可自动重放、要求刷新/人工核对的稳定错误，不得伪装为确定未执行。覆盖进程崩溃后的陈旧锁恢复。

## 职责边界

- 操作策略只做业务决策，不执行写入；`article-lifecycle-projection.js` 保持公开权限 owner，内部策略若被提取只能由该 owner 组合和暴露。
- article mutation coordinator 是编辑、活动目标授权和回收竞态的应用层协调 owner；共享锁端口只注入该协调器，不把锁对象、SQLite 事务或通用 callback seam 暴露给各调用方。Renderer 预检和按钮禁用都不是授权。
- article store 保留文章文件原子替换和崩溃恢复职责，但不得与 coordinator 竞争同一业务锁；新建文章等不跨运行事实的内部路径必须使用明确的 creation port，并继续具有身份冲突和文件原子性保护。
- 活动目标所有权属于运行状态存储，不写入文章正文文件。
- 回收服务执行删除协议，但必须使用统一策略决定是否允许。
- 普通平台队列用例拥有选择验证，并通过 07 的单个 SQLite admission/removal 组合端口原子改变活动目标与队列项；网站媒体应用服务通过 12 的付费批次确认组合端口原子改变活动目标与批次事实。二者消费同一权限决策，但不得分别调用通用 claim/release 拼接一致性。

## 架构硬门槛

- 操作策略保持纯函数；每个动作返回自己的稳定 reason code 和安全 metadata，命令拒绝直接消费该动作的首要 code，Renderer 只展示同一动作投影，不把中文展示文案或持久化副作用放进策略。
- 不把所有事实塞入一个可变 article 对象；使用明确的 article、queue、publication、order、removal facts。
- 以职责内聚、接口深度、依赖方向、变更局部性和公开接口可测试性验收模块；不得为缩短文件拆出透传层、重复映射或分散同一不变量。既有删除协调器只通过稳定端口接入权限，不在其中新增平行状态机。
- 并发正确性由文章级跨进程锁、正文 CAS、数据库约束和事务复核共同保证；所有路径遵循相同锁顺序，不依赖界面禁用按钮或轮询重试。

## Acceptance criteria

- [ ] 当前 `publication-workflow/execution.js` 的活动目标授权成功即冻结文章；合成等待队列、活动订单、不确定和已发布事实的策略/命令测试均拒绝修改。07/12 的真实 admission 接线与端到端冻结回归由对应 ticket 验收，不作为 06 的完成前置条件。
- [ ] 一篇文章在并发请求下也最多只有一个活动发布目标。
- [ ] 编辑读模型返回 `editFingerprint`，既有保存必须提交 `expectedFingerprint`，保存成功返回下一 fingerprint；两个编辑会话的 stale save 被 `ARTICLE_EDIT_CONFLICT` 拒绝，Renderer 不计算 fingerprint。
- [ ] 跨进程 save/target、嵌套锁防回归、锁释放故障和陈旧锁恢复测试证明当前生产路径使用同一协调 seam；已提交但释放失败不会被报告为确定未执行或被自动重放。
- [ ] 明确失败、取消或退稿且无其他阻塞事实时恢复编辑和改投。
- [ ] 任意可信发布成功后文章永久禁止编辑、再次入队、改投和回收，售后退款不解除。
- [ ] 权限和锁定原因在主进程命令与 Renderer 展示中一致。
- [ ] 交接记录提供决策矩阵、edit fingerprint 读写合同、文章级协调边界、锁顺序、当前生产写入口接线表、留待 07/12 的消费端口和测试、并发测试，以及显著规模变化和不拆分理由。

## Non-goals

- 不实现具体普通平台队列组或付费批次执行。
- 不替 07 定义或接线普通平台单目标队列命令，不替 12 建立付费确认流程；07/12 各自拥有其运行事实的事务化组合端口。
- `restore`、`permanentDelete` 不属于本 ticket 的动作集合，其完整规则由 22 收口；本 ticket 只保证现有入口不能绕过已发布或活动事实保护。
- 不执行完整历史迁移。
