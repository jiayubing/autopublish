# Ticket 11 — 网站媒体供应商契约交接

## 范围

本 ticket 只封装网站媒体供应商的 HTTP/multipart 契约，不注册或调用第三方自媒体接口，不实现付费批次、文章分类、人工核对或图片上传。

## 规范端口

`createMediaSupplierAdapter()` 暴露四个应用端口：

- `refreshMediaResources({ page, pageSize })` → `resources_refreshed`，资源 DTO 只含 `resourceId`、`name`、`price`、`available` 和 `remarks`，并返回分页元数据。
- `createOrder({ mediaResourceId, title, htmlBody, remark?, systemSubmissionId })` → `order_created`、`order_rejected` 或 `uncertain`。
- `getOrderDetails(orderIds)` → `order_details`，只返回规范订单字段和状态名称。
- `cancelOrder(orderId)` → `order_cancelled`、`cancel_rejected` 或 `uncertain`。

`status` 的规范值为 `pending`、`scheduled`、`published`、`rejected`、`aftercare` 和 `unknown`；供应商状态码不会进入应用 DTO。

## 字段和路径映射

| 应用规范字段 | 供应商请求字段 | 端点 |
| --- | --- | --- |
| `apiKey` | `api_key` | 所有请求 |
| `page` | `page` | `/api/media/media_list` |
| `pageSize` | `page_size` | `/api/media/media_list` |
| `mediaResourceId` | `resource_id` | `/api/media/send` |
| `title` | `title` | `/api/media/send` |
| `htmlBody` | `content` | `/api/media/send` |
| `remark` | `remark` | `/api/media/send` |
| `systemSubmissionId` | `third_id` | `/api/media/send` |
| `orderIds` | `order_nids[]` | `/api/media/order_info` |
| `orderId` | `order_nid` | `/api/media/order_cancel` |

`third_id` 只是供应商可见的系统投稿标识快照，不是幂等键；内部投稿尝试身份与它保持独立。旧的 `mediaList`、`sendArticle` 和 `orderInfo` 方法保留为兼容入口，但生产媒体发布、资源刷新和订单同步使用规范端口。

## 错误矩阵

| 供应商事实 | 规范结果 | 应用动作 |
| --- | --- | --- |
| 明确成功且含订单号 | `order_created` | 可以建立真实订单事实 |
| 明确成功但缺订单号 | `uncertain / missing-order-id` | 不创建伪订单，等待人工核对 |
| 连接、读取超时或网络中断 | `uncertain / transport` | 保留不确定结果，禁止自动重试 |
| HTTP 200 但响应不是 JSON/没有成功标志 | `uncertain / protocol` | 保持安全失败，不暴露响应正文 |
| 明确远端拒绝 | `order_rejected` 或 `cancel_rejected` | 按 `article`、`resource`、`account`、`service` 或 `order` 范围处理 |
| 订单状态 0/1/2/4/9 | `pending`/`scheduled`/`published`/`rejected`/`aftercare` | 只把规范状态交给应用层 |
| 未知订单状态 | `status: unknown` | 不猜测业务结果，交给后续同步/核对策略 |

供应商错误码、字段别名、响应正文和原始状态码均停留在 `media-client`、`media-supplier-response` 与 `media-supplier-adapter` 内；安全错误 DTO 只保留稳定 code、scope 和 retryability。

## 测试传输和模块规模

- `tests/phase-11-media-supplier-contract.test.js`：规范 DTO、状态映射、错误范围，以及资源/订单服务的端口接入。
- `tests/phase-11-media-supplier-transport.test.js`：内存 `fetch` 传输，验证 multipart 字段、批量查询、取消、HTTP 拒绝和协议异常；不访问真实服务商或凭据。
- `src/platforms/media/media-supplier-response.js`：247 行，负责响应解析和字段映射。
- `src/platforms/media/media-supplier-adapter.js`：249 行，负责规范结果和安全错误转换。
- `src/platforms/media/media-client.js`：179 行，负责供应商 HTTP/multipart 请求边界。

截至交接时，`npm run typecheck:main`、`npm run lint` 及 ticket11 和相关媒体回归测试均通过。
