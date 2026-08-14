# Workstream 4 — Lieju Adapter Runtime 对齐

日期：2026-08-14

## 范围

- 基线 HEAD：`2e012fe`（Workstream 3 已交付）。
- 本线程只处理 Lieju Adapter 的 runtime/session 显式注入、平台工厂实例化和对应测试。
- 未修改普通平台生命周期状态机、客户档案存储/UI、发布结果判定、图片链路或付费媒体。

## 实现结果

- `src/platforms/lieju/adapter.js`
  - 新增 `createPlatformAdapter(runtimeContext)` 工厂；每个 adapter 实例拥有自己的 Lieju session lifecycle。
  - 有 runtime context 时，session 路径固定从注入的 browser root 派生：
    - `browser/profiles/lieju`
    - `browser/sessions/lieju`
    - `browser/state/lieju.json`
  - 启动、导航、账号检查、表单填充、提交和 state save/close 均通过实例化 runtime 调用。
  - Lieju 只消费 `preparePlatformSubmission` 传入的标题、正文、城市、联系人和电话，不读取客户或文章存储。
  - 原有 Lieju URL、登录识别、UID 识别、城市切换、区域字段、标题/正文/联系人/电话 selector、发布按钮和等待策略均保留。

- `src/platforms/platform-runtime-context.js`
  - 增加从 workspace runtime paths 构造平台 runtime context 的单一映射，避免 composition 与 worker 各自拼接路径。

- `src/core/playwright.js`
  - Playwright 同步/异步调用支持显式注入 `playwrightCli`、`nodeExecPath`、`browserChannel`、`tempDir`，显式 runtime 工具齐全时不依赖全局工具路径解析。

- composition/worker
  - 主进程与平台 worker 的 Lieju adapter 加载均使用同一 workspace runtime context。
  - worker 的暂停、执行和清理加载路径保持一致。

## 验证

- `node --test --test-concurrency=1 tests/runtime-diagnostics.test.js tests/regular-platform-adapter-outcomes.test.js tests/adapter-workspace-injection.test.js tests/platform-account-inspector.test.js tests/platform-account-runtime.test.js tests/platform-browser-session-lifecycle.test.js`
  - PASS：42/42。
- `npx eslint src/platforms/lieju/adapter.js src/platforms/platform-runtime-context.js src/core/playwright.js desktop/composition/workspace-runtime-composition.js desktop/worker/run-task.js tests/regular-platform-adapter-outcomes.test.js tests/runtime-diagnostics.test.js`
  - PASS。
- 相关文件 `node --check`
  - PASS。
- `git diff --check`
  - PASS。
- 直接 Prettier 检查报告 7 个文件存在格式差异；其中 composition 的基线 HEAD 同样未通过该检查，本线程未进行全文件格式化。
- 未运行全量 `npm test`、真实登录或真实列举网发布；真实外部操作需要本次明确授权，且全量测试不属于当前 Manual Dispatch 定向 gate。

## Git 状态

当前为 Manual Dispatch。按 `EXECUTION-PROTOCOL.md`，本线程未自动执行 commit、merge、push；实现文件、测试文件和本 handoff 保持未提交，交由后续审阅/授权流程处理。

## 后续边界

- 本线程暂不建立 Lieju accepted/rejected/uncertain 的远端身份判定；该项属于 Workstream 5。
- 本线程不实现图片选择、上传、同平台多账号 profile 或 HTTP 发文路线。

## 本次 Thread 4 执行补充

当前执行基线：`9b46c0b`。在不扩大 Workstream 4 边界的前提下补齐了两个直接验收缺口：

- `preparePlatformSubmission()` 现在在任何远端导航前要求客户级 `city/contact/phone` 均为非空字符串；缺失或空白统一返回既有 `REGULAR_CONTENT_INVALID`，不会继续使用默认城市或空表单字段。
- Lieju 字段回归测试改为可执行页面 fixture，验证城市切换、区域选择、标题、正文、联系人和电话的实际页面操作；另增不完整档案 fail-closed 测试。

本次实际验证：

- `node --test --test-concurrency=1 tests/runtime-diagnostics.test.js tests/regular-platform-adapter-outcomes.test.js tests/adapter-workspace-injection.test.js tests/platform-account-inspector.test.js tests/platform-account-runtime.test.js tests/platform-browser-session-lifecycle.test.js`：47/47 PASS。
- `node --test --test-concurrency=1 tests/article-lifecycle-ticket-08.test.js tests/regular-platform-outcomes.test.js`：54/54 PASS。
- `npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge`：PASS。
- Thread 4 修改文件定向 ESLint、相关文件 `node --check`、`git diff --check`：PASS。

未执行真实列举网登录、真实发文、Thread 5 结果识别复审、commit/merge/push；这些均不属于本次 Thread 4 Manual Dispatch 授权范围。
