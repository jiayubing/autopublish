# M28 Auth HTTP/Domain/Token 深度审查

> 状态：已完成（2026-07-24）。

## 模块职责和边界

M28 提供认证 HTTP API、密码校验、账号/授权/设备/会话状态机、refresh token family 轮换、登录锁定、来源限速和审计。SQLite repository 是同步持久化边界，客户端只接收白名单 DTO 与稳定错误码。

## 已检查目录与关键文件

- `auth-server/src/server.js`、`auth-domain.js`、`token-service.js`、`auth-store.js`。
- `auth-server/src/repositories/*` 作为直接持久化契约，以及 `auth-server/tests/*` 全部测试文件。

## 关键调用链

HTTP `readBody/allowFields` → `AuthDomain.login/refresh/changePassword/inspect` → `AuthRepository.transaction`；密码使用 scrypt limiter，token 只以 hash 入库，refresh 重用会撤销 family；`sourceAddress` 生成审计和限速指纹。

## 发现列表

### TEMP-M28-01：登录来源限速 Map 按攻击者可控 loginName 永久保留

- 分类：可用性 / 认证防护
- 严重程度：中
- 置信度：高
- 位置：`auth-server/src/auth-domain.js:197-211,344-351`
- 问题：`_recordSourceAttempt` 以 `loginName + hash(sourceFingerprint)` 为 key 写入 `sourceAttempts`，只在成功登录时删除该 key；没有全局上限、定时清理或按来源聚合。未认证请求可持续提交不同的合法格式登录名，使 Map key 和时间戳数组持续增长。每个请求还会进行 dummy scrypt，放大 CPU/内存压力。
- 影响：长时间暴露的认证服务可被低成本请求耗尽堆内存，导致 GC 抖动或进程 OOM；这不是账号锁定（账号锁定仅针对已存在用户）的替代防护。
- 修复方向：使用有界 TTL/LRU 结构并周期性删除空窗口 key；增加按来源的全局限速和并发上限，必要时把计数放到边缘代理/共享存储。

## 现有控制与测试

字段白名单、请求体 32 KiB 上限、稳定错误映射、scrypt 并发 limiter、账号失败锁定、refresh family 重用检测和审计均有实现。认证测试覆盖登录、设备上限、并发登录、会话 family 和 SQLite schema；没有压力测试证明限速状态有界。

## 未覆盖区域

未在真实反向代理/Cloudflare Tunnel 下验证 `trustProxy`、来源头可信边界、TLS 和跨实例限速；未执行长时间未认证请求压力测试。

## 模块审查结论

M28 深审完成，保留 1 条中风险可用性 finding（TEMP-M28-01）。其余认证状态机和 token 轮换在代码与定向测试中符合当前契约。
