# 19-E — 列举网单次 HTTP POST 与远程结果分类

**Goal:** 把 19-A–D 已冻结的目标、表单、正文和图片计划在现有 submission-start 边界后严格发送一次，并输出既有明确成功 / 明确拒绝 / 不确定结果。

**Blocked by:** 19-D `COMPLETE`。

## 主 owner / 允许修改

- 列举网 HTTP transport、response classifier 和 adapter submit capability。
- 列举网结果直接测试以及 Ticket 09 直接 integration regression。
- 现有列举网 URL / remote ID 规范化能力只复用，不建立第二 publication-success primitive。

## 本包职责

1. `submitPreparedPublication` 内在调用 HTTP POST 前将 mutation boundary 标记为已开始；同一 capability 第二次调用直接 `uncertain`。
2. 使用冻结 action 和 multipart，`maxRetries=0`、有界 timeout、不跟随未验证重定向。
3. 按 charset 解码响应，只在获得可验证列举网详情 URL / remote ID 时返回 accepted；单独“发布成功”无 identity 仍 uncertain。
4. 明确拒绝、登录失效、验证码 / 风控、不安全响应和结果无法分类映射到既有稳定 code / outcome，不靠原始异常文本传播。
5. 请求已发出后任何 transport / decode / parse / save-state 不确定都返回 `REMOTE_RESULT_UNKNOWN`，不再 POST。

## 禁止跨界

- 不接入 Playwright fallback（由 19-F 处理），不更改城市、body 或 image manifest。
- 不轮询公开页，不自动 retry，不在 accepted 后再发布或验证第二次。
- 不记录 request body、raw HTML、Cookie、联系方式、图片 bytes 或供应商原始异常。

## Acceptance criteria / 最低验证

- [ ] 明确成功 + detail URL/ID、仅成功文本、明确拒绝、登录失效、验证码、恶意 URL、GBK/UTF-8 响应矩阵通过。
- [ ] 超时、断线、部分响应、响应解码失败、identity 缺失、state-save 失败均不造成第二次 POST。
- [ ] 单 capability 调用两次、进程重启和 late response 测试证明远端 mutation 最多一次。
- [ ] 成功结果继续通过 Ticket 09 唯一 publication-success primitive 持久化。

## 停止条件

若必须新增 outcome / publication-success writer，或列举网成功身份只能通过规格禁止的公开页轮询获得，停止并返回主任务。
