# 03 — 代理来源与登录限速收敛

**What to build:** Auth 在直接暴露、可信反向代理和不可信转发头三种拓扑下都能得到明确的来源地址；攻击者不能通过制造无限 loginName 或来源 key 使限速状态无界增长，同时共享 NAT 和真实用户仍有可解释的登录桶和错误码。

**Blocked by:** None — can start immediately

**Status:** completed

## Scope

- 明确可信代理配置和来源头读取边界，默认不信任客户端自带的转发头。
- 将登录限速拆为有界的来源级和 identity 级桶，支持 TTL/LRU、硬容量上限和窗口过期。
- 保留现有账号锁定、scrypt 并发限制和审计语义，不把内存 limiter 当作跨实例 HA 方案。

## Module boundaries

- **Source resolver:** 只根据显式 trust-proxy 配置解析 remote address；输出规范化 fingerprint 和来源可信度。
- **Bounded limiter:** 只管理 key、窗口、TTL、LRU 和容量；使用可注入时钟，不能读取 HTTP headers 或账号数据库。
- **Login policy:** 只组合来源桶、identity 桶、账号锁定和错误分类；不管理 Map 清理细节。
- **Proxy configuration adapter:** 只解析部署配置并拒绝模糊值；不在运行时猜测 Cloudflare/Tunnel 行为。

每个模块应能用纯内存 fixture 单测，避免把 100k key 压测写进 Auth domain 或 HTTP server 文件；超过约 200 行时按策略、存储和适配器继续拆分。

## Acceptance criteria

- [x] 未配置可信代理时忽略客户端提供的 `Forwarded`/`X-Forwarded-*` 来源头，并使用直接连接地址。
- [x] 配置可信代理时只接受明确列出的 hop/header 规则，并能在诊断中显示“可信来源配置缺失/有效”，不显示原始 header。
- [x] limiter 对 loginName、来源 fingerprint 和组合 key 都有 TTL、LRU 或等价硬上限，key 数和内存增长可观测且有界。
- [x] 来源级桶和 identity 级桶均存在；同一 NAT 下的正常用户不会共享一个无限累积的 identity key。
- [x] 成功登录、窗口过期、服务重启和手动清理都能释放过期状态；错误码与现有客户端契约稳定。
- [x] 100k 个不同 loginName 的压力 fixture 不造成无界 Map 增长；测试不依赖真实 scrypt 时间或真实网络。
- [x] 覆盖 NAT 共享、可信/不可信代理头、重启、窗口过期、LRU 驱逐和并发请求。
- [x] 真实 Cloudflare/Tunnel 来源头不从文档推断为已验收，必须保留人工环境验收记录。

## Implementation notes

- 不引入 PostgreSQL、Redis 或多实例共享状态；若容量证据要求 HA，应另行提出架构决策。
- 不把 source address、loginName 或 raw header 写入 Renderer DTO；审计只保留既定安全 fingerprint。
- 与 Auth health ticket 并行实施，最终由 CI ticket 汇总压力和容器证据。
