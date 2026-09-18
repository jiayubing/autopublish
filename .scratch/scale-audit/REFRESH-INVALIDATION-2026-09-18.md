# Refresh / Invalidation / Feature Owner 有界验证

分支：`codex/refresh-invalidation-owner-fixes`  
基线：`123b0ec4f605ae79d20a3b82a8f32a76b38ae1e4`

## 范围

关闭用户审计指出的五项局部问题：Media coordinator 异步 refresh 合并、订单取消 reason 路由、Platform Feature 页面消费范围、客户级 read revision、文章库收藏媒体查询 owner。

## 实现结果

- Media scope listener 返回 refresh Promise；订单 command-result refresh 与 workspace invalidation 统一为单一路径。
- 补齐 `PAID_ORDER_CANCELLATION_CHANGED`、`REGULAR_QUEUE_GROUP_SUBMISSION_INTERVAL_UPDATED`、`ARTICLE_ATTENTION_DOMAIN_MUTATION` 路由。
- Platform provider 只在实际消费者页面挂载；投稿中心负责 queue initial，账号弹窗/设置按需读取；资源与订单页面不读取 platform queue/profile。
- Article management、attention、submission center 支持 client-scoped cache revision；身份不明或跨客户 mutation 仍全局失效。
- 新增 favorite-media query owner，使用 QueryIdentity 处理 workspace、翻页、乱序、失败和 dispose。
- Submission center 增加同版本 in-flight coalescing、最多 64 项热缓存、失败不缓存和 clear fencing。

## 实际验证

- `node --test` 有界集合：**222/222 通过，0 失败**。覆盖 media feature、workspace coordinator、invalidation reason、submission center、article management、attention、generation、regular queue、订单/取消、paid batch scope 及新回归。
- `node --test tests/renderer-page-navigation.test.js tests/renderer-batch-generation.test.js tests/renderer-order-action-session.test.js tests/renderer-article-attention-actions.test.js`：**10/10 通过**。
- `npm run typecheck:main`：通过。
- `npm run typecheck:renderer`：通过。
- `npm run typecheck:bridge`：通过。
- `npm run lint`：通过。
- `npm run build:renderer`：通过。
- `git diff --check`：通过。

## 未通过/未执行

`npm run format:check` 仍报告 4 个基线未改动文件：`src/domain/identities.js`、`tests/authenticated-runtime.test.js`、`tests/phase-01-domain-contracts.test.js`、`tests/phase-08-content-lifecycle.test.js`。本轮未格式化这些无关文件；本轮修改涉及的格式问题已修复。未运行完整 desktop-core、打包或真实外部验收。

## 有界复审结论

已知 finding、修复 diff、直接调用方、缓存版本不变量、异步 stale fencing、页面 ownership 和回归均通过。SA-06/SA-07 本轮局部目标达到 PASS；整体 scale audit 仍保持 `OVERALL_PENDING`，不宣称 clean HEAD 或发布门禁完成。
