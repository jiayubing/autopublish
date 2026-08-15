# 19-B — 列举网无浏览器 HTTP Session 与 State 单 Writer

**Goal:** 让列举网在有效 AutoPublish `storageState` 下无需启动 Chromium 就能完成登录 probe、城市 GET 和表单 GET，并与现有交互登录共享唯一 state writer 协议。

**Blocked by:** 19-A `COMPLETE`。

## 主 owner / 允许修改

- 列举网 HTTP Session / state lease 私有模块。
- `src/platforms/shared/browser-session-lifecycle.js` 及 runtime composition 中与同一 stateFile 单 writer / 原子保存直接相关的最小范围。
- 显式 Playwright request runtime 依赖、package lock、打包 / runtime tests。

## 本包职责

1. 使用显式声明的 Playwright `request.newContext({ storageState })`，不创建 Browser / Context / Page。
2. 实现不含凭据的登录 GET probe；明确已登录、明确失效和结果无法分类。
3. 在账号专用互斥 / lease 下加载和保存 state；HTTP 与浏览器不得并发覆盖。
4. 有效响应的 Cookie 更新只在业务操作未进入 uncertain 时原子保存；cleanup/save failure 不覆盖主结果。
5. 输出窄 HTTP GET port 供 19-A parser 消费；不暴露 Cookie jar、raw headers 或 state path。

## 禁止跨界

- 不解析城市 / form 业务语义，不生成 body/image manifest，不 POST。
- 不储存用户名 / 密码，不自动解验证码或绕过风控。
- 不把平台专属规则推入通用 browser-session lifecycle。

## Acceptance criteria / 最低验证

- [ ] 有效 state 下的 probe + 两次 GET 测试证明 Browser launch 调用数为 0。
- [ ] 缺失 / 过期 / 损坏 state、登录失效页、超时和安全重定向矩阵通过，GET 不自动网络重试。
- [ ] HTTP / browser 并发、进程重启、原子 rename 失败和 cleanup 失败测试证明单 writer。
- [ ] 日志 / error metadata 不包含 Cookie、Token、raw HTML、联系信息或绝对敏感路径。
- [ ] production packaging 显式包含 HTTP runtime，不依赖 transitive package 偶然存在。

## 停止条件

若现有 state-save 不是标准 storageState、需要迁移或删除真实登录数据，或单 writer 必须重构全局多平台 Session 架构，停止并返回主任务重新切包。
