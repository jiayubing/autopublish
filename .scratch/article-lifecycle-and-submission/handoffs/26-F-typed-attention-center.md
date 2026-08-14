# 26-F — Typed attention center handoff

## 范围与基线

- Work package：`26-F — 需处理中心`
- Base integration HEAD：`73b66b1f7735995e78732f95dc502a7d6585febd`
- 本包只修改需处理事项 owner、直接调用方、typed IPC/Renderer、订单身份读端口和直接回归测试；没有进入 26-G 或后续工作包。
- 所有 resolution 测试使用合成数据、内存端口和假 transport；没有真实登录、投稿、付费、取消、订单核对或生产数据库操作。

## Type / owner / action matrix

| 类型 | owner | 稳定 identity | 冻结 | resolution / safe navigation |
| --- | --- | --- | --- | --- |
| `regular_platform_failed` | `regular-platform-outcome` | `publicationId + attemptId` | 默认否 | `open-submission`、文章/发布证据导航；没有 generic retry |
| `regular_platform_uncertain` | `regular-platform-outcome` | `publicationId + attemptId` | 是 | `confirm-regular-accepted`、`confirm-regular-not-accepted`、发布证据导航 |
| `paid_order_creation_uncertain` | `paid-order-creation` | `orderCreationAttemptId` | 是 | `bind-paid-order-number`、`confirm-paid-order-absent`、证据查看 |
| `order_status_anomaly` | `order-reconciliation` | `orderId` / `orderNid` | 是 | `resume-order-tracking`、`confirm-order-published`、`confirm-order-not-published` |
| `removal_needs_repair` | `article-removal-recovery` | `transactionId` | 是 | `retry-removal`、差异查看 |
| `published_archive_failed` | `publication-archive` | `jobId` 或 `publicationId + attemptId + filename` | 是 | `retry-archive`、发布证据查看 |

每个 DTO 都保留 `attentionId`、`owner`、`safeFacts`、`freeze`、`resolutionPriority` 和闭合的 `allowedActions`。Renderer 按 `clientId + articleId` 聚合卡片，但动作仍携带独立 `attentionId`，没有合并原因、token 或 resolution。订单 attention 使用媒体应用的专用 `listOrderAttention` 读端口保留文章身份；普通 `media:get-orders` DTO 不暴露这些内部关联字段。

## 实现结果

- 删除 `retry-publication` 及失败投稿 retry preview；明确失败只导航统一发起投稿入口。
- 不确定普通平台只进入 accepted / not-accepted；付费创建只进入 bind order / confirm absent；系统删除/归档修复没有投稿动作。
- Resolver 按独立 attention ID 预检和执行：`expectedRevision`、准备 token TTL、输入 fingerprint、动作绑定和过期检查均 fail-closed；named resolution port 的未知异常转换为稳定安全错误码。
- 成功 resolution 失效 query，失败 resolution 保留待办；order transition 继续由既有 reconciliation owner 维护发布优先级。
- 历史发布抽屉中的普通平台核对已改为通过 attention resolver，不能绕过 attention ID/revision/token 直接调用旧命令。

## 实际验证

以下命令均在 `auto—publish` 目录运行：

- `node --test tests/article-attention-policy.test.js tests/article-attention-query.test.js tests/phase-06-attention-feature.test.mjs`：**21 passed, 0 failed**。
- `node --test tests/regular-platform-outcome-service.test.js`：**5 passed, 0 failed**。
- 直接 owner、IPC、composition、订单 projection、fact reader 的 `node --check`：通过。
- `git diff --check`：exit 0；只有 Windows 常规 LF→CRLF working-copy warning，无 whitespace error。
- legacy absence scan（`retry-publication`、旧 attention kind、`removal_auto_recovery`）以及 public attention scope 的 `resolutionActions` scan：无命中。

## Primary Audit / bounded re-audit

Primary Audit 限定在本包 diff、六类 type/action 不变量、attention query/policy/resolver、order identity port、历史抽屉和直接测试调用方，没有开启全仓库 fresh review。

发现并在本包内修复：

1. `INTRODUCED_BY_CHANGE`：订单身份只进入 operational projection，曾在 public media order projection 被丢弃，导致 production attention 无法按文章聚合。修复为应用 owner 的专用 attention 读端口，并保留 public order contract 边界。
2. `INTRODUCED_BY_CHANGE`：普通平台 uncertain 的历史发布抽屉仍可直接调用旧 prepare/confirm 命令，绕过 attention resolver。修复为按 `attentionId` 路由到统一 preview/execute。
3. `CROSS_COMPONENT_INTERACTION`：removal transaction 曾按 `publicationId` 隐式抑制独立 publication attention，违反同一文章多事项各自保真。修复为只按稳定 `attentionId` 去重，不跨 owner 删除事项。

Bounded re-audit 只复查以上三项、直接调用方、六类动作/身份/priority/freeze 不变量和同一组定向测试：**21/21 passed，未发现新的 P0/P1 或当前正确性阻塞 P2**。

## 未运行的重要验收与原因

- `npm --prefix media-workbench run lint`、`npm --prefix media-workbench run typecheck:strict`、`npm run typecheck:main`：当前 worktree 未安装 `tsc`。
- `npm --prefix media-workbench run build`：当前 worktree 未安装 Vite。
- `tests/phase-06-content-core-typed-ipc.test.js`、`tests/article-management-snapshot.test.js`、`tests/phase-03-six-stage-article-lifecycle.test.js`、`tests/article-lifecycle-ticket-14.test.js`：加载阶段缺少 `@noble/hashes/sha2.js`。
- `tests/renderer-article-attention-actions.test.js`：加载阶段缺少 `playwright`。
- 全量测试、打包/ASAR、生产发布和任何真实外部操作未运行；其中 ASAR artifact 是既有 `PROCESS_EVIDENCE_GAP`，不属于本包修复范围。既有 attention.listArticleAttention reachability / TypeChecker evidence gap 同样只记录、不越界修复。

## 剩余风险

主要剩余风险是缺少本地依赖导致 TypeScript、Vite build、IPC 合同集成和 Playwright Renderer 验收未能执行；已通过可运行的 owner/resolver/query/feature 回归和语法检查覆盖核心状态边界。未进行真实供应商读取或写操作，故真实账号、订单、远端结果仍需按项目授权和停止条件另行验证。

本 handoff 与实现源码、测试一起构成 26-F 单一意图提交；提交 hash 以最终 Git 记录为准。
