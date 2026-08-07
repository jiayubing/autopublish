# M01 — Playwright Runtime Hardening

**Purpose:** 在不改变普通平台发布业务语义的前提下，移除生产可达 Playwright 路径中的 shell command-string 执行，统一为可审计的 executable + argv + env 调用边界。

**Status:** `COMPLETE`；维护 5.5 第一项已完成并通过最终集成门禁

**Scheduling gate:** 仅当波次 5 `COMPLETE` 后调度；维护 5.5 的第一项。完成、审计、合并和定向复验前不得调度 M02 或波次 6。

## 当前风险基线

- `src/core/playwright.js` 仍公开 `pwCmd` / `pwRun`，并通过 `execSync(commandString)` 执行。
- `src/platforms/lieju/adapter.js` 与 `src/platforms/toutiao/adapter.js` 仍消费旧接口，并存在自行拼接 shell 命令的路径。
- `createPlaywrightRuntime()` 已提供 shell-free async 方向，但不得为了“统一 async”扩大成无关 adapter 重写；允许在同一 owner 中提供经过测试的 sync shell-free invocation（如 `execFileSync(file, argv, options)`）以降低 ripple。

## What to change

1. 以 `src/core/playwright.js` 为唯一运行时 owner，提供明确的 executable、argv、cwd/env、timeout、session 传递和安全诊断接口。
2. 将列举网、今日头条及共享 browser-session lifecycle 的生产调用迁移到 shell-free runtime。
3. 环境变量只能通过 `env` 传递，参数只能通过 argv 传递；不得用 `set X=... && ...`、字符串引号函数或 shell 转义承担正确性。
4. 保持 08 已验收的 preparation/submission-start/uncertain 边界、账号核验与 session 隔离语义不变。
5. 删除无生产调用的 `pwCmd` / `pwRun` / shell quoting compatibility；若测试仍需验证兼容输入，应迁移到公开 runtime 行为，而不是保留生产旧能力。

## Hard boundaries

- 不修改 09 的 outcome/manual-resolution 业务策略。
- 不实现图片 Ticket 18–21。
- 不改变真实平台 DOM selector 或发布动作，除非迁移暴露出现既有 transport bug；此时停止并单独报告。
- 不引入 `shell: true`、`cmd.exe /c`、PowerShell 拼接或等价替代。

## Acceptance criteria

- [ ] 生产可达普通平台 Playwright 路径不存在 `execSync(commandString)`、`spawn(..., {shell:true})` 或等价 shell 拼接。
- [ ] session dir、runtime path、filename/code payload 与用户可控字符串均通过 argv/env 传递，Windows 含空格、`&|<>^()%!#` 等路径/参数有回归测试。
- [ ] `pwCmd` / `pwRun` 不再被生产 adapter 消费；若完全无必要则删除公开导出。
- [ ] 列举网、今日头条的登录检查、导航、run-code、发布准备和停止/超时行为定向测试通过。
- [ ] runtime diagnostic 不泄露 Cookie、token、绝对敏感路径或完整正文。
- [ ] 交接记录列出旧→新调用图、同步/异步选择理由、删除的 shell surface 和实际测试命令。

## Suggested verification

- `node --test tests/runtime-diagnostics.test.js tests/platform-browser-session-lifecycle.test.js` 加受影响平台定向测试。
- `rg` 静态门禁只用于证明 shell surface absence；平台业务结果仍由行为测试证明。
- `npm run lint`、相关 typecheck/format、`git diff --check`。
