# 04 — 媒体传输安全门禁

**What to build:** 操作员配置媒体服务时能明确看到 endpoint 未配置、无效或未加密状态；客户端在发送 API key、正文或 multipart 之前完成安全策略校验，未显式确认的 HTTP、TLS/hostname 错误和重定向都不会被静默降级或跟随。

**Blocked by:** None — can start immediately

**Status:** completed

## Scope

- 清除公网 HTTP 的隐式默认值和 fallback。
- 为 HTTP endpoint 引入显式 `allowInsecure` 风险确认，并把风险状态投影到安全 Settings DTO。
- 禁止媒体 client 自动跟随 3xx，防止已批准地址把 multipart/API key 重定向到其他 origin。
- 将 TLS 证书错误、hostname 错误、连接/读取超时和配置错误分类为稳定诊断。

## Module boundaries

- **Endpoint policy:** 只解析 URL、协议、origin、allowInsecure 和重定向策略；不发送请求、不持有 API key。
- **Media transport:** 只执行已通过 policy 的请求，显式设置 redirect/error behavior；不决定 Settings 展示文案。
- **Settings projection:** 只输出 configured/disabled/invalid/insecure/secure 状态和脱敏 endpoint；不返回密钥或原始网络错误。
- **Risk confirmation adapter:** 只记录用户对具体 endpoint 的显式确认，endpoint 变化后必须失效；不得提供全局“允许所有 HTTP”。

保持现有 media/domain/application interface 不变；新增策略应作为可注入服务，避免在大型 adapter 中堆叠 URL、fetch 和 UI 状态逻辑。

## Acceptance criteria

- [x] 空配置、无效 URL、非允许协议和缺失 endpoint 均在发送敏感数据前被拒绝。
- [x] HTTP 只有在同一 endpoint 的显式 `allowInsecure` 确认存在且仍有效时才可发送；默认值为拒绝。
- [x] HTTPS 到 HTTP 的重定向不被跟随；任何 3xx 都返回安全分类并保证 API key、正文和 multipart 未发送到新地址。
- [x] TLS 证书错误、hostname mismatch、连接超时、读取超时和服务端错误分别映射到稳定 code/category/retryability。
- [x] Settings 明确显示 disabled、invalid、secure 或 insecure 状态，不提供隐式不安全默认值；API key 只显示 mask。
- [x] endpoint 发生 origin、协议或端口变化时旧风险确认失效，不能复用到新地址。
- [x] 使用 fake endpoint 覆盖 HTTP 未确认拒绝、显式确认成功、3xx、不安全降级、TLS 错误和 timeout；断言敏感 body 未发送。
- [x] 生产 endpoint、HTTP 风险接受和供应商 HTTPS 可用性保留人工验收记录，不从文档或 fake endpoint 推断通过。

## Implementation notes

- 不修改 Auth、PublicationWorkflow、OperationalStore 或 Renderer feature interface。
- 不自动配置 DNS、证书、Cloudflare、WAF，也不把 HTTP 例外扩展到其他服务。
- ticket 06 只负责验证该策略在 production directory 制品中仍生效，不复制策略实现。
