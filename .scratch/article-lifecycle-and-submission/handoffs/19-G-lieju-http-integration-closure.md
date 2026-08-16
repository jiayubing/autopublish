# 19-G — 列举网 HTTP 图文 Integration、审计与 Closure Handoff

## 状态与 provenance

- 工作包：`19-G-lieju-http-integration-audit-and-closure`。
- 分支：`codex/article-lifecycle-submission`。
- 19-G 开始 integration HEAD：`6e42cded0fe665a0d9726bcb4e0ca680cef378ff`；开始时工作树干净，19-F 已为 `COMPLETE`。
- blocking remediation commit：`eb1ca52a52aff1785d6674f258712e2a0a20c412`（Lieju image capability、HTTP session 配置依赖方向、城市目录合同统一）。
- cross-ticket test-contract remediation commit：`cdab11c02c7b77c827ef6880b5f3a09815964e83`（Phase 1/4 旧 fixture 与当前 prepared/browser 合同对齐）。
- 原 19-G closure clean implementation/test HEAD：`cdab11c02c7b77c827ef6880b5f3a09815964e83`。
- 后续 Lieju HTTP charset/image-slot remediation 与最终本地验证 HEAD：`35d0599b9563020c830870ea71bc0e153356eb2a`。
- 当前结论：**19-G=`COMPLETE`；Wave 13=`PARTIAL`**。本地实现、combined audit、bounded re-audit、完整测试和 package smoke 已闭合；独立 HTTP multipart POST 的真实带图验收仍需另一次明确授权。

本次没有执行真实登录、真实 GET、真实 POST、图片上传、发布、付费或公开页核对；没有读取或记录真实 Cookie、Token、隐藏字段、联系方式、文章正文或 storageState 原文。

## Audit 范围与 owner 结论

仅审计 19-A～F 的组合边界及其直接消费方：charset/form/city、storageState 单 writer、平台派生纯文本/evidence、图片 multipart、HTTP 单次 POST/outcome、提交前 Playwright fallback、Ticket 18 capability seam、Ticket 08/09 回归和 package/runtime gate。

- 城市、区域、charset 和 successful controls 仍由 `src/platforms/lieju/http-form-parser.js` 唯一决策；HTTP 与 Playwright 消费同一冻结结果。
- HTTP session 仍由 `http-session.js` 持有 transport/lease 语义；login probe URL 由 Lieju adapter 注入，不再从 `scripts/config` 越层读取。
- 平台正文仍由 Lieju 私有 plain-text renderer 派生；文章库原文、snapshot 和 content owner 不被写回。
- 图片仍复用 Ticket 17/18 的 resolver/image plan seam；Lieju 只准备连续的 `local_file1..4` 实际成功集合，失败自动降级，不建立新的图片状态机。
- outcome、submission boundary 和 uncertain 语义仍由既有 PreparedSubmission / regular outcome 合同承载；没有第二个发布事实或 outcome owner。
- adapter 现在声明既有 `imagePublishingCapability: { supported: true }`，因此 Ticket 18-B 的 queue image-count surface 对 Lieju 正确可达；没有新增 capability registry 或 UI 分支。

## Primary Audit findings 与 remediation

| Finding | 分类 | 处理 |
| --- | --- | --- |
| Lieju 已实现 0–4 图片 multipart，但 adapter 未声明既有 image capability，Ticket 18-B UI 因 fail-closed 隐藏 Lieju image-count 配置。 | `CROSS_TICKET_INTERACTION` / blocking P1 | 在 Lieju adapter 的唯一公开 descriptor 声明 `Object.freeze({ supported: true })`，并增加 transport contract 回归；Ticket 18-B 回归通过。 |
| `http-session.js` 直接读取 `scripts/config`，触发 Phase 8 platform-adapter-to-global-runtime-config 依赖违规。 | `INTRODUCED_BY_CHANGE` / blocking architecture finding | 删除深模块的全局 config import；由 adapter 注入 `loginProbeUrl`；HTTP session 定向测试和 Phase 8 dependency report 通过。 |
| Phase 1 fixture 仍要求 Lieju 暴露已移除的 `publishArticle` legacy path。 | `EXPOSED_PREEXISTING` / process evidence gap | fixture 改为对 Lieju 断言 legacy writer 不存在，同时保留 Toutiao 既有合同断言。 |
| Phase 4 browser fixture 没有为新的 Lieju session lifecycle、城市目录和真实 form 提供合成行为。 | `EXPOSED_PREEXISTING` / process evidence gap | 补齐临时 state、list/open/close、goto、城市 HTML 和 form HTML；不改变 production。 |
| umbrella 曾将城市目录写成 `www.lieju.com`，而历史探索、19-A/代码/测试使用并验证 `post.lieju.com`；投稿目标本来就要求 `post.lieju.com`。 | `PROCESS_EVIDENCE_GAP` | 按已验证探索和既有唯一实现事实统一 umbrella 为 `https://post.lieju.com/city.php?post=239`；投稿 target allowlist 未改变。 |

以上 finding 均已关闭，没有未关闭的 P0/P1 或直接阻塞 acceptance 的 P2。

## Bounded re-audit 与最终验证

修复后只复查 finding diff、直接调用方、受影响 owner 和对应不变量；没有重新开启 full-repo review。

组合定向矩阵（charset/form/city、state lease/concurrency、plain text/evidence、0–5/N>M images、HTTP/Playwright selection、POST boundary/outcome、Ticket 08/09、Ticket 18-B、worker）结果：

```text
119 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo
```

最终 clean implementation/test HEAD `cdab11c` 上实际通过：

```text
RUN_ELECTRON_FOCUS_TESTS=1 npm test
# 264 files; 1929 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo

npm run test:packaging
# 48 passed, 0 failed

npm run lint
# PASS

npm run typecheck:renderer
npm run typecheck:bridge
npm run typecheck:main
# all PASS

npm audit --omit=dev --audit-level=high
# found 0 vulnerabilities
```

架构/absence report：

```text
node -e "const g=require('./scripts/verify-phase-08-gates'); const r=g.verifyPhase08Gates(); ..."
# PASSED; capabilityCount=114; reachableCount=114; failures=[]
npm run test:legacy-absence
# PASSED; sourceMatches=0; archiveMatches=0
```

CI 同款本地生产 package smoke：

```text
npm run pack:production:smoke
# PASS
# package commit=cdab11c02c7b77c827ef6880b5f3a09815964e83
# 10 checks passed, 1 optional Hepan Python check skipped, 0 failed
# Electron application/preload sandbox/renderer/Playwright/storage/schema all passed
```

安全 evidence 位于 `auto—publish/build/evidence/production-smoke.json`；其中 `externalOperations=none`、`credentials=not-collected`、`sensitiveValues=excluded`。第一次未提升权限的 Electron smoke 只因当前 Windows user-data/cache/GPU 权限失败；在受控本地 Electron 权限下按同一命令重跑通过，未改变代码或测试语义。

## 真实验收边界

本 handoff 明确保持：`USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`。

未来获得本次独立授权后，验收单至少需要冻结：

1. 指定列举网账号 profile、客户和专用合成文章/图片目录；
2. 覆盖 0、1、4 张实际可交付图片及 Ticket 18 的 5 张候选/N>M 降量；
3. 明确不勾选任何付费推广；
4. HTTP POST 最多调用一次，POST 已调用后任何 timeout/断线/缺失结果都停止并进入人工核对；
5. 只在明确结果下记录平台 acceptance/detail identity、成功图片 fingerprint 和 `layoutSlot`；失败图片不进入 evidence；
6. 不因不确定结果启动第二次 HTTP/Playwright submit，不自动重试；
7. 真实操作结束后另写独立 external-acceptance handoff，不把本地 smoke 或历史浏览器 POST 伪写成 HTTP client 已验收。

## Closure

19-G 的本地 integration closure、blocking remediation、bounded re-audit、最终 clean HEAD gate 和 evidence 已完成。Wave 13 保持 `PARTIAL`，唯一剩余事项是需要单独授权的真实 HTTP multipart 图文验收；Ticket 20/21 不因本 Ticket 完成自动调度。

## Post-closure remediation — 2026-08-16

用户反馈列举网实际文章出现中文乱码、选择 4 张图片但页面只收到 1 张。按当前已验证合同收敛为：HTTP multipart 文本字段使用投稿表单声明的 charset（未声明时 UTF-8）；当前 raw form 只有一个真实图片槽位时，HTTP 只发送一张图片，不因图片数量自动切回 Playwright。多选图片转 Playwright 仍是未来独立能力验收后的产品决策，不在本次本地修复中预设。

实现 commit：`35d0599b9563020c830870ea71bc0e153356eb2a`。

本次变更与回归证据：

- Lieju 定向套件：54 passed，0 failed；覆盖 GBK 表单字段编码、HTTP submit boundary/outcome 和单真实图片槽位合同（4 个候选只发送 1 个，记录降量 warning）。
- 最终非 Electron 全量回归：`node scripts/run-tests.js --exclude tests/production-preload-sandbox.electron.test.js --exclude tests/renderer-settings-window-focus.electron.test.js`，262 files，1929 passed，0 failed。
- 权限更新后 Electron 重点测试：`production-preload-sandbox.electron.test.js` 2/2、`renderer-settings-window-focus.electron.test.js` 1/1 通过；未加入 `--no-sandbox`，未为绕过弹窗修改生产启动参数。此前弹窗属于本机 Electron user-data/cache/GPU 权限环境问题。
- `npm run lint`、renderer/bridge/main 三个 typecheck、Lieju 定向 ESLint/Prettier、`npm audit --omit=dev --audit-level=high`（0 vulnerabilities）均通过。
- Phase 8 架构门禁：`PASSED`，`capabilityCount=114`、`reachableCount=114`、`failures=[]`；`npm run test:legacy-absence` 通过（source/archive matches 均为 0）。
- `npm run pack:production:smoke` 通过；`auto—publish/build/evidence/production-smoke.json` 绑定 commit `35d0599b...`，10 项通过、1 项可选 Hepan 检查跳过、0 项失败；生成物位于 `auto—publish/release-production-smoke/win-unpacked`。
- 根 `npm run format:check` 仍报告 14 个既有且不属于本次 Lieju 改动的文件；本次未扩大范围修改这些文件，所有本次变更文件的定向格式检查已通过。

本次仍未执行真实列举网登录、HTTP GET/POST、图片上传、发布或公开页核对；真实带图验收继续保持 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`，不能用本地 smoke 或用户此前的浏览器现象替代该证据。
