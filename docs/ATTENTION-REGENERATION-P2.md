# 需处理批量重新生成 P2

状态：COMPLETE（P2 实现和验证完成，独立 PR，不自动合并）。基线：P1 PR #68 合并提交 `808fdc830eaa65760953f04c486075ac670591e9`。
分支：`codex/attention-regeneration-p2`。仅交付 P2，独立 commit/push/PR，不合并，不进入 P3。

## 范围与决策

- 需处理页确认后调用一个批量生成应用命令；客户端只发送 attention IDs、请求 ID 和确认意图，后台重新读取 attention 与原文章。
- 复用现有来源预览、batch store、runner、article generator、AI executor、文章持久化和进度订阅。一个选择对应一个任务，支持同客户同模板的多篇原文章及不同来源，不使用客户×模板笛卡尔积扩大数量。
- 生成来源取原文章资料快照 ID、调研问题 ID、模板和平台，内容取这些来源的当前版本；缺失来源整批拒绝。执行后可部分成功，逐任务保留新文章 ID。
- 原文和投稿记录不变；attention 没有安全的“通过重新生成结案”动作，因此原事项保留，UI 明确提示。P3 的改投/结案不在本次范围。
- 请求 ID 映射到现有持久批次身份；重放仅观察已有结果。后台准备阶段互斥，并在异步来源预览后复核 attention，防止 stale 输入创建任务。重启不自动运行任务。

## 验证与审查

- 定向服务/store/runner/feature/typed IPC：84 项通过（首次完整 fixture 修正后）。
- 浏览器交互与页面状态：2 项通过，覆盖混合选择、取消确认、确认启动、运行中禁用、失败进度与既有文章/详情入口。
- main/renderer/bridge typecheck、ESLint、renderer/preload build 均通过；renderer 仅保留已有 bundle-size 警告。
- Primary review 范围：应用命令、持久批次任务、直接 IPC/bridge/UI 与测试。发现并已修正：逐项启动导致后续 busy；信任 UI reason；异步预检后 stale；每项强制刷新导致重复全量 attention 查询。均为当前草稿引入问题，不扩大到其他 owner。
- 集成回归发现 `INTRODUCED_BY_CHANGE`：普通队列页过早订阅生成进度，破坏页面独立读取边界；已改为进入需处理时才启动生成观察。受影响队列/清理/响应式布局及需处理浏览器回归共 24 项通过；原断言未降低。Electron 首次并发安装失败在单独重跑后通过。
- Bounded re-review：检查已知 findings、修复 diff、直接调用方、IPC fixture matrix 和持久任务不变量，PASS；无未关闭 blocking finding。
- 既有格式问题：`src/domain/identities.js`、`tests/authenticated-runtime.test.js`、`tests/phase-08-content-lifecycle.test.js` 不符合当前 `format:check`；三者相对基线均无修改。登记原 owner 后续处理，不扩大 P2 范围。
- 最终 clean implementation HEAD：`aa9b2c44c752ae122df3a22e7d58b02206262b8a`。在该提交运行 `npm test`：596/596；`npm run test:integration`：1237/1237，均无失败、跳过或 todo。随后只更新本文档记录证据，生产代码及测试保持不变。
- 补充 `node --test tests/phase-06-production-ipc-fixture-matrix.test.js`：6/6；受格式 gate 管理的本次改动文件定向 Prettier 检查通过。
- 环境：Windows / Node v24.16.0；日志与 runner timings 位于未跟踪的 `auto—publish/build/test-results/`，不提交构建和运行产物。
- 未运行 release/打包及真实外部验收：本阶段不是发布任务，且未授权真实 AI/账号/投稿/付费操作。
- 无 P2 blocking finding。P3 未开始；其“改投成功后关闭原 attention”仍需按该阶段合同核实 owner，不能把 P2 生成成功当成原投稿结案。

所有验证使用合成数据和假 AI transport；不调用真实 AI、不投稿、不付费、不访问生产内容库。
