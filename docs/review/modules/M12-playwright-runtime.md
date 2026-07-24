# M12 Playwright/runtime/operator 控制深审

> 深度审查状态：已完成。

## 模块职责和边界

解析打包 Node/Playwright/browser runtime，隔离平台 session/profile/daemon，执行异步或遗留同步 CLI，提供停止/暂停文件信号和只返回安全能力状态的运行诊断。

## 已检查的目录与关键文件

- `src/core/{playwright,operator-flow,stop-signal}.js`。
- `desktop/services/runtime-diagnostics-service.js`、`desktop/ipc/runtime-diagnostics-ipc.js`、runtime 配置/打包清单及对应 tests。

## 关键调用链

runtime configuration → diagnostics 解析 bundled tools → adapter `pwSessionConfig` → `createPlaywrightRuntime`/legacy `pwRun` → child process；设置页 self-check 在 OS temp 创建隔离 profile，最终关闭并删除。

## 发现列表

未建立独立 finding。遗留同步 Playwright 调用会阻塞 worker heartbeat，其可达的 watchdog/ledger 后果已作为 M24 根因链记录；本模块避免重复报告同一缺陷。

## 测试情况

bundled tool 解析、结构化 `execFile` 参数、timeout/error 映射、browser probe 清理、session/profile 隔离和 IPC 安全 DTO 均通过定向测试。

## 未覆盖区域

没有连接真实豆包/头条/列举页面；没有执行真实 Edge profile 登录；遗留 shell 兼容 API只用 fixture runner 验证。

## 待验证问题

现场浏览器版本、登录挑战、profile ACL 和 DOM 行为留给 M16/M25 的外部环境不确定性。

## 模块审查结论

运行时发现和秘密边界清晰；主要可靠性风险发生在 worker watchdog 与同步远端调用组合处，已归入 M24。M12 深审已完成，结论为有条件通过。
