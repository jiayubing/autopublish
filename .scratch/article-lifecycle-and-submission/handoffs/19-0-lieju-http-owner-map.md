# 19-0 — 列举网 HTTP 合同与 Owner Map

## 状态与 provenance

- 工作包：`19-0-lieju-http-contract-and-owner-map`。
- inventory HEAD：`8ef46fea28e2429da3ebd3e69934501876767328`（`codex/article-lifecycle-submission`；inventory 开始和定向验证后工作树均无 production diff）。
- 前置已验证：Wave 12 / Ticket 18=`COMPLETE`；列举网 HTTP 图文探索为 `SUPPORTED`。本 handoff 不继承探索阶段的真实发布授权。
- 本工作包只冻结实时合同、owner、文件围栏、测试和验收清单；未修改 production source、package manifest、schema、Renderer 或运行状态，也未执行登录、GET、POST、上传或发布。
- Manual Dispatch 未授权 Primary Audit、commit、merge 或后续工作包。19-A 只能在本 handoff 进入新的 clean integration HEAD 后开始；不得因本文件预创建或并行启动 19-B–G。

## 19-0 结论

### 现有公开合同足够，且不增加 schema/outcome

当前 `src/domain/regular-publication-contract.js` 已是唯一 `PreparedSubmission` / `preparedSubmissionEvidenceV1` owner：

- evidence 的 `{ title, body, contentFingerprint }` 可绑定列举网实际提交的平台派生纯文本；fingerprint 是稳定 UTF-8 `JSON.stringify({ title, body })` 的 SHA-256。
- `deliveryMode` 已有 `text_only | with_images`，`images` 是 fingerprint 去重的 `{ assetFingerprint, layoutSlot }`，V1 容量最多 5 张。因此列举网的实际 `0–4` 张是有效且更窄的子集，不需要 schema 变更。
- 新自动配图路径使用 `decisionKind: "initial"`；0 张是 `text_only` / 空数组，1–4 张是 `with_images` / 实际成功集合。图片失败不创建 decision、outcome 或人工事项。
- `PreparedSubmission` 只暴露经 validator 冻结的 evidence 和闭包内 `submitPreparedPublication()`，`toJSON` 明确 fail-closed。multipart body、buffer、hidden 值、Cookie 和 state 不会进入 evidence、IPC 或持久化。
- `beginRegularRemoteSubmission` 是唯一 submission-start writer：它先持久冻结完整 evidence 并写入 `remote_call_started`，仅在 `submitAuthorized: true` 后调用 capability。`regular-platform-outcome-service` 与 OperationalStore outcome aggregate 仍是 accepted / article_rejected / group_blocked / uncertain 的唯一收口路径。19 不新增 publication-success primitive 或 outcome enum。

### 已冻结调用链

```text
queue claim + account inspection
  → regular-platform-preparation-port
  → adapter.preparePlatformSubmission(claim, imagePlan)
      → [19-B HTTP session] → [19-A city/form parser]
      → [19-C platform plain-text body] → [19-D actual image manifest]
      → PreparedSubmission(evidence, single-use submit capability)
  → beginRegularRemoteSubmission(evidence freeze; only writer)
  → capability HTTP POST once [19-E]
  → regular-platform-outcome-service → OperationalStore outcome aggregate
```

19-F 只在 HTTP POST 尚未被调用的 prepare 失败时，使用同一份已冻结 city/zone、body 和 image manifest 进入既有 Playwright 路径。POST 调用后或调用状态无法确认时，结果只能是既有 `uncertain`，不得再启动 Playwright、POST、轮询公开页或自动重试。

`desktop/services/regular-platform-preparation-port.js` 已在账号核验成功后、adapter prepare 前恰好一次生成进程内 `imagePlan`；它不持久化 plan。`desktop/services/regular-queue-group-orchestrator.js` 已保证 prepare → submission-start → submit 的时序，且崩溃恢复只把 orphaned `remote_call_started` 收为 uncertain，绝不重放。

### 现有代码的实施决策

- `src/core/article-text.js#markdownToPlainText` 只读且**不复用**：它会把 Markdown 图片替换成图片 URL，并删除无序/有序列表标记，不能满足列举网的“不泄漏路径/URL、保留列表可读性”合同。19-C 创建 adapter 私有 renderer，不修改通用 helper。
- Ticket 17 的 `client-image-library.resolveImage(clientId, imageId)` 是唯一文件边界/重验入口；19-D 仅通过窄 read capability 调用它，并仅把文件 bytes 留在不可序列化 capability 闭包。不得重新扫描、缓存或从 image plan 推导路径。
- 真实 HTTP 表单的 `local_file1..N` 必须由当次结构化 form 解析结果决定。探索中的 `limitnum=4` 是上限证据，不授权从 script 模板伪造槽位；当次表单只有 1 个真实槽时只能 best-effort 交付 0–1 张，文字仍可提交。4 图测试 fixture 必须显式给出 4 个真实 file control。

## 依赖、CI 与打包边界

| 能力 | 冻结决定 | 19 包 owner / 验证 |
| --- | --- | --- |
| HTML 结构化 parser | 19-A 将显式加入 production `cheerio@1.1.2`（MIT，Node `>=20.18.1`）。只对已按 charset 解码的文本进行 DOM 选择，先验证 action，再枚举该 form 内 successful controls；禁止正则扫描整页。 | 19-A 修改 `package.json` / lock，并以 GBK/UTF-8 fixture 和 production dependency closure 测试验证。 |
| GBK/UTF-8 解码 | 使用 Node 24 的内建 `TextDecoder`，按 HTTP `Content-Type` 与 HTML meta charset 一致决定 `gbk` / `gb2312` / `gb18030` / `utf-8`；未知、冲突或不可解码均 POST 前 fail closed。 | 19-A 纯函数测试；不引入 encoding shim。 |
| 无浏览器 HTTP | 19-B 将当前 lock 中的 `playwright@1.61.0-alpha-1781023400000` 提升为显式 production dependency（Apache-2.0），使用 `request.newContext({ storageState })`。现有 `@playwright/cli@0.1.14` 和 `playwright-core` 同为 Apache-2.0。 | 19-B package / lock、HTTP session 和 packaged-runtime test。不可依赖 `@playwright/cli` 的传递依赖偶然可 `require("playwright")`。 |
| multipart | 使用 Playwright request 的 `multipart` capability 和 Node `Buffer`；现有显式 `form-data@^4.0.6`（MIT）不成为新 HTTP transport 的隐式 owner。 | 19-D 假 transport contract，禁止记录 body/bytes。 |
| Node/CI/打包 | CI desktop 基线 Node 24；`electron-builder.alpha.yml` 已从 production dependency closure 打包，并显式 unpack `@playwright/cli`、`playwright`、`playwright-core` 与其许可证。`tests/packaged-playwright-runtime.test.js` 验证 runtime / license；19-B 必须扩展该验证以证明 direct request runtime 仍在 artifact 中。 | 19-B / 19-G 运行 package contract 和 production smoke；依赖变更后运行 production dependency audit。 |

直接依赖的许可边界在 package review 中保持 MIT（Cheerio）与 Apache-2.0（Playwright）可分辨；lock 新增传递项由现有 production `npm audit --omit=dev --audit-level=high` 和打包许可证/文件 gate 复验。不要手工修改 `node_modules`、产物或 license 文件。

## 19-A–G 串行 owner / 文件围栏

所有包从上一包已验证的 clean integration HEAD 启动。`src/platforms/lieju/adapter.js` 是共享 adapter owner，任何包只能在自己的串行 slot 修改；`src/platforms/shared/browser-session-lifecycle.js` 只由 19-B 修改；runtime context/composition 的图片 resolver seam 只由 19-D 修改；全局 runtime config seam 只由 19-F 修改。

| 包 | 唯一 owner 与允许 production 文件 | 只读依赖 | 定向测试 | 需返回主任务的 escalation |
| --- | --- | --- | --- | --- |
| 19-A | 新建 `src/platforms/lieju/http-form-parser.js`（decode、city、safe action、successful controls）；`src/platforms/lieju/adapter.js` 仅接入纯解析 export；`package.json`、`package-lock.json`。 | 19 umbrella/exploration、`scripts/config` 的列举网 URL、现有 adapter profile contract。 | 新建 `tests/lieju-http-form-parser.test.js` 与 package-closure test；覆盖 GBK/UTF-8、冲突、损坏 bytes、城市首个模糊匹配/北京回退、恶意 URL、最后非空 zone、script 模板、disabled/unchecked/付费 control。 | 可靠解析必须改全局 HTML 基础设施，或可信城市规则不能由冻结规则表达。 |
| 19-B | 新建 `src/platforms/lieju/http-session.js`；`src/platforms/shared/browser-session-lifecycle.js` 的同 state-file lease/原子保存最小改动；`src/platforms/lieju/adapter.js` 接线；`package.json`、lock、必要的 `electron-builder.alpha.yml` / packaged runtime verifier。 | 19-A parser output、`platform-runtime-context.js` 当前 state path、现有 browser lifecycle 和 diagnostics。 | 新建 `tests/lieju-http-session.test.js`；更新 `tests/platform-browser-session-lifecycle.test.js`、`tests/packaged-playwright-runtime.test.js`。验证 Browser launch=0、probe+GET、state 缺失/过期/损坏、并发、restart、rename/save/cleanup failure、安全 metadata。 | storageState 不是标准 Playwright state、需要迁移/删除真实登录数据，或单 writer 必须重构多平台 Session 架构。 |
| 19-C | 新建 `src/platforms/lieju/plain-text-renderer.js`；`src/platforms/lieju/adapter.js` 的 prepare/evidence 接线；新建列举网 body/evidence test。 | Domain V1 validator / fingerprint、冻结 publication snapshot、19-B prepare port；`src/core/article-text.js` 仅作反例/只读。 | 新建 `tests/lieju-plain-text-preparation.test.js`；覆盖强调、标题、链接、图片、列表、引用、表格、inline/fenced code、HTML、东爵 2211→2151 回归、文章 bytes 不变、evidence hash 重算。 | 必须更改公开 V1 evidence schema 才能记录实际 body，或转写需要新用户内容决策。 |
| 19-D | 新建 `src/platforms/lieju/multipart-preparation.js`；`src/platforms/lieju/adapter.js`；为唯一 Ticket 17 resolver 注入窄 capability 的 `src/platforms/platform-runtime-context.js` 与 `desktop/composition/workspace-runtime-composition.js`；新建 multipart test。 | 19-A form controls，19-C frozen body，Ticket 17 `resolveImage`，Ticket 18 process-only image plan，V1 evidence validator。 | 新建 `tests/lieju-image-multipart-preparation.test.js`；覆盖 0/1/4/5、N>M、缺失/越界/非常规/超 1 MB、部分/全部失败、连续 slot、layoutSlot/fingerprint、无敏感数据。 | imagePlan 不含稳定 image identity、Ticket 17 resolver 无法经窄 capability 调用，或探索证据与真实 form slot 合同冲突。 |
| 19-E | 新建 `src/platforms/lieju/http-submit.js` 与 `src/platforms/lieju/result-classifier.js`；`src/platforms/lieju/adapter.js` 迁移当前列举网 URL/identity normalization 的唯一实现后复用；新建 HTTP outcome test。 | 19-A–D frozen prepare、19-B request context、现有 09 outcome service 和 submission-start. | 新建 `tests/lieju-http-submit-and-outcome.test.js`；覆盖 accepted+identity、success text only、reject/login/captcha、unsafe URL、GBK/UTF-8 response、timeout/reset/partial/decode/state-save、single capability/restart/late response。 | 必须新增 outcome / publication-success writer，或 accepted 身份只能靠禁止的公开页轮询获取。 |
| 19-F | `src/platforms/lieju/adapter.js` 与既有 browser submit helper，确保 browser 消费 19-A–D 冻结结果；`desktop/runtime-config-store.js`、`desktop/runtime-config.js`、`desktop/worker/run-task.js`、`src/platforms/platform-runtime-context.js` 的最小 `LIEJU_SUBMISSION_MODE=auto|playwright_only` 平台级注入；相应 config/adapter tests。 | 19-E POST-attempt flag、现有 browser lifecycle、runtime paths、同一 outcome classifier。 | 新建 `tests/lieju-transport-policy.test.js`；更新 runtime-config/worker/adapter tests。验证 auto browser=0、pre-POST 可 fallback、post-POST / unknown fallback=0、playwright_only HTTP POST=0、城市/区域/evidence 相等、stop/restart/concurrent prepare。 | 平台级紧急 mode 只有新增 Renderer/IPC/内容库 schema 才能安全设置，或 Browser 无法消费同一 frozen plan。 |
| 19-G | 只允许合并审计发现的最小 root-cause 修复、直接测试、`handoffs/19-G-lieju-http-integration-closure.md`、Wave Plan 当前状态/evidence。不新增第二 manager/adapter/owner。 | 19-0–F handoff、最终 diff、CI/package gates、Audit Protocol。 | 全部 19 专项矩阵、08/09 direct regressions、package/production smoke、architecture/absence gates；Primary Audit → remediation → bounded re-audit。 | 需新的真实操作授权、供应商当前合同实质冲突，或 remediation 改变公开 schema / transaction / remote-side-effect boundary。 |

19-D 的 runtime context 只获得类似 `resolveClientImage({ clientId, imageId })` 的 read-only narrow port，不能暴露 image scan/cache、workspace root 或全量 `clientImageLibrary`。这是对 Ticket 17 公共 resolver 的消费，不是第二图片库或第二路径 owner。19-F 的 mode 是 application runtime 配置而非文章/队列事实：默认 `auto`、只允许 `playwright_only` 紧急覆盖；不进入 evidence、IPC 文章选择或 schema/migration。

## 冻结的故障与恢复矩阵

| 阶段 | 注入故障/输入 | 本地事实与安全结果 | 是否允许 fallback / retry |
| --- | --- | --- | --- |
| A/B/C/D，submission-start 前 | charset/action/city/form 不安全；state 缺失或登录失效；body renderer 不满足合同；图片读取/校验失败 | 未写 `remote_call_started`。图片错误只缩减实际 manifest，0 图继续纯文本；其他 prepare failure 走现有明确 pre-submit 分类。 | 19-F 仅可对可恢复 HTTP prepare 故障转 Playwright；不自动 network retry。 |
| B，state writer | HTTP 与 browser 并发、进程重启、atomic rename/save/cleanup 失败 | 账号专用 lease 只有一个 writer；save/cleanup failure 不覆盖既有业务结果；Cookie/state 原文不记录。 | 不因 state-save 问题盲重试 GET/POST；不确定结果保持不确定。 |
| D，图片 | 0/5 候选、页面槽少于候选、缺失/超限/非 regular file/路径越界、部分或全部失败 | evidence 只含成功图片；slot 连续、`layoutSlot` 0-based；0 张为 `text_only` / `initial`。 | 图片没有 retry/replace/人工 decision，文字主链继续。 |
| E，HTTP POST 前 | request construction、safe redirect/response validation 失败 | 没有 POST，capability 不进入远端 mutation；可被 F 评估为 submit 前 fallback。 | 最多一次 Playwright fallback，且它消费同一 frozen plan。 |
| E，HTTP POST 已调用 | timeout、RST、部分 response、decode/parse/identity/state-save failure、第二次 capability 调用 | 既有 `REMOTE_RESULT_UNKNOWN` / `uncertain`；evidence 已由 submission-start 冻结。 | 禁止 HTTP retry、公开页轮询和 Playwright submit。 |
| E/F，明确 response | identity 完整的明确成功、明确拒绝、登录/验证码/风控 | accepted 必须有安全 remote ID/URL；其余按既有 article_rejected/group_blocked/uncertain 合同收口。 | outcome 仅由 09 owner 写入；不新增 status。 |
| restart / late input | `remote_call_started` 后崩溃、late success、stale lease | 08/09 保留 single attempt/evidence；启动时 orphaned remote call 进入 uncertain，late accepted 仍使用既有 first-wins outcome primitive。 | 永不 replay remote submission。 |

## 最终验收与真实操作边界

19-G 在未获新授权时必须记录 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`，并只完成假 transport、package/smoke 与 audit evidence。合并后的独立 HTTP 真实验收需要用户对**本次**操作明确授权，并至少在动作时确认：目标账号、一次合成测试文章、0/1/4 图 best-effort 情形、未勾选付费推广、单次 POST、可接受的 uncertain 停止策略及不自动重试。验收不得复用本 handoff 或探索阶段授权，不得使用生产内容/订单，也不得读取或导出 Cookie、hidden 值、联系人、完整 HTML、request body 或图片 bytes。

## 本次定向验证

在 `auto—publish/`，实际运行（Node `v24.16.0`）：

```text
node --test --test-concurrency=1 tests/article-lifecycle-ticket-08.test.js tests/regular-image-plan-service.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-platform-outcomes.test.js tests/platform-browser-session-lifecycle.test.js tests/packaged-playwright-runtime.test.js tests/production-packaging.test.js
# 87 passed, 0 failed, 0 skipped, 0 cancelled
```

覆盖的当前不变量包括 V1 evidence 精确字段/不可序列化、prepare 一次与图片 best-effort seam、submission-start 事务及 fault rollback、边界后 uncertain/no replay、列举网现有安全 remote identity/第二次 submit guard、state lifecycle 和 Playwright runtime license/package boundary。

## 19-0 acceptance 对照

- A–G owner、允许文件、只读依赖、定向测试和 escalation 已在表中冻结；所有 shared owner 严格串行，没有任何后续包需要并行重写同一 writer。
- HTTP POST 是唯一未来远端 mutation；fallback 只能发生在该边界前。
- 平台派生 body 只在 adapter prepare 中生成，不回写 article store；evidence body/fingerprint 与实际提交 body 绑定。
- 现有 V1 表达 0–4 实际成功图片和 `initial`，不需要新 schema 或 outcome。

下一步只能是将本 handoff 提交/集成到 clean HEAD 后的 `19-A`；不得自动进入后续工作包、审计、提交或真实外部验收。
