# 19 — 列举网 HTTP-primary 图文投稿适配

**What to build:** 在不改变既有公开 `PreparedSubmission` / outcome 合同的前提下，将列举网正常投稿收敛为“独立 HTTP Session 优先、Playwright 仅在提交边界前保底”；消费 Ticket 18 的随机 image plan，以一次 `multipart/form-data` 提交平台派生纯文本正文和可成功处理的图片。任意图片失败只减少最终图片数量，全部失败自动纯文本，正文投稿优先。

**Blocked by:** 18 — 普通平台随机配图准备

**Status:** `PARTIAL`；19-0～19-G 本地 implementation、combined audit、bounded re-audit、最终 clean-HEAD gate 与 evidence 已完成；独立 HTTP multipart POST 的真实带图验收仍需本次单独授权，保持 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`

**Scheduling gate:** Wave 12 `COMPLETE` 后，必须由用户对列举网单独明确授权真实能力探索并得到 `SUPPORTED`。`UNSUPPORTED` / `INCONCLUSIVE` 不创建实施线程且图片入口保持关闭。探索授权不等于实施期真实发布授权；adapter 合并后的真实带图验收需再次单独授权。

**内部串行顺序:** `19-0 → 19-A → 19-B → 19-C → 19-D → 19-E → 19-F → 19-G`。每个包必须从上一包已验证的 clean integration HEAD 开始，不得并行修改共享 adapter / session owner。

## 已冻结探索事实（2026-08-15）

1. 用户已对列举网本次真实图文能力探索和一次真实发布明确授权。真实文章以图文形式发布成功，返回明确“发布成功”和可解析的详情 URL / remote ID；详细 evidence 见 `handoffs/thread-6-lieju-http-transport-exploration-20260814.md`。
2. 真实表单是 `POST multipart/form-data`，正文、联系人、隐藏字段和 `local_fileN` 图片文件在同一次 POST 中提交；未观察到独立图片上传 API。
3. `photodb[1]` 保持空值时图片仍真实落地；页面声明单图上限 1 MB，当前账号脚本声明最多 4 张。Ticket 18 可给出 5 张候选，列举网 adapter 只能把实际可交付的前 0–4 张纳入最终 manifest。
4. 图片由列举网转存至其图片域名，并位于正文外的平台图集槽；`layoutSlot` 表示图集内 0-based 顺序，不伪造正文内嵌位置。
5. 文章 2211 字正文全部落地，详情页默认折叠不是截断；但列举网不解析 Markdown，`**...**` 会原样显示。
6. 使用 AutoPublish 已保存 `storageState` 的独立 Playwright `APIRequestContext` 已在不启动浏览器的情况下完成会员页、城市目录和焦作投稿页三次 GET；登录态、城市解析和表单字段均验证成功，未 POST、未上传、未回写 state。
7. 列举网 HTML 当前使用 GBK 编码。实现必须根据 HTTP `Content-Type` 和 HTML charset 正确解码；不得假定 UTF-8。
8. 当前证据足以将列举网真实 multipart 图文能力定为 `SUPPORTED`，但独立 `APIRequestContext` 的真实 POST 仍须在实施后获得新的单次真实发布授权；浏览器原生 form POST 成功不得伪写为独立 HTTP client 已验收。

## 冻结产品与传输决策

1. 普通投稿 UI 不暴露逐篇 HTTP / Playwright 选择器。列举网默认为 `auto`：独立 HTTP Session 优先；只保留平台级 `playwright_only` 紧急开关，不建立文章级 transport 状态。
2. 正常 HTTP 路径使用独立 `APIRequestContext` 加载 AutoPublish 专用 `storageState`，不启动 Chromium。只有首次登录、Session 明确失效或 HTTP 准备阶段明确不兼容时才进入浏览器路径。
3. 一个账号的 `storageState` 只允许一个 writer。HTTP 与浏览器 Session 不得并发回写同一文件；有效 HTTP 响应产生的 Cookie 更新必须在账号专用互斥边界内原子保存。Cookie / Token / state 原文不得进入日志、DTO 或 evidence。
4. 城市规则由列举网 adapter 内唯一纯决策 owner 持有：城市目录当前入口为投稿页“切换城市”提供的 `https://www.lieju.com/city.php?post=239`；对去除首尾空格的客户城市按 DOM 顺序做现有语义的模糊匹配（城市链接文本包含配置值），取第一个匹配；无匹配回退北京。空城市仍按既有公开合同拒绝为客户档案不完整。
5. 城市 URL 必须是 HTTPS、hostname 精确为 `post.lieju.com`、pathname 符合 `/{numericCityId}/239`。GET 目标投稿页后，`postdb[zone_id]` 统一选择最后一个非空 option；不建立“其他”文本特例和静态城市 ID 真源。
6. HTTP 和 Playwright 必须消费同一份已冻结的城市 / 区域决策，不得各自重新解析并产生分歧。
7. 只有 HTTP POST **尚未调用**时才允许转 Playwright 保底。一旦调用 POST，超时、断线、解码失败、结果缺失或任何无法确认的异常都必须进入 `uncertain`，不得启动 Playwright 再发一次。HTTP 客户端 `maxRetries=0`，不跟随未验证重定向。

## HTTP form 与 payload 安全规则

1. parser 只能选中已验证 action 的真实投稿 form，并按 HTML successful-controls 语义收集启用且应提交的 control。不得扫描整页源码，不得把 `<script>` / 模板字符串 / 隐藏的未选推广选项当作 payload。
2. 保留真实隐藏字段的当次 GET 值，但始终视为不透明临时数据。不缓存跨表单重用，不推导、不改写、不持久化、不记录值。
3. 付费推广 checkbox / radio 默认未选且不进入 multipart。本 Ticket 不得因解析顺序、默认 value 或页面模板而产生付费副作。
4. 图片 control 仅使用实际存在的 `local_file1..N`，同一个冻结 manifest 顺序映射到连续文件槽。不提交脚本内未实例化模板槽，不超过页面当次声明的最大槽位数。
5. 请求 body、文件 buffer / stream、Cookie、联系方式、完整 HTML 和远端原始异常均不得进入诊断。只允许记录稳定 code、阶段、状态分类和安全计数。

## 列举网正文提交表示

1. 文章库中的 JSON / Markdown 原文、`publicationSnapshot` 和可编辑内容均不修改。列举网 adapter 只在 `preparePlatformSubmission` 内从 snapshot body 生成一次性平台派生纯文本，不写回任何 content owner。
2. 平台派生正文必须是纯函数结果：保留可见文本、段落、标题文字、编号和列表可读性；去除标题、强调、链接和行内代码等 Markdown 展示符号。不使用 AI 重写，不提交未验证的 HTML，不删减业务正文。
3. 仓库已有 `src/core/article-text.js#markdownToPlainText`。实施时应先用列举网平台行为测试校验其语义；只有直接符合上述表示合同时才复用。已知必须单独覆盖 Markdown 图片、普通链接、无序 / 有序列表、引用、表格、代码块和内嵌 HTML；不得把 Markdown 图片的本地路径或 URL 当正文泄漏到列举网，也不得在去标记时连同列表结构一并丢失。不得为列举网单独需求盲改通用 helper 并影响其他调用方；如语义不足，由列举网 adapter 内私有 renderer 持有平台表示规则。
4. 当前东爵真实文章的纯内存验证：原正文 2211 字，派生纯文本 2151 字；30 个 `**` 标记被去除，段落数、五个章节、五个编号问题和结尾全部保留。该结果只是表示验证，未写回文章库。
5. `preparedSubmissionEvidenceV1.title/body/contentFingerprint` 必须绑定**实际提交的平台派生文本**，不能继续指向未转换的 Markdown snapshot。已冻结 evidence 后不得再转换、换图或改正文。

## 执行过程

1. [`19-0-lieju-http-contract-and-owner-map.md`](19-0-lieju-http-contract-and-owner-map.md)：无 production diff 的实时 inventory、合同 / owner map 冻结。
2. [`19-A-lieju-gbk-form-and-city-resolution.md`](19-A-lieju-gbk-form-and-city-resolution.md)：GBK / HTML form / 城市与区域纯解析 owner。
3. [`19-B-lieju-browserless-http-session.md`](19-B-lieju-browserless-http-session.md)：无浏览器 HTTP Session、storageState 单 writer 与打包能力。
4. [`19-C-lieju-plain-text-prepared-evidence.md`](19-C-lieju-plain-text-prepared-evidence.md)：不回写文章库的平台纯文本和实际 evidence/fingerprint。
5. [`19-D-lieju-image-multipart-preparation.md`](19-D-lieju-image-multipart-preparation.md)：Ticket 17/18 seam 上的 0–4 图 best-effort 交付与冻结 multipart 准备。
6. [`19-E-lieju-http-submit-and-outcome.md`](19-E-lieju-http-submit-and-outcome.md)：唯一 HTTP POST 副作边界与既有 outcome 分类。
7. [`19-F-lieju-playwright-fallback-and-mode-policy.md`](19-F-lieju-playwright-fallback-and-mode-policy.md)：提交前 Playwright 保底与平台级 mode policy。
8. [`19-G-lieju-integration-audit-and-closure.md`](19-G-lieju-integration-audit-and-closure.md)：combined audit、blocking remediation、bounded re-audit、final gate 和真实验收清单。

## 职责边界

- 列举网 adapter 拥有该平台城市 / 区域解析、GBK / HTML form 解析、平台正文表示、HTTP / Playwright transport 选择、上传、实际图片成功集合和 `layoutSlot`。
- 现有 browser-session lifecycle 仍拥有交互登录和浏览器会话生命周期；HTTP 路径不复制登录 UI 或凭据 owner。
- 文章库 / content owner 仍唯一拥有原始 Markdown 和可编辑文章；列举网平台 renderer 只产生不回写的准备期表示。
- Ticket 18 拥有随机选择，不知道列举网 DOM/API。
- Ticket 17 拥有路径边界与 resolver；adapter 不复制扫描逻辑。
- 09 继续拥有最终 outcome；图片失败不是新的 outcome。

## Acceptance criteria

- [ ] 默认 `auto` 模式在有效 storageState 下不启动 Chromium，可完成登录 probe、城市 GET、表单 GET 和冻结准备；只有明确需要交互登录或提交前不兼容时才启动 Playwright。
- [ ] 城市按配置值模糊匹配第一个 DOM 链接，无匹配回退北京，区域选最后一个非空 option；HTTP / Playwright 的决策证据一致。
- [ ] GBK / UTF-8 charset、真实 form controls、隐藏字段、动态脚本污染和恶意 action / city URL 均有合同测试；未知编码或不安全 URL 在 POST 前失败。
- [ ] 文章库 Markdown 字节不变；列举网实际提交文本不包含可见 Markdown 格式噪音，保留全部业务文本和段落 / 编号可读性；evidence body / fingerprint 与实际提交字节一致。
- [ ] 0–5 image plan 均可准备；成功几张 manifest 就记录几张，0 张成功仍可提交正文。
- [ ] 单图/部分/全部图片失败不会生成图片 decision、不会暂停组、不会把文字文章改成失败。
- [ ] 实际成功图片 fingerprint/layoutSlot 与编辑器最终内容一致；失败图片不进入 evidence。
- [ ] 文件上传前重新验证客户边界，日志/持久化无绝对路径/Cookie/DOM 原文。
- [ ] submission-start 前失败可结束 prepare；边界后 unknown 只 uncertain 且不重复正文投稿。
- [ ] HTTP POST 调用次数最多 1；POST 调用前的可恢复准备故障才允许 Playwright 保底，POST 调用后的任何未知均不调用 Playwright submit。
- [ ] HTTP 与浏览器对 storageState 的并发 / 重启 / 保存失败矩阵证明单 writer、原子保存和 cleanup failure 不覆盖业务结果。
- [ ] 平台 DOM/API 只存在列举网适配边界，通用队列无 platform 分支。
- [ ] 假页面测试 PASS；handoff 包含能力限制、best-effort 矩阵、提交边界和真实验收清单。
- [ ] 前置真实探索结论为 `SUPPORTED` 且有独立授权；未获得实施后真实验收授权时保持 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`。

## Non-goals

- 不修改今日头条、蓝色河畔或网站媒体图片流程。
- 不建立图片重试/换图/人工降级状态机。
- 不修改文章库原文、生成 prompt、通用队列或 Renderer 来适配列举网格式。
- 不尝试 HTTP 自动提交验证码、绕过风控或持久化账号密码。
