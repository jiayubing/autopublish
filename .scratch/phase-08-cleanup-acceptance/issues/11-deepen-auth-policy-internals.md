# 11 — 深化 Auth 策略实现

**What to build:** Auth 继续通过现有 AuthDomain/repository/HTTP surface 提供登录、session、device、entitlement、锁定和安全错误，但密码策略、session/device 生命周期、entitlement projection 与限速组合逻辑成为内聚内部模块；HTTP 与数据库 caller 不学习策略顺序或敏感实现。

**Blocked by:** 02 — 消除 `src → desktop` 反向依赖

**Status:** ready-for-agent

## 必读输入

- Ticket 01 的 Auth owner/长模块决策和 Ticket 02 的依赖门禁。
- Phase 7 handoff、Auth RPO/RTO、schema v2 migration、backup/restore、health、trusted proxy 与 limiter contracts。
- Auth domain/repository/server composition、source resolver、bounded limiter 和全部 Auth tests。

## 开始门禁

1. 冻结 Auth schema、public methods、HTTP routes/status、stable error codes、hash/token/device contracts。
2. 运行 Auth 全套、migration、health、rate-limit 和 backup/restore 基线，记录环境与数量。
3. 为 AuthDomain facade 与 internal policy separation 写 contract tests；不得通过测试专用 public seam 拆分。

## 执行过程

1. 将 password/hash validation、user/account lock、session/token/device、entitlement/sanitization 拆为内部策略；AuthDomain 负责组合不变量。
2. 将来源解析、bounded bucket、login policy 保持为不同职责，HTTP 层只解析请求并映射安全响应。
3. repository 继续拥有 SQLite 持久化和事务；domain 不获得 SQL/database handle，repository 不决定 HTTP 文案。
4. 按登录/锁定、session/refresh/device、entitlement 三批迁移并运行 facade 可观察行为。
5. 删除重复 sanitizer、旧 migration compatibility helper、无 caller method 和穿透内部 Map/SQL 的测试；保留关键算法/迁移风险的内部测试。
6. 重跑 100k identity、并发、重启、过期、LRU/TTL、v1 migration login/refresh 与一致快照故障测试。

## 模块边界

- AuthDomain 拥有认证/授权不变量，不解析 proxy header、不写 HTTP response。
- Repository 拥有 Auth SQLite 事务，不输出 secret/raw row。
- Source resolver 只解析可信来源；limiter 只管理有界 key/window/TTL/LRU。
- Projection/sanitizer 只输出安全 DTO，不改变授权事实。

## 验收标准

- [ ] Auth public interface、HTTP contract、schema v2 和稳定错误无意外变化。
- [ ] 登录、refresh、device limit、entitlement、锁定和 logout/revoke 通过同一 facade。
- [ ] 迁移后的 session device hash 与 runtime contract 一致，backup/restore snapshot 保持一致。
- [ ] limiter 有界且来源/identity/组合策略不泄漏到 HTTP caller。
- [ ] 原 Auth 巨型实现已按策略拆分，无浅 pass-through 或测试专用 public seam。
- [ ] DTO/log/test fixture 不包含 password、token、raw header、loginName 或真实账号数据。

## 必跑验证

- Auth 全套、migration、backup/restore/recovery、health、rate-limit/trusted-proxy、container contract。
- Auth lint/type checks（若配置）、Root CI contract、完整 root suite、`git diff --check`。

## 交接与停止条件

- 记录最终 Auth 模块图、public facade、schema、容量/恢复证据和人工 RPO/RTO/proxy gate。
- 若拆分要求改变 Auth public/HTTP/schema 语义，停止并重开 Phase 7。
- 不访问真实 Auth 数据库，不定义人工 RPO/RTO，不自动提交。

