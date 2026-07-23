# 测试套件清单（Phase 0-5）

> 自动生成文件。重新运行 `node scripts/test-inventory.js` 会重新扫描 `tests/*.test.js` 并覆盖本清单。

## 范围与证据边界

- 生成时间：`2026-07-21T16:29:07.360Z`（仅是清单生成时间，不是测试运行时间）。
- 扫描范围：根目录 `tests/*.test.js`，共 **161 个文件**；静态解析出 **909 个测试声明**。
- 本脚本只使用 Node 内置 `fs`、`path` 和字符串扫描；不会 `require` 测试文件，不启动 Node test runner，不启动浏览器、Vite、Electron、Python 或任何外部服务，也不发起网络请求。
- `Renderer build`、`启动浏览器`、`读取生产源码` 均为静态证据标签，不代表本次执行过这些行为；未检测到证据时只表示“未见静态证据”。
- 本文件主体是静态清单；下方“受控执行记录”单独记录本次实际运行结果，不把静态声明数当作通过数。

## 基线记录

| 项目 | 状态 | 证据/采集命令 |
| --- | --- | --- |
| 根测试文件 | 已静态扫描：161 个 | `tests/*.test.js` |
| 根测试声明数 | 已静态解析：909 个 | 不是实际运行结果；需用 `npm test` 采集 |
| 根测试运行时间与通过/失败/跳过 | 待采集 | `npm test` |
| 认证服务测试 | 待采集 | `npm --prefix auth-server test` |
| Renderer lint/typecheck | 待采集 | `npm --prefix media-workbench run lint`（计划命令） |
| Renderer production build 时间与产物体积 | 待采集 | `npm run build:renderer` |
| npm audit | 待采集 | `npm audit` |
| 安装包/包体积 | 待采集 | 需在明确的 alpha/production 构建后记录 |

## 汇总

| 指标 | 数值 |
| --- | ---: |
| 测试文件 | 161 |
| 静态测试声明 | 909 |
| 检测到 Renderer build 静态证据的文件 | 7 |
| 检测到浏览器启动静态证据的文件 | 10 |
| 检测到读取生产源码静态证据的文件 | 40 |
| 未提取出明确不变量、需人工确认的测试声明 | 0 |

### 按主层级的静态测试声明数

| 主层级 | 测试声明数 |
| --- | ---: |
| `domain` | 157 |
| `ipc` | 79 |
| `migration` | 34 |
| `packaging` | 54 |
| `renderer` | 200 |
| `security` | 35 |
| `store` | 350 |

## 文件清单

| 文件 | 测试数 | 主层级 | 构建 Renderer | 启动浏览器 | 读取生产源码 | 字节数 | 文件修改时间 |
| --- | ---: | --- | --- | --- | --- | ---: | --- |
| `tests/adapter-workspace-injection.test.js` | 2 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1975 | `2026-07-12T02:33:02.222Z` |
| `tests/ai-client.test.js` | 11 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8959 | `2026-07-15T11:19:56.406Z` |
| `tests/ai-content-ipc.test.js` | 5 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6085 | `2026-07-18T16:12:17.647Z` |
| `tests/ai-content-service.test.js` | 11 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 12263 | `2026-07-17T16:11:03.657Z` |
| `tests/ai-provider-config-store.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6081 | `2026-07-16T15:29:05.396Z` |
| `tests/ai-provider-ipc.test.js` | 2 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2767 | `2026-07-15T11:19:56.407Z` |
| `tests/ai-provider-service.test.js` | 8 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7581 | `2026-07-16T15:29:05.397Z` |
| `tests/alpha-smoke-verifier.test.js` | 1 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 397 | `2026-07-12T02:33:02.224Z` |
| `tests/application-identity.test.js` | 2 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2085 | `2026-07-17T01:23:14.055Z` |
| `tests/architecture-seams.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 4466 | `2026-07-21T15:58:47.500Z` |
| `tests/article-attention-invalidation.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2585 | `2026-07-18T22:30:02.060Z` |
| `tests/article-attention-policy.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2756 | `2026-07-19T06:58:00.860Z` |
| `tests/article-attention-query.test.js` | 4 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5403 | `2026-07-19T06:58:00.861Z` |
| `tests/article-attention-resolver.test.js` | 2 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2827 | `2026-07-21T15:49:16.936Z` |
| `tests/article-generator.test.js` | 16 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16633 | `2026-07-17T16:09:36.091Z` |
| `tests/article-management-filter-model.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2722 | `2026-07-19T06:35:04.229Z` |
| `tests/article-management-snapshot-benchmark.test.js` | 2 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8029 | `2026-07-21T16:18:53.384Z` |
| `tests/article-management-snapshot.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4172 | `2026-07-21T15:20:15.991Z` |
| `tests/article-removal-recovery-regression.test.js` | 5 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 13185 | `2026-07-19T06:57:22.813Z` |
| `tests/article-review-service.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5651 | `2026-07-15T11:19:56.408Z` |
| `tests/article-store.test.js` | 23 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 20300 | `2026-07-16T14:14:14.752Z` |
| `tests/article-submission-eligibility.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1950 | `2026-07-19T06:29:57.099Z` |
| `tests/article-trash-service.test.js` | 8 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16093 | `2026-07-19T06:57:22.809Z` |
| `tests/article-trash-submission-lifecycle.test.js` | 4 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8315 | `2026-07-19T06:57:22.810Z` |
| `tests/article-version-service.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7088 | `2026-07-18T05:34:01.155Z` |
| `tests/article-workflow.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2221 | `2026-07-19T06:22:12.289Z` |
| `tests/articles-docx.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1095 | `2026-07-17T04:19:00.166Z` |
| `tests/auth-gate.test.js` | 2 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 2696 | `2026-07-20T12:52:04.175Z` |
| `tests/auth-ipc-boundary.test.js` | 1 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1245 | `2026-07-19T13:57:02.166Z` |
| `tests/auth-local-data-boundary.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1684 | `2026-07-19T14:33:14.211Z` |
| `tests/auth-protected-ipc.test.js` | 2 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1550 | `2026-07-20T12:52:04.174Z` |
| `tests/auth-service.test.js` | 8 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8805 | `2026-07-20T12:50:33.193Z` |
| `tests/authenticated-runtime.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1083 | `2026-07-19T18:22:37.777Z` |
| `tests/batch-workspace-scan.test.js` | 1 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1613 | `2026-07-17T03:52:00.540Z` |
| `tests/client-knowledge.test.js` | 23 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 15330 | `2026-07-15T11:19:56.409Z` |
| `tests/client-material-store.test.js` | 9 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 11902 | `2026-07-17T03:52:34.142Z` |
| `tests/content-generation-batch-ipc.test.js` | 5 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6419 | `2026-07-21T15:07:37.995Z` |
| `tests/content-generation-batch-service.test.js` | 11 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 22525 | `2026-07-21T15:09:10.297Z` |
| `tests/content-library-migration.test.js` | 9 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 15292 | `2026-07-17T16:24:19.283Z` |
| `tests/content-submission-batch.test.js` | 12 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 18254 | `2026-07-21T15:49:56.109Z` |
| `tests/content-submission-export.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6570 | `2026-07-19T06:47:18.358Z` |
| `tests/content-submission-ipc.test.js` | 6 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6182 | `2026-07-20T14:55:31.229Z` |
| `tests/content-workbench-regression.test.js` | 8 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 5930 | `2026-07-21T15:59:51.855Z` |
| `tests/content-workspace.test.js` | 7 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3665 | `2026-07-12T02:33:02.226Z` |
| `tests/desktop-ipc-response.test.js` | 5 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1281 | `2026-07-12T02:33:02.227Z` |
| `tests/desktop-packaging.test.js` | 32 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 35838 | `2026-07-19T14:08:03.838Z` |
| `tests/desktop-task-service.test.js` | 6 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 9112 | `2026-07-19T10:42:24.413Z` |
| `tests/desktop-workbench-flow.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1781 | `2026-07-21T15:02:31.553Z` |
| `tests/device-identity-store.test.js` | 2 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1555 | `2026-07-19T13:56:52.081Z` |
| `tests/docx-text-extractor.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1914 | `2026-07-17T03:48:23.042Z` |
| `tests/doubao-browser-adapter.test.js` | 28 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 30720 | `2026-07-16T14:14:14.754Z` |
| `tests/doubao-collection-ipc.test.js` | 12 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16683 | `2026-07-15T11:19:56.413Z` |
| `tests/doubao-collection-queue.test.js` | 13 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 14836 | `2026-07-14T00:29:57.762Z` |
| `tests/doubao-collection-service.test.js` | 17 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17065 | `2026-07-15T11:19:56.413Z` |
| `tests/doubao-content-workbench.test.js` | 22 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 14352 | `2026-07-21T15:59:51.856Z` |
| `tests/doubao-page-parser.test.js` | 11 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6134 | `2026-07-14T00:29:57.763Z` |
| `tests/electron-security.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2233 | `2026-07-19T14:02:58.080Z` |
| `tests/generation-batch-runner.test.js` | 14 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17660 | `2026-07-20T12:54:53.254Z` |
| `tests/generation-batch-store.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8699 | `2026-07-16T14:14:14.755Z` |
| `tests/generation-snapshot-event.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6198 | `2026-07-21T16:27:44.228Z` |
| `tests/generation-snapshot-order.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1925 | `2026-07-21T15:42:43.095Z` |
| `tests/generation-submission-handoff-ipc.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2295 | `2026-07-19T07:00:21.302Z` |
| `tests/generation-submission-handoff.test.js` | 5 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7631 | `2026-07-19T07:13:25.757Z` |
| `tests/hepan-article-source.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3741 | `2026-07-18T14:22:14.460Z` |
| `tests/hepan-login-check.test.js` | 8 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 11076 | `2026-07-21T13:29:28.368Z` |
| `tests/hepan-provider-settings.test.js` | 10 | `store` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 14175 | `2026-07-21T12:32:37.119Z` |
| `tests/hepan-publish-contract.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7148 | `2026-07-20T01:29:43.266Z` |
| `tests/hepan-publish-interval.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4382 | `2026-07-18T14:25:00.009Z` |
| `tests/hepan-python-payload-runtime.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6495 | `2026-07-18T16:05:11.565Z` |
| `tests/hepan-settings-patch-contract.test.js` | 10 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 12170 | `2026-07-21T12:26:54.296Z` |
| `tests/ipc-submission-boundary.test.js` | 6 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5880 | `2026-07-12T02:33:02.227Z` |
| `tests/j4125-auth-contract.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 992 | `2026-07-19T14:11:14.850Z` |
| `tests/legacy-migration.test.js` | 16 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17669 | `2026-07-14T00:29:57.764Z` |
| `tests/legacy-platform-settings-migration.test.js` | 3 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5649 | `2026-07-17T16:25:10.589Z` |
| `tests/media-article-converter.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 963 | `2026-06-27T13:41:22.783Z` |
| `tests/media-article-drawer-boundary.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 776 | `2026-07-16T15:53:25.954Z` |
| `tests/media-client.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1267 | `2026-06-27T13:41:22.783Z` |
| `tests/media-draft-store.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2391 | `2026-06-27T13:41:22.783Z` |
| `tests/media-order-service.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 8983 | `2026-07-18T05:43:39.907Z` |
| `tests/media-preflight.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1453 | `2026-06-27T13:41:22.783Z` |
| `tests/media-provider-settings.test.js` | 4 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4216 | `2026-07-17T15:41:44.291Z` |
| `tests/media-resource-service.test.js` | 6 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6187 | `2026-06-27T13:41:22.784Z` |
| `tests/media-resource-ux.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 866 | `2026-07-16T15:53:25.955Z` |
| `tests/media-runtime-workspace.test.js` | 7 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 10037 | `2026-07-18T05:01:14.947Z` |
| `tests/media-workbench-flow.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 885 | `2026-07-16T15:53:25.956Z` |
| `tests/media-workbench-service.test.js` | 10 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 10597 | `2026-07-18T05:01:14.945Z` |
| `tests/packaged-docx-runtime.test.js` | 2 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 849 | `2026-07-17T04:13:49.522Z` |
| `tests/packaged-playwright-runtime.test.js` | 3 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2694 | `2026-07-17T01:16:13.118Z` |
| `tests/platform-browser-session-lifecycle.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1555 | `2026-07-19T18:22:37.782Z` |
| `tests/platform-ipc-boundary.test.js` | 4 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8904 | `2026-07-21T15:39:45.282Z` |
| `tests/platform-provider-config-store.test.js` | 4 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5152 | `2026-07-17T15:38:18.981Z` |
| `tests/platform-settings-service.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5068 | `2026-07-17T15:38:18.981Z` |
| `tests/platform-submission-invocation-count.test.js` | 2 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8197 | `2026-07-21T16:28:24.919Z` |
| `tests/platform-task-progress.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3647 | `2026-07-19T10:23:50.866Z` |
| `tests/platform-workbench-service.test.js` | 4 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4959 | `2026-07-16T14:14:14.756Z` |
| `tests/production-packaging.test.js` | 1 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 902 | `2026-07-20T01:27:39.871Z` |
| `tests/prompt-builder.test.js` | 11 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6658 | `2026-07-17T16:09:06.766Z` |
| `tests/publication-article-identity.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1729 | `2026-07-18T04:43:24.278Z` |
| `tests/publication-duplicate-guard.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3979 | `2026-07-18T04:39:41.478Z` |
| `tests/publication-ipc.test.js` | 3 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4440 | `2026-07-18T05:35:53.366Z` |
| `tests/publication-ledger-index.test.js` | 1 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1795 | `2026-07-19T18:22:37.790Z` |
| `tests/publication-ledger-migration.test.js` | 5 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 9709 | `2026-07-18T05:11:57.014Z` |
| `tests/publication-ledger-store.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3684 | `2026-07-18T14:25:28.146Z` |
| `tests/publication-ledger.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4194 | `2026-07-18T04:49:40.163Z` |
| `tests/publication-targets.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1483 | `2026-07-18T04:43:24.278Z` |
| `tests/published-archive.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4683 | `2026-07-16T15:16:25.061Z` |
| `tests/published-article-trash.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6622 | `2026-07-19T06:57:22.811Z` |
| `tests/question-store.test.js` | 12 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16350 | `2026-07-14T00:29:57.765Z` |
| `tests/react-workbench-regression.test.js` | 8 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 4654 | `2026-07-21T16:00:22.076Z` |
| `tests/renderer-ai-provider-settings.test.js` | 8 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 4332 | `2026-07-21T15:59:51.858Z` |
| `tests/renderer-article-attention-actions.test.js` | 1 | `renderer` | 否（未见静态证据） | 是（检测到 chromium/firefox/webkit/electron launch 调用） | 否（未见静态证据） | 8053 | `2026-07-21T16:11:47.918Z` |
| `tests/renderer-article-history.test.js` | 9 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 7699 | `2026-07-21T15:35:58.419Z` |
| `tests/renderer-article-management-filters.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1131 | `2026-07-19T06:22:12.290Z` |
| `tests/renderer-article-management-flow.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 958 | `2026-07-19T02:46:12.415Z` |
| `tests/renderer-batch-generation.test.js` | 25 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 15614 | `2026-07-21T15:57:39.736Z` |
| `tests/renderer-confirmation-host.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2541 | `2026-07-21T12:33:54.120Z` |
| `tests/renderer-content-client-switch.test.js` | 7 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 19672 | `2026-07-21T16:15:05.222Z` |
| `tests/renderer-content-confirmation-flow.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1559 | `2026-07-20T16:38:14.928Z` |
| `tests/renderer-content-generation.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1609 | `2026-07-18T10:03:11.311Z` |
| `tests/renderer-content-refresh-lifecycle.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2554 | `2026-07-20T14:53:50.674Z` |
| `tests/renderer-content-submission-batch-actions.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2101 | `2026-07-21T16:05:58.431Z` |
| `tests/renderer-encoding.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1943 | `2026-07-16T15:57:39.222Z` |
| `tests/renderer-generation-submission-handoff.test.js` | 1 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 7381 | `2026-07-21T16:15:05.223Z` |
| `tests/renderer-hepan-settings.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1281 | `2026-07-21T12:34:29.512Z` |
| `tests/renderer-history-editor-flow.test.js` | 5 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 21243 | `2026-07-21T16:16:43.415Z` |
| `tests/renderer-platform-cross-page-progress.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 754 | `2026-07-19T10:01:33.349Z` |
| `tests/renderer-platform-queue-refresh-lifecycle.test.js` | 1 | `renderer` | 否（未见静态证据） | 是（检测到 chromium/firefox/webkit/electron launch 调用） | 否（未见静态证据） | 12098 | `2026-07-21T15:02:31.552Z` |
| `tests/renderer-platform-queue-refresh.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1040 | `2026-07-18T17:54:37.975Z` |
| `tests/renderer-platform-task-store.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 735 | `2026-07-19T10:01:33.349Z` |
| `tests/renderer-publication-history.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 3908 | `2026-07-21T16:06:18.890Z` |
| `tests/renderer-published-trash-flow.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1133 | `2026-07-20T12:49:58.673Z` |
| `tests/renderer-question-editor-session.test.js` | 5 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 10740 | `2026-07-21T16:13:01.810Z` |
| `tests/renderer-residue-cleanup-flow.test.js` | 2 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 9739 | `2026-07-21T16:13:14.002Z` |
| `tests/renderer-resource-library-api.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 902 | `2026-07-21T15:31:29.652Z` |
| `tests/renderer-responsive-layout.test.js` | 6 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 20407 | `2026-07-21T16:13:27.507Z` |
| `tests/renderer-settings-window-focus.electron.test.js` | 1 | `renderer` | 否（未见静态证据） | 是（检测到 chromium/firefox/webkit/electron launch 调用） | 否（未见静态证据） | 9094 | `2026-07-21T12:48:58.334Z` |
| `tests/renderer-settings.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 3002 | `2026-07-17T15:57:34.942Z` |
| `tests/renderer-template-discovery-empty-client.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2344 | `2026-07-18T04:39:41.478Z` |
| `tests/renderer-time-format.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1521 | `2026-07-16T14:14:14.756Z` |
| `tests/renderer-workspace-behavior.test.js` | 7 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7348 | `2026-07-14T15:32:26.385Z` |
| `tests/renderer-workspace-contract.test.js` | 7 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 4227 | `2026-07-21T15:59:51.859Z` |
| `tests/research-store.test.js` | 9 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7193 | `2026-07-14T00:29:57.765Z` |
| `tests/runtime-diagnostics-ipc.test.js` | 2 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2435 | `2026-07-17T04:18:37.353Z` |
| `tests/runtime-diagnostics.test.js` | 15 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16030 | `2026-07-17T03:59:38.089Z` |
| `tests/runtime-tools.test.js` | 2 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3223 | `2026-07-17T01:13:43.236Z` |
| `tests/storage-maintenance-service.test.js` | 6 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8924 | `2026-07-16T14:14:14.757Z` |
| `tests/storage-paths.test.js` | 4 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4546 | `2026-07-18T04:50:22.569Z` |
| `tests/submission-attempt-rebind.test.js` | 2 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6991 | `2026-07-19T06:57:22.812Z` |
| `tests/submission-batch-reconcile-write.test.js` | 1 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2332 | `2026-07-19T18:22:37.795Z` |
| `tests/submission-batch-worker-integration.test.js` | 7 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 13014 | `2026-07-20T16:15:29.281Z` |
| `tests/submission-pair-state.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8840 | `2026-07-19T06:57:22.814Z` |
| `tests/submission-preflight-integration.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 749 | `2026-07-12T02:33:02.230Z` |
| `tests/template-catalog.test.js` | 6 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6119 | `2026-07-18T09:55:58.113Z` |
| `tests/template-generation-contract.test.js` | 1 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4600 | `2026-07-20T13:17:29.442Z` |
| `tests/template-store.test.js` | 13 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 9940 | `2026-07-18T10:14:12.074Z` |
| `tests/workspace-bootstrap-ipc.test.js` | 9 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 10591 | `2026-07-14T15:32:26.386Z` |
| `tests/workspace-bootstrap-service.test.js` | 33 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 37485 | `2026-07-16T14:14:14.758Z` |
| `tests/workspace-data-invalidation.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3424 | `2026-07-18T22:13:02.730Z` |
| `tests/workspace-location-store.test.js` | 11 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 11880 | `2026-07-14T15:32:26.387Z` |
| `tests/workspace-paths.test.js` | 8 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 11418 | `2026-07-18T04:50:22.568Z` |
| `tests/workspace-validator.test.js` | 11 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 12299 | `2026-07-14T15:32:26.388Z` |

## 测试声明明细

每一项的层级和不变量都是静态候选。`待人工确认` 不表示该测试无价值，只表示自动扫描没有足够语义证据；删除前必须人工确认替代覆盖。

### `tests/adapter-workspace-injection.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `media adapters scan only their injected workspace input without module reload` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: deep-equal |
| 21 | `Hepan workspace config overrides inherited global configuration` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: deep-equal |

### `tests/ai-client.test.js`

- 测试声明数：**11**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 24 | `requires explicit configuration instead of reading process environment` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 37 | `posts model and messages to the OpenAI compatible chat endpoint` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 56 | `validates required configuration and rejects a full completion endpoint` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 83 | `maps provider failures without exposing the API key` | — | `domain` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 92 | `maps network failures, invalid JSON, and missing output to safe errors` | — | `domain` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 110 | `maps external AbortErrors to safe request failures` | — | `domain` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 121 | `accepts and forwards an external abort signal` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 138 | `aborts a request that exceeds the configured timeout` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 151 | `rejects a successful response that arrives after the timeout` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 162 | `rejects a successful response body that arrives after the timeout` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 179 | `keeps the timeout active while reading a response body` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |

### `tests/ai-content-ipc.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 12 | `registers the complete thin content IPC surface` | — | `ipc` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: createIpc :: equal + deep-equal |
| 32 | `wraps coded service errors without stack traces` | — | `ipc` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: createIpc :: deep-equal |
| 41 | `returns safe provenance validation errors through the generation IPC boundary` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: createIpc :: equal + deep-equal |
| 53 | `rejects non-object generation payloads without exposing internal details` | — | `ipc` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: createIpc :: deep-equal |
| 60 | `exposes safe removal transaction query and retry handlers` | — | `ipc`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | IPC stub: handlers :: deep-equal |

### `tests/ai-content-service.test.js`

- 测试声明数：**11**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 53 | `reads single-generation materials through a logical client id` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore + 文件 fixture: writeFileSync :: equal |
| 82 | `lists local content without creating an AI client` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 91 | `exposes one file-driven template catalog for single and batch consumers` | — | `store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 99 | `creates the AI client only while generating and saves separately` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 108 | `preserves safe AI configuration failures without touching local reads` | — | `store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 116 | `rejects missing request identifiers before invoking dependencies` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 124 | `passes multiple research ids to the generator in the requested order` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 135 | `rejects empty, duplicate, and oversized research id arrays at the service boundary` | — | `security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 147 | `exposes material metadata through the client DTO and retries one material` | — | `domain` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 181 | `reviews explicitly selected articles through the main content service` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 188 | `requires explicit material and research selections and forwards provenance ids` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/ai-provider-config-store.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 30 | `encrypts the API key in application userData and reads it back` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + store/service stub: createAiProviderConfigStore + 文件 fixture: readFileSync :: equal + deep-equal |
| 47 | `fails closed when safeStorage is unavailable` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: createTempDirectory + store/service stub: createAiProviderConfigStore :: equal + throws/rejects |
| 61 | `rejects corrupt, symlinked, and non-atomic configuration files` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: createTempDirectory + store/service stub: createAiProviderConfigStore + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 92 | `clears an absent configuration idempotently` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: createTempDirectory + store/service stub: createAiProviderConfigStore :: deep-equal |
| 103 | `stores only a no-secret connection result outside formal provider configuration` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: createTempDirectory + store/service stub: createAiProviderTestStatusStore + 文件 fixture: readFileSync :: equal + deep-equal + throws/rejects |

### `tests/ai-provider-ipc.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 12 | `registers a thin safe configuration boundary` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | IPC stub: createIpc :: equal + deep-equal |
| 35 | `returns only coded safe errors` | — | `ipc` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | IPC stub: createIpc :: equal + deep-equal |

### `tests/ai-provider-service.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 36 | `reports an application configuration without exposing the API key` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createAiProviderService :: deep-equal |
| 44 | `gives complete operating-system AI settings read-only priority` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createAiProviderService :: equal + throws/rejects |
| 59 | `saves locally without creating or calling a network client` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | store/service stub: createAiProviderService :: equal |
| 72 | `tests a draft with fixed messages and preserves the saved configuration on failure` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createAiProviderService :: equal + deep-equal + throws/rejects |
| 94 | `exposes a safe transient failure without writing or replacing the saved configuration` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createTestStatusStore :: equal + deep-equal + throws/rejects |
| 117 | `records only a safe successful test result, supports clear, and fingerprints settings` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createTestStatusStore :: equal + deep-equal |
| 138 | `tests a first draft without creating formal application configuration` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createTestStatusStore :: equal + deep-equal |
| 159 | `blocks configuration mutations while a generation batch is running or stopping` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createAiProviderService :: throws/rejects |

### `tests/alpha-smoke-verifier.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 6 | `alpha smoke verifier initializes a disposable workspace and checks diagnostics` | — | `packaging`、`store` | 工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/application-identity.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `uses one stable application name and app id for development and packaging` | — | `packaging` | 打包边界、运行时依赖与应用身份保持一致 | 文件 fixture: readFileSync :: deep-equal + match |
| 19 | `requires explicit confirmation and never overwrites canonical application config during legacy import` | — | `packaging`、`migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal + deep-equal + throws/rejects |

### `tests/architecture-seams.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `attention and workspace seams keep ownership and dependency direction explicit` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: match |
| 36 | `business views use domain bridges instead of Electron transport or main-process files` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcRenderer :: match |
| 52 | `article management owns one revisioned snapshot seam` | — | `renderer` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 65 | `electron transport facade is gone and domains own their bridge seams` | — | `renderer` | 内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |

### `tests/article-attention-invalidation.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 15 | `merges concurrent refreshes, notifies once per accepted snapshot, and keeps one revision source` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createArticleAttentionStore :: equal + truthiness |
| 45 | `does not let an older snapshot replace a newer accepted revision` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createArticleAttentionStore :: equal |

### `tests/article-attention-policy.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `failed active saved publication exposes retry and publication navigation only` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 28 | `failed publication with a cleanable queue binding exposes cleanup but not retry-publication` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 43 | `removed failed publication without residue is historical, not current attention` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 59 | `generated failed publication can open article and publication but cannot retry directly` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 72 | `missing capabilities hide actions` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/article-attention-query.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 6 | `publication-only failed fixture exposes only actions supported by its current facts` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 35 | `removed failed publication is excluded from attention while remaining queryable as history` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 53 | `article attention query aggregates safe, actionable DTOs without filesystem paths` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>资源 DTO、分页与外部数据归一化保持稳定 | — |
| 80 | `article attention query revision changes only after explicit invalidation` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/article-attention-resolver.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `article attention resolver previews and delegates a safe missing-pair finalize` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 26 | `article attention resolver rejects an old revision before writing` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/article-generator.test.js`

- 测试声明数：**16**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 31 | `loads dependencies in order, cleans markdown, and returns a generated article` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 45 | `blocks an empty research answer before template or AI access` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 53 | `blocks a GEO answer marked incomplete even when its text is non-empty` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 65 | `surfaces empty AI output and does not manufacture an article` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 72 | `removes markdown fences and derives a title from the first line` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 79 | `removes model preambles and template section markers from publishable output` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 88 | `creates a new id for repeated inputs and derives source flags from supplied data` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 103 | `retries a duplicate generated id instead of returning it twice` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 111 | `rejects unsafe ids and an id generator that cannot escape duplicates` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 121 | `reads multiple research records in order and returns safe immutable snapshots` | — | `domain` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 147 | `deeply clones object and array reference snippets in research snapshots` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 173 | `blocks any empty answer before template or AI access` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 183 | `rejects empty, duplicate, and oversized research id lists` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 193 | `loads explicitly selected materials and persists material, template, batch, and task snapshots` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 232 | `rejects missing or damaged selected materials before AI access` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 245 | `uses the catalog seam for a body-only template and snapshots a derived display name` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/article-management-filter-model.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 16 | `exposes exactly five mutually exclusive stages` | — | `renderer` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 34 | `allows local cleanup only for terminal publication results` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/article-management-snapshot-benchmark.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 163 | `records current p50/p95 time, logical scans, and IPC reads for each fixture size` | — | `ipc` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 189 | `records one snapshot IPC and one logical read per storage category` | — | `ipc` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |

### `tests/article-management-snapshot.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 28 | `combines one client read into a revisioned snapshot and reuses it` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 42 | `isolates clients and invalidates only after the workspace revision changes` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 58 | `exposes only the client-scoped snapshot seam through IPC` | — | `ipc` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + IPC stub: handlers :: equal |

### `tests/article-removal-recovery-regression.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 68 | `returns per-item residue cleanup failures and recomputes the remaining disk state` | — | `domain` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createContentSubmissionService + 文件 fixture: writeFileSync :: equal |
| 127 | `executes a failed cleanup whose queue pair points to a historical failed attempt` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 143 | `revalidates and completes a needs_repair journal after the evaluator is fixed` | — | `domain` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 175 | `re-evaluates a stale needs_repair cleanup after both queue files disappear and consumes idempotent completion` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 216 | `reuses one open transaction for repeated identical removal confirmation` | — | `domain` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createArticleTrashService :: equal |

### `tests/article-review-service.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 46 | `reviews only explicitly selected generated articles across clients` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 58 | `reviews a cross-client selection and reports incomplete source provenance` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: fakeStore :: equal + deep-equal |
| 77 | `rejects empty title/body, incomplete provenance, and damaged records with reasons` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: fakeStore :: deep-equal |
| 107 | `is idempotent for saved articles and does not change review timestamps` | — | `domain` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: fakeStore :: equal + deep-equal |

### `tests/article-store.test.js`

- 测试声明数：**23**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 38 | `saves and reads a complete generated article` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 44 | `writes editable markdown alongside full JSON metadata` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: deep-equal + match |
| 55 | `replaces both files when saving an updated article id` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: deep-equal + match |
| 63 | `lists direct article JSON records by updatedAt descending` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal |
| 73 | `rejects unsafe client and article path segments` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 82 | `rejects Windows reserved device names in client and article path segments` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 89 | `rejects articles missing required content or provenance fields` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 101 | `rejects damaged JSON, missing markdown, and mismatched markdown` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 117 | `reads markdown checked out with Windows CRLF line endings` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: deep-equal |
| 129 | `ignores temporary and non-JSON files while listing` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal |
| 138 | `recovers a complete prior article after an interrupted two-file update` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 160 | `rejects generated client directories that resolve outside generated` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: throws/rejects |
| 181 | `normalizes a legacy single research id without manufacturing snapshots` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 203 | `accepts an IPC-roundtripped legacy article with matching singular and plural research ids` | — | `migration`、`ipc`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 222 | `rejects inconsistent singular and plural research ids without snapshots` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 232 | `requires new research ids and snapshots to correspond` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 241 | `persists and validates explicit material and template provenance` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 261 | `reviews an article in its existing customer directory without changing creation metadata` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 272 | `rejects mixed legacy and new research metadata instead of dropping new ids` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 289 | `rejects legacy metadata that already contains research snapshots` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 298 | `moves the JSON and Markdown pair into the trash and restores the pair` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 326 | `rolls back both source files when the paired trash move fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 356 | `rejects an unsafe or conflicting trash path without changing the article` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: deep-equal + throws/rejects |

### `tests/article-submission-eligibility.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 20 | `allows a complete generated article without a review click` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 25 | `uses the same policy for saved articles and returns stable Chinese reason codes` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 32 | `blocks incomplete provenance instead of manufacturing a source` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/article-trash-service.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 48 | `creates a minimal tombstone, keeps queue copies and records, and restores articles` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 83 | `requires a one-time confirmation token before permanent deletion` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 103 | `keeps only a terminal tombstone after permanent deletion and never restores the article` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: equal + deep-equal + throws/rejects |
| 144 | `does not create a tombstone when the source article is damaged` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 154 | `previews and commits one coordinated removal, cancelling only its queued attempt` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createContentSubmissionService :: equal |
| 180 | `blocks an entire selection when one publication is active and leaves every side effect untouched` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createContentSubmissionService :: equal |
| 202 | `resumes a confirmed removal from the durable transaction after an interruption` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createContentSubmissionService :: equal |
| 226 | `exposes deletion, restore, trash listing, and confirmation IPC without external calls` | — | `ipc`、`store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + IPC stub: handlers + store/service stub: createAiContentService :: equal + deep-equal |

### `tests/article-trash-submission-lifecycle.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 44 | `cancels unchanged queued pairs, removes both files, and preserves title/history` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot :: equal |
| 62 | `blocks the whole selection when any target is active` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot :: equal |
| 83 | `recovers a confirmed transaction forward without recreating cancelled work` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createArticleRemovalService :: equal |
| 105 | `marks old trashed-source residue and skips before the adapter remote call` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createPlatformWorkbenchService :: equal |

### `tests/article-version-service.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 83 | `reads the source and creates a fresh generated version without publishing metadata` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createMemoryStore :: equal + deep-equal |
| 112 | `does not mutate the source and does not share nested content metadata` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createMemoryStore :: equal + deep-equal |
| 131 | `rejects a conflicting generated id instead of overwriting an article` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createMemoryStore :: equal + throws/rejects |
| 152 | `rejects illegal input and unsafe generated ids before saving` | — | `domain` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createMemoryStore :: equal + throws/rejects |

### `tests/article-workflow.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 17 | `derives the five exclusive stages and preserves failure priority` | — | `renderer` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/articles-docx.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `parses an article DOCX with the bundled extractor and keeps the source path` | — | `security` | 安全边界与敏感信息不泄露<br>文档文本提取与空/损坏输入错误语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: equal + match |

### `tests/auth-gate.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 15 | `does not mount the workspace before authentication` | — | `renderer`、`security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 浏览器/Renderer fixture: browser.newPage :: equal |
| 36 | `keeps the workspace mounted and shows recovery state for a temporary auth outage` | — | `renderer`、`security`、`store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspacePath + 浏览器/Renderer fixture: browser.newPage :: equal |

### `tests/auth-ipc-boundary.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `exposes only auth operations and broadcasts state changes` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal + deep-equal |

### `tests/auth-local-data-boundary.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 6 | `sends only authentication metadata and never workspace content` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspacePath + store/service stub: createAuthService :: deep-equal + match |

### `tests/auth-protected-ipc.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `returns AUTH_REQUIRED before invoking a business handler` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 23 | `preserves the concrete temporary authentication error code` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |

### `tests/auth-service.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 29 | `uses the fixed HTTPS endpoint and keeps access tokens in memory` | — | `security` | 安全边界与敏感信息不泄露 | store/service stub: createAuthService :: equal |
| 42 | `maps server failures to fixed non-sensitive error codes` | — | `security` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createAuthService :: throws/rejects |
| 47 | `preserves stable lock and rate-limit codes regardless of HTTP status` | — | `security` | 安全边界与敏感信息不泄露 | store/service stub: createAuthService :: throws/rejects |
| 54 | `allows the six-character password floor for password replacement` | — | `security` | 安全边界与敏感信息不泄露 | store/service stub: createAuthService :: equal |
| 60 | `coalesces concurrent protected calls into one refresh request` | — | `security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | 临时目录: mkdtempSync + store/service stub: createAuthService :: equal + deep-equal |
| 90 | `keeps the encrypted refresh token and account state through temporary failures` | — | `security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + store/service stub: createAuthService :: equal + throws/rejects |
| 121 | `clears the session only for a terminal refresh error and ignores stale responses` | — | `security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | 临时目录: mkdtempSync + store/service stub: createAuthService :: equal + throws/rejects |
| 157 | `refreshes before expiry, unrefs timers, and backs off temporary failures` | — | `security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createAuthService :: equal |

### `tests/authenticated-runtime.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `starts once, exposes bootstrap state, and disposes idempotently` | — | `security` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspacePath :: equal + deep-equal |

### `tests/batch-workspace-scan.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `scans media only from AUTO_PUBLISH_WORKSPACE input` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal |

### `tests/client-knowledge.test.js`

- 测试声明数：**23**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 46 | `lists clients with metadata and first-level knowledge files` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 55 | `lists a client without search_query.txt when questions.json already exists` | — | `store` | 客户端知识、问题查询与来源数据保持稳定 | — |
| 64 | `lists a client without search_query.txt when questions.json can be created` | — | `store` | 客户端知识、问题查询与来源数据保持稳定 | — |
| 74 | `rejects null and non-string workspace roots with a boundary error` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot :: throws/rejects |
| 85 | `treats a workspace named clients as a workspace root` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: equal + deep-equal |
| 104 | `reads query and knowledge with explicit workspace context` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 109 | `rejects an explicit boundary whose clients root is not workspace.clients` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: throws/rejects |
| 123 | `uses directory defaults when client metadata is missing` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 130 | `normalizes unexpected clients root realpath errors` | — | `domain` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 147 | `normalizes unexpected client directory realpath errors` | — | `domain` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 167 | `keeps missing workspace and clients roots as an empty client list` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 175 | `does not use the workspace as clients root when clients is missing` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 186 | `rejects a clients root that is a regular file` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 195 | `rejects client metadata that is not a regular file` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 204 | `rejects client metadata symlinks resolving outside the client directory` | — | `security` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |
| 220 | `requires context instead of trusting a clients basename` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | store/service stub: fakeClient + 文件 fixture: writeFileSync :: throws/rejects |
| 228 | `rejects a client symlink resolving outside workspace.clients` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 238 | `rejects a clients root symlink resolving outside the workspace` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |
| 262 | `rejects a search query file link resolving outside the client directory` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |
| 278 | `rejects a search query entry that is not a regular file` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 287 | `rejects missing and empty queries` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定 | 文件 fixture: writeFileSync :: throws/rejects |
| 294 | `reports a missing client before checking its search query` | — | `store` | 客户端知识、问题查询与来源数据保持稳定 | — |
| 301 | `rejects directories outside workspace.clients` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/client-material-store.test.js`

- 测试声明数：**9**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 45 | `lists only first-level supported material files` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore :: deep-equal |
| 56 | `parses a real DOCX with the default converter when MarkItDown is unavailable` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>文档文本提取与空/损坏输入错误语义保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore :: equal + match + truthiness |
| 78 | `reads, retries, and selects materials by logical client id when its directory has another name` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore + 文件 fixture: writeFileSync :: equal + deep-equal |
| 104 | `supports text extensions and ignores reserved, hidden, nested, and generated files` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore + 文件 fixture: writeFileSync :: deep-equal |
| 119 | `reuses a DOCX conversion cache and invalidates it when the source changes` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>文档文本提取与空/损坏输入错误语义保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore + 文件 fixture: readFileSync :: equal + deep-equal |
| 153 | `stores DOCX cache under injected local state instead of the content workspace` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>文档文本提取与空/损坏输入错误语义保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: localStateRoot + store/service stub: createClientMaterialStore :: equal |
| 184 | `returns a safe failure DTO and retries only the failed DOCX` | — | `store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore :: equal + deep-equal |
| 217 | `selects materials by opaque id without accepting renderer paths` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore :: deep-equal + throws/rejects |
| 228 | `skips linked materials and rejects client paths outside the workspace` | — | `store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createClientMaterialStore + 文件 fixture: writeFileSync :: deep-equal + throws/rejects |

### `tests/content-generation-batch-ipc.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 12 | `registers the complete safe batch surface and wraps successful calls` | — | `ipc`、`store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcMain + store/service stub: fakeIpc :: deep-equal + truthiness |
| 28 | `returns only allowlisted error code and message without provider details` | — | `ipc`、`store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcMain + store/service stub: fakeIpc :: equal + deep-equal |
| 37 | `returns safe template identity details for invalid batch templates` | — | `ipc`、`store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcMain + store/service stub: fakeIpc :: equal + deep-equal |
| 65 | `subscribes and unsubscribes renderer state listeners` | — | `renderer`、`ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcMain + store/service stub: fakeIpc :: equal + deep-equal |
| 75 | `forwards the batch id and configuration confirmation for continuation commands` | — | `ipc`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: ipcMain + store/service stub: fakeIpc :: deep-equal |

### `tests/content-generation-batch-service.test.js`

- 测试声明数：**11**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 112 | `continues a real persisted pending batch when article lookup requires the task client id` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createContentGenerationBatchService :: equal |
| 157 | `marks a real batch failed when article lookup fails before task claim` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createContentGenerationBatchService :: equal |
| 196 | `reads batch-generation materials through a logical client id` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createContentGenerationBatchService + 文件 fixture: writeFileSync :: deep-equal |
| 219 | `previews client by template tasks and excludes clients missing either source gate` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 228 | `returns an accepted running snapshot before a delayed run completes and rejects a second active run` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 250 | `revalidates sources, reads them at task start, saves generated provenance, and marks the task succeeded` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 264 | `treats only article-not-found reads as missing and never generates after a corrupt read` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 306 | `does not auto-run persisted work after service construction and requires confirmation for config changes` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 317 | `persists safe state events and exposes pause, resume, stop, retry, get, and list operations` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 340 | `returns one ordered runtime snapshot with the selected persisted batch` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 353 | `previews and confirms permanent cancellation of pending tasks` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/content-library-migration.test.js`

- 测试声明数：**9**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 83 | `dry-runs without creating or modifying any destination` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: contentLibraryRoot :: equal + deep-equal + truthiness |
| 104 | `reports non-empty targets, conflicts, missing sources, duplicate mappings, and unsafe paths` | — | `migration` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | 工作区 fixture: contentLibraryRoot :: equal + throws/rejects + truthiness |
| 136 | `requires an explicit execution confirmation` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: contentLibraryRoot :: equal + throws/rejects |
| 146 | `copies portable and local data, writes checksums and a completion marker, and keeps the source` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: contentLibraryRoot + store/service stub: createRuntimeConfigStore + 文件 fixture: readFileSync :: equal + deep-equal + truthiness |
| 190 | `is idempotent and recovers a partially copied migration without overwriting changes` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: contentLibraryRoot + 文件 fixture: readFileSync :: equal + throws/rejects + truthiness |
| 216 | `preserves the last valid manifest when Windows keeps the destination locked` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: contentLibraryRoot + 文件 fixture: readFileSync :: equal + throws/rejects |
| 240 | `rejects symlinked source entries and does not follow them` | — | `migration`、`security` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 261 | `supports the CLI dry-run and requires --execute for writes` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: contentLibraryRoot :: equal |
| 284 | `excludes the one-shot migration script from the desktop package` | — | `packaging`、`migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 文件 fixture: readFileSync :: match |

### `tests/content-submission-batch.test.js`

- 测试声明数：**12**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 45 | `previews generated and saved articles and only platforms declaring queue import` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | 临时目录: mkdtempSync :: equal + deep-equal |
| 56 | `creates an auditable batch idempotently and reports content conflicts` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal |
| 78 | `writes queued content under the injected portable input root` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: equal |
| 99 | `closes cancelled batches, removes their cancel plan, and reports repeat cancellation as idempotent` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + deep-equal |
| 131 | `previews a complete generated article as immediately queueable` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: equal + deep-equal |
| 148 | `lists batches by created time and stable id instead of filesystem order` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createSubmissionBatchStore + 文件 fixture: writeFileSync :: deep-equal |
| 160 | `reserves publication targets and writes v2 provenance into the queue sidecar` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal |
| 181 | `returns published and uncertain guards without hiding other targets` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal |
| 208 | `exposes a queued reservation without a queue file as a conflict` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal |
| 219 | `does not cancel a reservation after submission has started` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal |
| 235 | `keeps a staged media queue item cancellable without a remote publication id` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createSubmissionBatchStore + 文件 fixture: writeFileSync :: equal |
| 260 | `binds execution to the preview plan and does not reuse media item fingerprints` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal + throws/rejects |

### `tests/content-submission-export.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 16 | `exports only saved generated articles as idempotent queued Markdown with safe provenance` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | 临时目录: mkdtempSync + store/service stub: createSubmissionExportService + 文件 fixture: readFileSync :: equal + deep-equal + throws/rejects + match + truthiness |
| 34 | `uses the injected portable input root and accepts declared dynamic platforms` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + store/service stub: createSubmissionExportService :: equal |
| 55 | `reserves a declared publication target and records v2 sidecar identity` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + store/service stub: createSubmissionExportService + 文件 fixture: readFileSync :: equal |
| 74 | `uses a media resource as the publication target when one is supplied` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + store/service stub: createSubmissionExportService + 文件 fixture: readFileSync :: equal |
| 88 | `cancels an unsubmitted reservation when writing the queue pair fails` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createSubmissionExportService :: equal + throws/rejects |

### `tests/content-submission-ipc.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 3 | `requires confirmed true and never accepts renderer paths` | — | `renderer`、`ipc` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 10 | `exposes current-client submission batch history without renderer paths` | — | `renderer`、`ipc`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 24 | `forwards only the preview action plan token for batch cancellation` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 41 | `passes an optional media resource id but continues rejecting renderer paths` | — | `renderer`、`ipc`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: equal + deep-equal |
| 59 | `exposes reconciliation cleanup previews and keeps queue paths out of the renderer response` | — | `renderer`、`ipc`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 75 | `keeps residue cleanup counts and reason codes while stripping filesystem fields` | — | `ipc` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: deep-equal |

### `tests/content-workbench-regression.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `exposes the content IPC API to the React renderer` | — | `renderer`、`ipc` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcRenderer :: equal |
| 26 | `keeps the AI content workspace reachable from navigation` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 38 | `keeps existing renderer IPC errors readable after structured responses` | — | `renderer`、`ipc` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 44 | `defines the three content workbench tabs and shared refresh boundary` | — | `renderer`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 52 | `exposes the collection API and multi-research generation contract` | — | `renderer` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 76 | `exposes the Task 1 batch preview and prepared-start renderer API` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcRenderer :: match |
| 86 | `keeps batch selection and answer expansion as independent controls` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 98 | `keeps Task 10 single and batch generation workflows on renderer APIs` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: equal + match |

### `tests/content-workspace.test.js`

- 测试声明数：**7**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 12 | `generates the content directories under a temporary root` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 27 | `accepts arbitrary and Chinese client directory names` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 40 | `rejects empty client names` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 51 | `rejects absolute and directory traversal client names` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 65 | `rejects Windows-illegal characters and NUL characters` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 86 | `rejects names ending in spaces or periods` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 96 | `rejects Windows reserved device names regardless of case or extension` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/desktop-ipc-response.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `wraps successful data` | — | `ipc` | IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 11 | `wraps errors without stack traces` | — | `ipc` | IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 15 | `wraps async handlers` | — | `ipc` | IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: deep-equal |
| 22 | `wraps async handler failures` | — | `ipc` | 内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 29 | `preserves stable error codes` | — | `ipc` | IPC 契约、DTO 过滤与主进程边界保持稳定 | — |

### `tests/desktop-packaging.test.js`

- 测试声明数：**32**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 274 | `keeps legacy research, article, migration, submission, and media surfaces in the package boundary` | — | `packaging`、`migration`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | — |
| 290 | `declares new content runtime files and renderer build as alpha package requirements` | — | `renderer`、`packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 313 | `declares the isolated packaged DOCX verifier and Mammoth license` | — | `packaging` | 文档文本提取与空/损坏输入错误语义保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 322 | `declares the bundled Playwright runtime and isolated verifier` | — | `packaging` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 339 | `excludes every private content and application configuration boundary` | — | `packaging`、`security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 366 | `does not package the one-shot content library migration tool` | — | `packaging`、`migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 371 | `rejects new private content and AI provider state in an app directory` | — | `packaging` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: truthiness |
| 411 | `documents the new workspace boundaries and generation operations without workspace AI assignments` | — | `packaging`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>文档文本提取与空/损坏输入错误语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 427 | `does not create runtime or business services before workspace bootstrap is ready` | — | `packaging`、`store` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 447 | `keeps every non-ready bootstrap state free of runtime and business initialization` | — | `packaging` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 459 | `fails closed when workspace bootstrap throws and activate does not create a window` | — | `packaging`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 472 | `fails closed when runtime initialization throws` | — | `packaging` | 内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspacePath :: equal |
| 485 | `initializes ready runtime after bootstrap and injects protected runtime dependencies` | — | `packaging`、`security` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspacePath :: equal + match |
| 493 | `wraps shell.openPath failures with a stable safe error` | — | `packaging` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 500 | `disposes the current runtime once before relaunch and tolerates relaunch without runtime` | — | `packaging` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspacePath :: equal + match |
| 511 | `exposes only the workspace bootstrap API and forwards token-only confirmations` | — | `packaging`、`security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 547 | `does not retain a default Documents or cwd workspace fallback` | — | `packaging`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>文档文本提取与空/损坏输入错误语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 554 | `loads the React build from the packaged app files` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 561 | `ships the read-only builtin content template resources` | — | `packaging`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>资源 DTO、分页与外部数据归一化保持稳定 | — |
| 574 | `configures a writable runtime workspace before IPC registration` | — | `packaging`、`ipc`、`store` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot :: truthiness |
| 581 | `excludes private runtime data from alpha package config` | — | `packaging`、`store` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致<br>配置持久化、默认值与环境来源保持明确 | — |
| 589 | `declares every Doubao workspace boundary without excluding runtime code` | — | `packaging`、`security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 613 | `rejects private data in app-owned paths` | — | `packaging` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal + match |
| 647 | `ignores private-looking files inside packaged node_modules dependencies` | — | `packaging` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: match |
| 669 | `packages scripts/config.js because runtime modules require it` | — | `packaging`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 682 | `keeps the publication ledger migration as an operator-only script` | — | `packaging`、`migration`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 688 | `initializes runtime environment before loading config-dependent services` | — | `packaging`、`store` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致<br>配置持久化、默认值与环境来源保持明确 | — |
| 701 | `checks the Doubao service source assembly contract` | — | `packaging` | 平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 709 | `waits for Doubao disposal before quitting and does not re-enter the quit guard` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 738 | `continues runtime disposal and quits when either unsubscribe throws` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 754 | `prevents concurrent before-quit events until the shared disposal completes` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 778 | `exposes Doubao commands and a removable queue-state listener` | — | `packaging`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/desktop-task-service.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `passes complete storage paths to desktop workers and keeps worker config portable` | — | `store` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>配置持久化、默认值与环境来源保持明确 | store/service stub: fakeFork :: equal + deep-equal |
| 48 | `derives worker directories from explicit environment paths` | — | `domain` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 74 | `closes every platform session with the resolved bundled Node and CLI` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 临时目录: mkdtempSync + store/service stub: fakeFork + 文件 fixture: writeFileSync :: equal + deep-equal + match |
| 120 | `snapshots the Hepan interval once when a platform batch starts` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: fakeFork :: equal |
| 157 | `returns a distinct progress watchdog error instead of a fixed batch timeout` | — | `store` | IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: createDesktopTaskService :: equal |
| 174 | `keeps a safe run snapshot available while the renderer is absent` | — | `renderer` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + store/service stub: fakeFork :: equal |

### `tests/desktop-workbench-flow.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `loads the React production renderer from the packaged dist entry` | — | `renderer`、`packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 21 | `keeps media, platform, order, and content workbenches on the React app surface` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 34 | `keeps platform batch selection until explicit confirmation` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |

### `tests/device-identity-store.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `keeps one random installation identity across service launches` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + store/service stub: createDeviceIdentityStore + 文件 fixture: readFileSync :: equal |
| 20 | `fails closed when the identity file is malformed` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + store/service stub: createDeviceIdentityStore + 文件 fixture: writeFileSync :: throws/rejects |

### `tests/docx-text-extractor.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 12 | `extracts real Chinese and English paragraphs and derives an article` | — | `domain` | 文档文本提取与空/损坏输入错误语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 26 | `maps an empty DOCX to a stable error` | — | `domain` | 文档文本提取与空/损坏输入错误语义保持稳定 | — |
| 32 | `maps a damaged ZIP and invalid input without exposing the parser exception` | — | `domain` | 安全边界与敏感信息不泄露<br>文档文本提取与空/损坏输入错误语义保持稳定 | — |

### `tests/doubao-browser-adapter.test.js`

- 测试声明数：**28**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 107 | `exposes the visible mode, rejects hidden mode, and does not claim background support` | — | `domain` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: fakeRuntime :: equal + throws/rejects |
| 121 | `derives generating only from a visible stop control and scopes references to each message` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 182 | `extracts references from an associated panel beside the message row only` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 212 | `inspects only data-message-id nodes and exposes scoped diagnostic fields` | — | `domain` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: fakeRuntime :: match |
| 233 | `normalizes the current raw snapshot and waits for three stable answers` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 266 | `does not reuse a previous assistant answer before a new repeated-question message appears` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 314 | `uses the dedicated doubao session and returns a scoped complete answer` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: fakeRuntime :: equal + deep-equal + truthiness |
| 338 | `detects when the current Doubao page requires login` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: fakeRuntime :: equal |
| 347 | `checks login state without opening a visible page` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: fakeRuntime :: equal |
| 358 | `serializes concurrent session startup across login APIs` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 385 | `invalidates an in-flight opening when close races with a new open` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 416 | `reuses a ready session for collection and reopens after close` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: fakeRuntime :: equal |
| 433 | `does not reopen a visible page when passive inspection reports a closed session` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 457 | `throws the second session-not-open inspection failure without looping` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 477 | `checks the page after opening and does not send a question when login is required` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: deep-equal + throws/rejects |
| 494 | `detects login wording even when the page exposes an input` | — | `domain` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: fakeRuntime :: equal |
| 504 | `returns an explicit login marker from the inspect-page script` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 511 | `uses the remaining absolute deadline for every evaluate and sleep` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: makeTemporaryDirectory :: deep-equal + throws/rejects |
| 539 | `caps an oversized collection timeout at 120 seconds for the runtime` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | store/service stub: fakeRuntime :: truthiness |
| 556 | `bounds a diagnostic screenshot independently and still writes its summary` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime + 文件 fixture: readFileSync :: equal + throws/rejects + match |
| 574 | `times out after 120 seconds when an answer never becomes complete` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: throws/rejects + truthiness |
| 590 | `does not accept an answer that cannot be scoped to the requested question` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: throws/rejects |
| 605 | `stops on a challenge page and captures a diagnostic` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: equal + throws/rejects |
| 617 | `passes the explicit default profileId to the Playwright session` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 632 | `uses an injected profile directory when creating the Doubao session` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 647 | `stops on a page error and does not send a question` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: equal + throws/rejects |
| 662 | `keeps at most 20 diagnostic file groups` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: equal + throws/rejects |
| 679 | `JSON-encodes a question in the send action script` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: equal + truthiness |

### `tests/doubao-collection-ipc.test.js`

- 测试声明数：**12**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 57 | `registers the complete public channel surface` | — | `ipc` | 平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: deep-equal |
| 62 | `routes batch preview and prepared start through validated public inputs` | — | `ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: deep-equal |
| 76 | `wraps service results and does not expose error internals` | — | `ipc` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers + store/service stub: fakeService :: equal + match |
| 95 | `routes public single collection through the queue and returns the current research record` | — | `ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createDoubaoCollectionDesktopService :: equal + deep-equal |
| 130 | `closes the collection session after single, completed batch, and failed batch runs` | — | `ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createDoubaoCollectionDesktopService :: equal |
| 167 | `runs retryFailed through the session lifecycle and closes after it finishes` | — | `ipc` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createDoubaoCollectionDesktopService :: deep-equal |
| 194 | `keeps the browser open while paused with pending tasks and does not close login sessions` | — | `ipc` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createDoubaoCollectionDesktopService :: equal |
| 227 | `copies only a safe code and message when queued single collection fails` | — | `ipc`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createDoubaoCollectionDesktopService :: throws/rejects |
| 254 | `returns a stable collection failure for empty or malformed queue state without reading research` | — | `ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createDoubaoCollectionDesktopService :: equal + throws/rejects |
| 282 | `redacts nested queue errors without removing state or answer/reference content` | — | `ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: handlers + store/service stub: fakeService :: equal + deep-equal + match |
| 334 | `rejects unsafe ids, paths, renderer scripts and profile paths at the boundary` | — | `renderer`、`ipc`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | IPC stub: handlers :: equal + match |
| 351 | `rejects batches larger than 500 tasks and batch task fields outside the API` | — | `ipc`、`store` | 平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal + match |

### `tests/doubao-collection-queue.test.js`

- 测试声明数：**13**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 18 | `runs tasks serially with a 15-30 second interval` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 40 | `rejects batches over 500 tasks and rejects a second active queue` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 68 | `starts a fresh run after a completed run` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 89 | `rejects a new run while paused or stopping` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 128 | `emits the running lifecycle for a single task` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 143 | `pauses on login and resumes the waiting task after login` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 166 | `pauses after the current task ends and resumes remaining tasks` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 196 | `completes after the final task even when paused during that task` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 222 | `freezes the remaining inter-task wait while paused and resumes it before the next task` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 267 | `stops without starting queued tasks and marks them cancelled` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 292 | `retryFailed only appends failed tasks and preserves terminal states` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 319 | `emits countdown state events and stops notifying an unsubscribed listener` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 357 | `stores only a safe code and message for collection errors` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/doubao-collection-service.test.js`

- 测试声明数：**17**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 142 | `builds missing-only and force-enabled batches from selected clients` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 188 | `rejects empty, duplicate, oversized, unknown-mode, and disabled-only batch input` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 205 | `revalidates prepared tasks against the current question and research state` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 212 | `collects an existing question and saves normalized research` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 223 | `does not replace a successful record when recollection fails` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 234 | `saves manual input through the same research store` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 248 | `delegates login and close operations to the browser adapter` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 256 | `rejects disabled questions before opening the browser` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 265 | `rejects an existing result unless force is true` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 275 | `overwrites an existing result only after a forced collection succeeds` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 284 | `rejects an invalid client/question pairing before collection` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 293 | `rejects unsafe identifiers before reading a question` | — | `domain` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 302 | `does not save invalid references or short answers` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 319 | `deletes research before the question and returns deletion snapshots` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 331 | `restores research and rethrows the original question deletion error` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 345 | `reports compensation failure instead of silently succeeding` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 360 | `does not delete the question when research deletion fails` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |

### `tests/doubao-content-workbench.test.js`

- 测试声明数：**22**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `declares collection types and research provenance fields` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 27 | `keeps privileged and browser-only implementation out of React files` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcRenderer :: match |
| 39 | `renders collection controls, explicit recollection confirmation, and task icons` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 51 | `keeps one current-client selector and exposes independent batch commands` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 63 | `uses pure batch-selection helpers and keeps current-client changes isolated` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 72 | `renders collected answers through the shared collapsed source item` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 82 | `uses selected research ids in generation and delegates history selection` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 93 | `initializes the queue snapshot before subscribing and cleans up` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 105 | `separates question research loading from login checking and preserves session errors` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 116 | `does not refresh login when passive view data changes` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 124 | `restores the last stable login state when a passive session is unavailable` | — | `renderer`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 134 | `refreshes once after collection completion and prevents duplicate submissions` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 145 | `uses current client refs and request cancellation guards for queue refreshes` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 157 | `uses a synchronous collection lock and clears it on every exit` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 166 | `routes retry through the shared collection lock and surfaces rejected commands` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 176 | `deduplicates collection refreshes by run token and refreshes empty/external completions` | — | `renderer`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 185 | `shows queue status, current question, wait seconds, and the latest safe failure` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 192 | `makes the task bar information area shrink and truncate long text` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 199 | `clears article and research selection when the customer changes` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 206 | `resets platform templates and ignores stale template requests` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 218 | `preserves a history article template when template loading completes` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 226 | `maps legacy history templates by platform and scenario without replacing snapshots` | — | `renderer`、`migration` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/doubao-page-parser.test.js`

- 测试声明数：**11**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 19 | `normalizes current message candidates by id, role, class ancestry, and text` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 51 | `selects an answer from a current DOM snapshot with associated panel references` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 65 | `does not block a complete answer when its associated panel has no references` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 75 | `selects only the assistant answer following the requested question` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 85 | `does not cross a later user turn while selecting an answer` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 94 | `selects the newest answer for a repeated question` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 107 | `distinguishes login, challenge, streaming, and complete states` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 114 | `prefers an explicit login marker when the page still exposes an input` | — | `domain` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 118 | `reports page errors before answer selection` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 122 | `throws stable errors when the question or answer is absent` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 132 | `normalizes references by keeping unique HTTP(S) URLs and filling missing titles` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/electron-security.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `permits navigation only to the exact packaged renderer entry` | — | `renderer`、`packaging`、`security` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 16 | `uses a sandboxed, isolated renderer and prevents renderer-created windows` | — | `renderer`、`packaging`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 25 | `keeps authentication in the main process and gates the business tree` | — | `renderer`、`packaging`、`security` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 39 | `ships a restrictive CSP for the file-rendered React bundle` | — | `packaging`、`security` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |

### `tests/generation-batch-runner.test.js`

- 测试声明数：**14**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 98 | `passes the complete task to article lookup before generating a pending task` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: fakeStore :: equal + deep-equal |
| 125 | `does not leave a task pending when article lookup fails before claim` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: fakeStore :: equal + deep-equal |
| 146 | `runs tasks serially, skips succeeded work, and completes the batch` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + deep-equal + truthiness |
| 174 | `validates the reserved concurrency range` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: throws/rejects |
| 186 | `aborts the active task and leaves later tasks pending when stopped` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal |
| 216 | `retries rate limits, network failures, timeouts, and server failures with injected waits` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + deep-equal |
| 236 | `pauses the batch for configuration errors and continues after non-retryable task errors` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | store/service stub: fakeStore :: equal + deep-equal |
| 269 | `pauses the whole batch for missing configuration and invalid models` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | store/service stub: fakeStore :: equal + deep-equal |
| 294 | `repairs a saved article without another AI call and retries failed tasks only` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: fakeStore :: equal + deep-equal |
| 324 | `runs each task once with a validated future concurrency greater than one` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + deep-equal |
| 350 | `keeps one active run per runner and disposes the active request` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + throws/rejects |
| 379 | `keeps the running task alive while cancelling later pending tasks` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + deep-equal |
| 407 | `publishes live status separately from persisted batch status in every snapshot` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + truthiness |
| 427 | `handles a controllable fifty-task run without duplicate execution after stop and continue` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal |

### `tests/generation-batch-store.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 36 | `builds one stable task per client and template and preserves source ids` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createGenerationBatchStore + 文件 fixture: readFileSync :: equal + deep-equal |
| 64 | `enforces both task inputs, unique ids, valid ids, and the task limit` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createGenerationBatchStore + 文件 fixture: readFileSync :: equal + throws/rejects |
| 94 | `persists state transitions atomically and recovers running work as interrupted` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createGenerationBatchStore :: equal + deep-equal + throws/rejects |
| 118 | `only returns resumable tasks and reports corrupt batches without hiding valid batches` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createGenerationBatchStore + 文件 fixture: writeFileSync :: deep-equal + throws/rejects |
| 133 | `reads old batches without a cancelled count as zero and permanently cancels only pending tasks` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createGenerationBatchStore + 文件 fixture: readFileSync :: equal + deep-equal |

### `tests/generation-snapshot-event.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 84 | `records one current renderer follow-up IPC and batch read for every state event` | — | `renderer`、`ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: createEventFixture :: equal + truthiness |
| 119 | `consumes complete snapshot events without renderer follow-up IPC or batch reads` | — | `renderer`、`ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: createEventFixture :: equal + truthiness |

### `tests/generation-snapshot-order.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `accepts only newer events from the bootstrapped runtime` | — | `renderer` | 内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 22 | `switches runtime only through a newer bootstrap snapshot` | — | `renderer` | 内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |

### `tests/generation-submission-handoff-ipc.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `rejects renderer paths and unknown fields before invoking the service` | — | `renderer`、`ipc` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: ipcMain + store/service stub: fakeIpc :: equal + deep-equal |
| 22 | `returns only the allowlisted safe error for a stale preview` | — | `ipc` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: ipcMain + store/service stub: fakeIpc :: equal + deep-equal |

### `tests/generation-submission-handoff.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 16 | `previews and commits 50 successful articles across two clients with one confirmation` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createGenerationSubmissionHandoffService :: equal + deep-equal |
| 53 | `rejects a commit after the batch revision changes` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createGenerationSubmissionHandoffService :: throws/rejects |
| 66 | `blocks duplicate article identities before delegating to the submission service` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createGenerationSubmissionHandoffService :: equal + deep-equal |
| 84 | `does not expose article content or queue paths in the handoff preview` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | store/service stub: createGenerationSubmissionHandoffService :: equal |
| 98 | `rejects a target that is not available for queue import` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createGenerationSubmissionHandoffService :: throws/rejects |

### `tests/hepan-article-source.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 18 | `parses BOM/CRLF Markdown into safe HTML and rejects raw HTML and dangerous URLs` | — | `domain` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal + match |
| 38 | `uses the first non-empty TXT line as title and preserves safe paragraphs` | — | `domain` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal |
| 55 | `scans supported ordinary files while excluding sidecars, temporary files, and symlinks` | — | `security` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal |
| 68 | `returns stable article errors for invalid extension, empty values, invalid UTF-8, and oversized input` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |

### `tests/hepan-login-check.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `extracts the account from the current yonghuming theme container` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 41 | `accepts an authenticated publish page with generic login words and no upload token` | — | `security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 76 | `rejects a real login form and explicit login route` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 101 | `reports authentication independently of a missing publish form` | — | `security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 126 | `ignores avatar and navigation space links without a trusted account container` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 145 | `rejects invalid trusted account candidates and ordinary space links` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 174 | `keeps a successful capability check when account identity is unavailable` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 202 | `keeps category denial and changed publish forms distinct from cookie rejection` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/hepan-provider-settings.test.js`

- 测试声明数：**10**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 17 | `accepts only a real Python file, keeps the site fixed and defaults category 121` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + deep-equal + throws/rejects |
| 33 | `validates the publish interval and exposes the safe default` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 48 | `reads a valid interval from the environment without exposing secrets` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 63 | `uses bundled vendor dependencies when no custom vendor directory is configured` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal |
| 88 | `checks Python, imports, and login through a temporary cookie file that is always removed` | — | `store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + deep-equal |
| 116 | `maps a failed login to a stable error without leaking cookie or temp path` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 136 | `preserves safe warnings and account identity without carrying an error code on success` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + deep-equal |
| 167 | `uses a safe Python error code when the login command exits non-zero` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 189 | `fails the payload self-test before dependency or login checks` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 212 | `renders configured paths as safe status and submits only changed setting fields` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 文件 fixture: readFileSync :: match |

### `tests/hepan-publish-contract.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 20 | `passes Markdown/TXT through a random temporary JSON payload and always removes it` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 60 | `keeps DOCX on the --article path and does not create a JSON payload` | — | `security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: writeFileSync :: equal |
| 93 | `maps payload validation failures to stable safe outcomes and cleans after runner errors` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 117 | `keeps local payload runtime, remote rejection, and uncertain outcomes distinct` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: deep-equal |

### `tests/hepan-publish-interval.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 51 | `waits from remote completion, emits waiting state, and counts failed remote calls` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 75 | `only throttles consecutive work for the same target and uses elapsed time` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 93 | `does not start the next remote call when stopped during an interval` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/hepan-python-payload-runtime.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 68 | `runs the payload validator on the supported Python 3.10-3.13 runtime` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 75 | `validates the real Node-generated Markdown and TXT payloads without cookie, image, or network access` | — | `domain` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 文件 fixture: writeFileSync :: equal |
| 114 | `rejects a directory, symlink, missing file, and invalid JSON with safe payload codes` | — | `security` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createSymlinkFixture + 文件 fixture: writeFileSync :: equal + deep-equal + match |

### `tests/hepan-settings-patch-contract.test.js`

- 测试声明数：**10**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 108 | `preserves stored Python, Cookie, and vendor when only categoryId is saved` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 124 | `preserves an old configuration without an interval and defaults it on patch` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 137 | `allows changing only the interval, including zero, without replacing secrets` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 151 | `allows replacing only Python while retaining Cookie, categoryId, and vendor` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 166 | `allows replacing only Cookie while retaining Python, categoryId, and vendor` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 181 | `does not treat an empty vendor field as an implicit clear` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 192 | `clears vendor only through the explicit clearVendorDir patch` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 209 | `uses the same patch merge for save and test without persisting a test patch` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 230 | `applies explicit vendor clearing to test patches without writing it` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 247 | `keeps environment configuration read-only and exposes only safe status` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |

### `tests/ipc-submission-boundary.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 25 | `resolves media submissions only from real supported files in its input directory` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createMediaWorkbenchService :: equal + throws/rejects |
| 33 | `resolves platform submissions only from the declared source platform directory` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: createPlatformWorkbenchService :: equal + throws/rejects |
| 50 | `accepts media submissions containing only filename, resource IDs, and a draft revision` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 62 | `accepts platform submissions containing only source platform, filename, and targets` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 71 | `rejects malformed draft payloads without leaking arbitrary fields into the store` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 81 | `rejects renderer article objects and invalid drafts with stable safe errors` | — | `renderer`、`ipc`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | 临时目录: mkdtempSync + IPC stub: registerMediaIpc + 文件 fixture: writeFileSync :: deep-equal |

### `tests/j4125-auth-contract.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `contains an isolated HTTPS auth service contract without business data` | — | `security` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: match |

### `tests/legacy-migration.test.js`

- 测试声明数：**16**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 51 | `dry-runs against a temporary legacy database without writing output` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot :: equal + deep-equal |
| 59 | `copies allowed client knowledge and imports matching research and articles` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createResearchStore :: equal + deep-equal |
| 84 | `matches only the exact search query after removing a UTF-8 BOM` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 93 | `skips unmatched customers and empty answers while preserving existing knowledge` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定 | 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: equal |
| 111 | `is idempotent and does not overwrite non-legacy outputs` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createResearchStore :: equal + deep-equal |
| 123 | `reports stable warnings for unavailable or invalid legacy databases` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: deep-equal + throws/rejects |
| 131 | `loads without node:sqlite and reports a stable unsupported error only when migration reads a database` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定 | 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: equal |
| 151 | `rejects a linked workspace client target before copying legacy files` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + throws/rejects |
| 175 | `rejects a linked workspace clients root before copying legacy files` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + throws/rejects |
| 198 | `rejects schemas that omit required columns without exposing SQLite details` | — | `migration` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 210 | `skips malformed citation URLs instead of failing the matching research import` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createResearchStore :: equal + deep-equal |
| 224 | `reports existing legacy records as skipped during dry-run` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定 | — |
| 238 | `ignores the in-memory legacy researchQueryIds compatibility field when comparing articles` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createArticleStore :: equal + deep-equal |
| 245 | `uses the preserved research references when an existing legacy query is skipped` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createResearchStore :: equal |
| 259 | `validates command parameters and emits JSON statistics` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定 | 工作区 fixture: workspaceRoot :: equal + match |
| 270 | `exits nonzero from the command when the schema is invalid` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定 | 工作区 fixture: workspaceRoot :: equal |

### `tests/legacy-platform-settings-migration.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 54 | `reports only safe availability metadata and requires explicit confirmation` | — | `migration`、`store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 70 | `imports legacy values into encrypted provider stores, removes old runtime secrets, and is idempotent` | — | `migration`、`store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: readFileSync :: equal + deep-equal |
| 93 | `does not persist an environment override during explicit legacy import` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |

### `tests/media-article-converter.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 20 | `converts markdown articles to html` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + match |

### `tests/media-article-drawer-boundary.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `keeps preview, editing, and selected media removal inside the React editor` | — | `renderer`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/media-client.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 31 | `sends page and pageSize in mediaList requests` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |

### `tests/media-draft-store.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 22 | `stores multiple selected resources for one article` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 38 | `migrates old single resource drafts` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal |
| 53 | `sets one resource on many files without deleting other draft fields` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/media-order-service.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 18 | `returns renderer-ready order view DTOs from raw submission history` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定 | 临时目录: mkdtempSync + store/service stub: createMediaOrderService + 文件 fixture: writeFileSync :: equal |
| 115 | `lets the React orders view consume order view DTOs directly` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定 | — |
| 136 | `syncs an accepted order to published through its publicationId` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createMediaOrderService :: equal |
| 174 | `automatically reconciles an uncertain order when a later sync proves publication` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createMediaOrderService :: equal |

### `tests/media-preflight.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `accepts selectedResources and expands task count` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定 | — |
| 25 | `blocks articles with no selected resources` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 35 | `migrates old resourceId into selectedResources for validation` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定 | — |

### `tests/media-provider-settings.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 19 | `validates the approved default, timeout and transport status` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 28 | `saves without calling the network and tests balance without replacing the saved config` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createPlatformSettingsService :: equal + deep-equal |
| 44 | `keeps environment credentials read-only and gives clear a stable missing-config runtime error` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | store/service stub: createPlatformSettingsService :: equal + throws/rejects |
| 57 | `resolves a fresh client for each resource operation while one refresh uses one snapshot` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | store/service stub: createMediaResourceService :: equal |

### `tests/media-resource-service.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 29 | `normalizes api resource fields into the stable dto` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定 | — |
| 60 | `pages cached resources with metadata` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定 | store/service stub: createMediaResourceService :: equal |
| 86 | `searches cached resources by keyword and paginates the matches` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定 | store/service stub: createMediaResourceService :: equal |
| 110 | `refreshes all pages until the api returns a short page and writes the cache` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定 | store/service stub: createMediaResourceService :: equal + deep-equal |
| 147 | `adds a normalized resource to the pool and returns pool dto entries` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定 | store/service stub: createMediaResourceService :: deep-equal |
| 184 | `returns a normalized balance dto from the api client` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定 | store/service stub: createMediaResourceService :: deep-equal |

### `tests/media-resource-ux.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `keeps normalized balance and resource paging on the service boundary` | — | `renderer`、`security`、`store` | 安全边界与敏感信息不泄露<br>资源 DTO、分页与外部数据归一化保持稳定 | — |

### `tests/media-runtime-workspace.test.js`

- 测试声明数：**7**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 17 | `writes media state exclusively to an explicit workspace paths data directory` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync :: truthiness |
| 36 | `creates draft state beneath deps.paths.data` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + IPC stub: handlers + 文件 fixture: writeFileSync :: equal + truthiness |
| 55 | `scans the historical app media input when no runtime paths are injected` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + IPC stub: handlers + 文件 fixture: writeFileSync :: equal + truthiness |
| 85 | `writes submitted orders to injected workspace paths even when environment points elsewhere` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + store/service stub: createMediaWorkbenchService + 文件 fixture: writeFileSync :: equal |
| 113 | `reads orders from the same workspace data directory used by the order store` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + store/service stub: createMediaOrderService :: equal |
| 126 | `keeps media publication records in the same injected workspace` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createMediaWorkbenchService + 文件 fixture: writeFileSync :: equal + truthiness |
| 157 | `uses the historical app data directory when no workspace path or environment is supplied` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + store/service stub: createMediaOrderService :: equal |

### `tests/media-workbench-flow.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `keeps article editing and the shared media pool in the React app` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/media-workbench-service.test.js`

- 测试声明数：**10**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 31 | `scans text articles and applies selected resources from drafts` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 47 | `previews text articles with draft resource fields merged` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 68 | `rejects unsafe preview filenames` | — | `domain` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 75 | `expands selected articles into serial submission tasks` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 94 | `builds confirmation totals` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 109 | `submits tasks serially and continues after one failure` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 139 | `stop request skips tasks after the current request` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 160 | `preflight blocks resources already reserved for the same article and excludes them from price` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createMediaWorkbenchService + 文件 fixture: writeFileSync :: equal + deep-equal |
| 189 | `creates one publication per resource, records publicationId in the order, and uses publication attempt identity as thirdId` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createMediaWorkbenchService + 文件 fixture: writeFileSync :: equal + truthiness |
| 224 | `marks explicit rejection failed and unknown timeout uncertain without treating either as success` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createMediaWorkbenchService + 文件 fixture: writeFileSync :: equal + deep-equal |

### `tests/packaged-docx-runtime.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 6 | `parses and caches a real DOCX through the packaged client material store` | — | `packaging`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>文档文本提取与空/损坏输入错误语义保持稳定 | — |
| 13 | `fails safely when the packaged DOCX is damaged` | — | `packaging` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>文档文本提取与空/损坏输入错误语义保持稳定 | — |

### `tests/packaged-playwright-runtime.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 28 | `passes static packaged runtime verification with bundled Node, CLI, and licenses` | — | `packaging` | 打包边界、运行时依赖与应用身份保持一致 | — |
| 39 | `fails red when the bundled Node or CLI is removed` | — | `packaging` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 52 | `fails red on development-machine absolute references and private runtime data` | — | `packaging` | 内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |

### `tests/platform-browser-session-lifecycle.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `loads, starts, saves, and closes a platform session through one seam` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/platform-ipc-boundary.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `submits multiple source articles through one serialized desktop job` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + IPC stub: handlers + 文件 fixture: writeFileSync :: equal + deep-equal |
| 39 | `runs confirmed automatic local trash through the main article removal interface` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + IPC stub: handlers + 文件 fixture: writeFileSync :: equal + deep-equal |
| 82 | `keeps a multi-target article when one target is uncertain or archive-failed` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: mkdtempSync + IPC stub: handlers + 文件 fixture: writeFileSync :: equal + deep-equal |
| 118 | `returns a safe repair reason when local recovery throws without changing publish success` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | 临时目录: mkdtempSync + IPC stub: handlers + 文件 fixture: writeFileSync :: equal + deep-equal + match |

### `tests/platform-provider-config-store.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 30 | `encrypts secret fields and reads a versioned provider file` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createPlatformProviderConfigStore + 文件 fixture: readFileSync :: equal + deep-equal |
| 43 | `validates schema before encryption and rejects unknown or partial input` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createPlatformProviderConfigStore :: equal + throws/rejects |
| 56 | `fails closed for encryption, symlink and atomic-write failures` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createPlatformProviderConfigStore + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 78 | `keeps separate provider files independently readable` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createPlatformProviderConfigStore + 文件 fixture: writeFileSync :: equal + throws/rejects |

### `tests/platform-settings-service.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 34 | `exposes a small status interface without secrets and saves without testing` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createPlatformSettingsService :: equal + deep-equal |
| 45 | `gives environment overrides read-only priority and exposes no override secret` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createPlatformSettingsService :: equal + throws/rejects |
| 57 | `records safe test results and preserves the saved configuration on failure` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createPlatformSettingsService :: deep-equal + throws/rejects |
| 68 | `blocks mutations while platform tasks are running but keeps status readable` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createPlatformSettingsService :: equal + throws/rejects |
| 77 | `returns a runtime snapshot only through the main-process interface` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | store/service stub: createPlatformSettingsService :: deep-equal |

### `tests/platform-submission-invocation-count.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 191 | `records the current N-preparation-plus-one-submission flow without remote adapters` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 212 | `records one main-owned submission IPC and one batch plan build` | — | `ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/platform-task-progress.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `restores 7 of 20 processed tasks without exposing paths` | — | `store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: createPlatformTaskStateStore :: equal |
| 36 | `does not double count duplicate heartbeats or old runs` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: createPlatformTaskStateStore :: equal |
| 48 | `restores an interrupted marker without pretending the worker is running` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + store/service stub: createPlatformTaskStateStore :: equal |

### `tests/platform-workbench-service.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 35 | `scans non-media platform queues` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 41 | `scans and resolves platform queues from the injected content input path` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | store/service stub: createPlatformWorkbenchService + 文件 fixture: writeFileSync :: equal + deep-equal |
| 61 | `builds selected article target plan` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 71 | `submits selected platform tasks serially and continues after failure` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createPlatformWorkbenchService :: equal + deep-equal |

### `tests/production-packaging.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `inherits alpha boundaries while requiring signed ASAR production artifacts` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 文件 fixture: readFileSync :: match |

### `tests/prompt-builder.test.js`

- 测试声明数：**11**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 31 | `builds system and user prompts with four separated Chinese sections` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 44 | `states factual boundaries and does not turn references into official endorsement` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 52 | `requires a publish-ready response without template scaffolding` | — | `packaging` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 59 | `rejects construction when the Doubao answer is missing or empty` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 67 | `requires a non-empty string template body` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 75 | `keeps platform and scenario data-driven instead of using an industry taxonomy` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 86 | `accepts a v2 body-only template and derives no required scenario metadata` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 93 | `keeps multiple research question, answer, and reference groups in stable order` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 111 | `rejects an empty or duplicated research id list` | — | `packaging` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 119 | `formats only explicitly selected client materials` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 135 | `enforces both material and research source gates` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |

### `tests/publication-article-identity.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `prefers the generated article identity over editable content` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 17 | `hashes normalized manual title and content` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 25 | `rejects empty or path-like identity parts` | — | `security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/publication-duplicate-guard.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 20 | `blocks the same article and platform while allowing another platform` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 32 | `treats each media resource as an independent target` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>资源 DTO、分页与外部数据归一化保持稳定 | — |
| 42 | `blocks submitted and uncertain, but allows failed retry with a new attempt` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 60 | `uses one exclusive publication record for concurrent reservations` | — | `domain` | 发布状态、重复保护与尝试历史保持一致 | — |

### `tests/publication-ipc.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 5 | `lists publication history for many articles in one ledger query and strips sensitive aggregate fields` | — | `ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal + deep-equal |
| 45 | `rejects renderer path-like publication history input` | — | `renderer`、`ipc`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 55 | `requires a second-confirmation marker and exposes only safe reconciliation fields` | — | `ipc` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: equal + deep-equal |

### `tests/publication-ledger-index.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 15 | `does not rescan the publication directory for repeated id lookups` | — | `store` | 发布状态、重复保护与尝试历史保持一致 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + deep-equal |

### `tests/publication-ledger-migration.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 100 | `defaults to a write-free dry-run and classifies queue, order, and orphan archive safely` | — | `migration`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | 文件 fixture: readFileSync :: equal + truthiness |
| 118 | `requires the exact execution token and preserves legacy files` | — | `migration`、`security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | — |
| 130 | `uses the existing ledger API, writes a redacted manifest, and is idempotent` | — | `migration`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + truthiness |
| 165 | `does not create or replace a newer publication and fails closed on invalid sidecars` | — | `migration`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot :: equal + truthiness |
| 191 | `keeps the CLI dry by default and gates writes behind the token` | — | `migration`、`security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | — |

### `tests/publication-ledger-store.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 12 | `uses the portable publication directory and versioned JSON records` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal |
| 28 | `accepts an injected submission-records path only inside the workspace` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + throws/rejects |
| 42 | `captures a bounded immutable title snapshot on first reservation and preserves it across retries` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + deep-equal |

### `tests/publication-ledger.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 21 | `persists a per-target aggregate and keeps failed retry history` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 42 | `requires reconciliation for uncertain outcomes` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: equal + throws/rejects |
| 58 | `lists only requested generated articles for a client` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/publication-targets.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `resolves ordinary platforms at platform granularity` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 17 | `resolves each paid media resource as an independent target` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>资源 DTO、分页与外部数据归一化保持稳定 | — |
| 25 | `rejects undeclared platforms and unsafe identifiers` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/published-archive.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 52 | `rejects a published archive collision without deleting either existing pair` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: equal + throws/rejects |
| 69 | `rolls the complete source pair back when the sidecar archive step fails` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: equal + throws/rejects |
| 98 | `keeps a remote success distinct from an archive failure so it is not retryable as publish failure` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |

### `tests/published-article-trash.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 57 | `moves four published articles and ten terminal targets without queue conflict` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 81 | `keeps active and uncertain targets blocked` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 98 | `cleans a cancelled local pair without changing the cancelled ledger history` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |

### `tests/question-store.test.js`

- 测试声明数：**12**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 40 | `creates, updates, lists, toggles, and deletes a stable question` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: equal + deep-equal |
| 63 | `imports search_query.txt once and rejects normalized duplicates` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 文件 fixture: writeFileSync :: equal + throws/rejects |
| 72 | `does not create a missing client directory` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 80 | `keeps the old questions file readable when the atomic rename fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 113 | `preserves the atomic operation error when temporary cleanup fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 151 | `throws a temporary cleanup error when the atomic operation succeeds` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 181 | `returns stable errors for invalid paths and question data` | — | `store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createQuestionStore :: throws/rejects |
| 236 | `rejects malformed questions.json with a stable error` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 257 | `rejects a questions.json file symlink escaping workspace` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |
| 290 | `rejects a search_query.txt file symlink escaping workspace` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |
| 317 | `rejects a customer directory symlink escaping workspace.clients` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: throws/rejects |
| 342 | `rejects a clients root symlink escaping workspace` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: throws/rejects |

### `tests/react-workbench-regression.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `gates renderer localStorage fixtures behind an explicit development flag` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 17 | `keeps Settings limited to manual workflow features` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 23 | `keeps the platforms workbench reachable` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 29 | `keeps renderer APIs free of mock article persistence` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: mockData :: equal + truthiness |
| 43 | `exposes platform commands through preload` | — | `renderer`、`ipc` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: readFileSync :: truthiness |
| 48 | `shares the structured IPC response envelope` | — | `renderer`、`ipc` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 文件 fixture: readFileSync :: truthiness |
| 57 | `uses the complete main-process platform status shape` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: equal + match + truthiness |
| 69 | `type-checks before building the renderer` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 文件 fixture: readFileSync :: equal + truthiness |

### `tests/renderer-ai-provider-settings.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 20 | `exposes the Task 5 provider IPC through typed renderer helpers` | — | `renderer`、`ipc`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 33 | `keeps the provider UI on safe status fields and validates the URL locally` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 47 | `confirms only connection tests and clearing through the renderer host` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 61 | `refreshes safe status after a rejected connection test while retaining the UI error` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 70 | `guards generation state to the content channel` | — | `renderer`、`ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 83 | `keeps long provider URLs inside the settings layout` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 89 | `mounts provider settings as an independent Settings section` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 95 | `declares the optional content generation state channel` | — | `renderer`、`ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |

### `tests/renderer-article-attention-actions.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 30 | `article attention actions produce visible publication/detail results` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 浏览器/Renderer fixture: viteProcess :: deep-equal |

### `tests/renderer-article-history.test.js`

- 测试声明数：**9**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 36 | `groups by platform and template snapshot, sorting groups and articles by createdAt` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 49 | `uses the saved template snapshot after template deletion and keeps old articles visible` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 61 | `separates legacy articles by platform and template id when available` | — | `renderer`、`migration` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 71 | `keeps article opening separate from queue selection` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: match |
| 82 | `offers a current-client trash view with restore and confirmed permanent deletion` | — | `renderer`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 文件 fixture: readFileSync :: match |
| 95 | `keeps saved articles selectable for submission queueing` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: match |
| 111 | `selects a saved-only filtered result` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 119 | `keeps generated and saved articles in one mixed selection with indeterminate state` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 132 | `scopes selection state to the currently filtered result` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/renderer-article-management-filters.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `uses one five-stage navigation axis and one recycle-bin entry` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/renderer-article-management-flow.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `exposes visible stage tabs and a failure entry without replacing the existing editor flow` | — | `renderer` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |

### `tests/renderer-batch-generation.test.js`

- 测试声明数：**25**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 13 | `does not turn untouched selections into implicit full selections during async refresh` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 25 | `uses one custom-first visibility function for single and batch selectors` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 41 | `offers one-material retry in the batch source step and updates only that client material` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: match |
| 51 | `keeps the single article source gate and collapsed source contract` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 68 | `defaults async material and research selections without overwriting an explicit cancellation` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | — |
| 80 | `retries one material through the material store API` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 92 | `defines the four batch steps and Cartesian task count` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 98 | `does not report a batch source as executable when a selected material has failed` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 114 | `keeps invalid GEO answers unchecked and disabled at the source boundary` | — | `renderer`、`security`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 121 | `shows a visible cost warning while a batch is active or stopping` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 128 | `retains the cost warning for a stopped batch with unfinished tasks` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 133 | `discovers every returned template platform and counts all selected templates` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 142 | `labels builtin and custom templates with accurate source wording` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 152 | `renders the batch client, platform template, source and confirmation contracts` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 174 | `exposes renderer-only generation batch wrappers through preload` | — | `renderer`、`ipc`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: match |
| 193 | `provides a single and batch segmented control without losing the article editor` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 201 | `separates the new-batch wizard from persisted batch monitoring` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 211 | `rehydrates a persisted batch into monitoring and offers a new wizard entry for terminal batches` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 222 | `uses runtime state only when it belongs to the displayed batch` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 230 | `does not let initial idle hydration overwrite a matching runtime batch state` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 239 | `keeps command pending separate from the live batch run and does not optimistically mark every command running` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 248 | `offers continuation when failed tasks are the only unfinished work` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 253 | `keeps pause and stop bound to the displayed batch while continuation waits for a non-live snapshot` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 263 | `rehydrates the same live counts and status after returning to the page` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 272 | `exposes cancelled counts and a preview-confirmed pending cancellation action` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |

### `tests/renderer-confirmation-host.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `implements a renderer-owned, focus-safe confirmation lifecycle` | — | `renderer` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 24 | `keeps the public confirmation API small and portal based` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 32 | `installs one host only after authentication and removes settings native confirms` | — | `renderer`、`security`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 46 | `keeps media preflight owned by the workbench view` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |

### `tests/renderer-content-client-switch.test.js`

- 测试声明数：**7**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 32 | `keeps ordinary queueing scoped to the current client` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 41 | `guards client-scoped article, queue, trash, and publication responses` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 50 | `uses one-way history refreshes and keeps the editor inside the content host` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 61 | `clears client-local UI state while retaining workspace preferences` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 71 | `does not use client changes as a signal to stop generation work` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 78 | `resets a real client switch to the pending-submission stage` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 85 | `switches from a queued client to another client through the real Renderer` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 工作区 fixture: workspacePath + 浏览器/Renderer fixture: browser.newPage :: equal + deep-equal |

### `tests/renderer-content-confirmation-flow.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `uses an observable in-app dialog for queue and cancel, never a native dialog` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 21 | `does not auto-accept native dialogs in content queue regression tests` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/renderer-content-generation.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `keeps writing-template discovery independent from client research` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 17 | `labels template controls and distinguishes builtin/custom sources` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 26 | `keeps generation disabled when no client is selected and ignores stale async responses` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |

### `tests/renderer-content-refresh-lifecycle.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `keeps initial loading silent and makes manual refresh feedback transient` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 22 | `separates workspace, article, and batch refresh intents` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 39 | `keeps content-source invalidation separate from customer and template rescans` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/renderer-content-submission-batch-actions.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `renders only service-issued cancel action plans and executes their plan ids` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 24 | `clears old plans while cancellation is pending and handles stale plans with one refresh` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 34 | `labels an empty action state as applying to all current-client batches` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |

### `tests/renderer-encoding.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 35 | `has no replacement characters or known mojibake fragments` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 45 | `keeps expected Chinese labels readable in React renderer files` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/renderer-generation-submission-handoff.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 15 | `closes the modal after a successful handoff and leaves a non-modal summary` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspacePath + 浏览器/Renderer fixture: browser.newPage :: equal + match |

### `tests/renderer-hepan-settings.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `renders independent safe capability guidance and never renders the Cookie` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: readFileSync :: match |

### `tests/renderer-history-editor-flow.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 242 | `keeps history mounted and restores filter, expansion, selection, scroll, and focus` | — | `renderer`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 280 | `guards unsaved edits and copies a published article as a new version` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 315 | `locks the history selection seam to an in-place editor instead of the generate tab` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | 文件 fixture: readFileSync :: match |
| 321 | `tracks a removal transaction by id from needs_repair through terminal recovery` | — | `renderer` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 342 | `shows repairable removal transactions as manual repair instead of automatic recovery` | — | `renderer` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: match |

### `tests/renderer-platform-cross-page-progress.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `mounts one task provider at App root and consumes it from the workbench` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/renderer-platform-queue-refresh-lifecycle.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 179 | `loads once, stays idle, refreshes manually, and deduplicates terminal revisions` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 浏览器/Renderer fixture: browser.newPage :: equal |

### `tests/renderer-platform-queue-refresh.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `uses the shared snapshot and refreshes after terminal submission states` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/renderer-platform-task-store.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `is an external store with snapshot initialization and stale-event rejection` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createPlatformTaskStore :: match |

### `tests/renderer-publication-history.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 53 | `keeps no publication separate from the article review status` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 59 | `summarizes independent targets without hiding partial or uncertain results` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 67 | `keeps the history detail target-oriented and visibly blocks uncertain direct retry` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: match |

### `tests/renderer-published-trash-flow.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `explains published retention and exposes confirmed trash disposition` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |

### `tests/renderer-question-editor-session.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `has one question save action and a separate cancellable manual-answer panel` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 21 | `uses a client/question/session identity and clears content-source state without workspace refresh` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 35 | `contains the real renderer regression hooks for focus and pointer isolation` | — | `renderer`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 90 | `opens, closes, restores focus, resets references, and survives client switching` | — | `renderer`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 浏览器/Renderer fixture: browser.newPage :: equal |
| 121 | `keeps the desktop panel non-blocking and uses a full-screen narrow panel` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 浏览器/Renderer fixture: browser.newPage :: equal + truthiness |

### `tests/renderer-residue-cleanup-flow.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 112 | `(动态测试名，需人工确认)` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 136 | `declares the transaction lifecycle contract at the renderer boundary` | — | `renderer`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | 文件 fixture: readFileSync :: match |

### `tests/renderer-resource-library-api.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `uses the paged media service methods directly` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定 | — |

### `tests/renderer-responsive-layout.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 154 | `keeps the preflight confirmation button clickable beside the normal authorization status bar` | — | `renderer`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | 浏览器/Renderer fixture: browser.newPage :: equal + truthiness |
| 189 | `rescans media articles and refreshes orders after a successful paid submission` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 浏览器/Renderer fixture: browser.newPage :: match + truthiness |
| 209 | `measures the history toolbar at the medium viewport` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 213 | `measures the history toolbar at the desktop viewport` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 217 | `exposes the settings page content at the desktop viewport` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 浏览器/Renderer fixture: browser.newPage :: match + truthiness |
| 244 | `keeps expanded long-title history rows and row-end actions inside narrow viewports` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | 文件 fixture: readFileSync :: equal + match + truthiness |

### `tests/renderer-settings-window-focus.electron.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 59 | `keeps first save, confirmation cancel, success, failure, and clear immediately interactive` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 临时目录: mkdtempSync :: equal |

### `tests/renderer-settings.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `maps all runtime capability states without treating not_checked as unavailable` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 15 | `exposes storage maintenance and the safe browser self-check bridge` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: match |
| 29 | `keeps cache cleanup guarded while exposing usage categories` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>配置持久化、默认值与环境来源保持明确 | 文件 fixture: readFileSync :: match |
| 42 | `organizes provider and system settings behind responsive navigation` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 文件 fixture: readFileSync :: match |

### `tests/renderer-template-discovery-empty-client.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 18 | `discovers custom templates from an empty-client workspace and refreshes the revision` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 32 | `loads catalog and submission platforms without a selected client` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 40 | `provides an explicit refresh action for clients and templates` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |

### `tests/renderer-time-format.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 13 | `formats the same UTC instant consistently as Beijing time` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 19 | `handles invalid, missing, and legacy UTC-like values safely` | — | `renderer`、`migration` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 26 | `is used by the order history view for persisted timestamps` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | 文件 fixture: readFileSync :: match |

### `tests/renderer-workspace-behavior.test.js`

- 测试声明数：**7**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 41 | `starts in checking, mounts App only for ready, and never calls business APIs` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspacePath :: equal + deep-equal |
| 68 | `keeps invalid and pending states in the welcome UI with safe controls` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 96 | `shows a saved workspace configuration error while remaining in selection_required` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 105 | `keeps the welcome state after picker cancellation` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 131 | `confirms with exactly the service-owned token and enters relaunching` | — | `renderer`、`security`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 152 | `maps all renderer-facing errors to fixed safe Chinese messages` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 165 | `disables Settings workspace commands while relaunching` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: workspacePath :: equal |

### `tests/renderer-workspace-contract.test.js`

- 测试声明数：**7**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `mounts App only through WorkspaceBootstrapGate` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 21 | `keeps the welcome flow isolated from business APIs and default paths` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 28 | `declares a token-only confirmation wrapper and exactly seven workspace methods` | — | `renderer`、`security`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 37 | `keeps key renderer files UTF-8 readable without known mojibake markers` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 44 | `lets Settings show and operate on the current workspace` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: workspacePath :: match |
| 50 | `guards selection awaits after unmount and exposes parent busy cleanup` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 55 | `deduplicates Settings bootstrap reads and blocks top-level commands while switching` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/research-store.test.js`

- 测试声明数：**9**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 19 | `saves, lists, and reads a normalized record` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 26 | `updates an existing record for the same client and query` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 34 | `stores collection provenance and removes only the requested research` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 52 | `rejects short or oversized answers and invalid collection methods` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 66 | `requires references to be an array of title and valid HTTP URL` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 75 | `rejects invalid JSON and JSON arrays` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 84 | `rejects empty answers and missing records` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 90 | `rejects unsafe research path segments and linked client directories` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: mkdtempSync :: throws/rejects |
| 119 | `stores records below the workspace research directory` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/runtime-diagnostics-ipc.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 5 | `exposes safe capability diagnostics and a browser self-check IPC boundary` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal |
| 29 | `forwards the updated browser capability returned by a successful self-check` | — | `ipc` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | IPC stub: handlers :: equal |

### `tests/runtime-diagnostics.test.js`

- 测试声明数：**15**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 43 | `keeps a configured browser channel in not_checked and isolates optional Hepan` | — | `ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal |
| 62 | `retains a successful browser smoke result for the next diagnostic read` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal |
| 81 | `recovers from a failed browser smoke and resets when the channel changes` | — | `ipc` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal + throws/rejects |
| 109 | `prefers application browser configuration and reports independent capability failures` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService + 文件 fixture: writeFileSync :: equal + deep-equal + truthiness |
| 120 | `resolves bundled Node and CLI without PATH or external overrides` | — | `security` | 安全边界与敏感信息不泄露<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService + 文件 fixture: writeFileSync :: equal |
| 142 | `exposes an async runtime while keeping Doubao on its own session paths` | — | `domain` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 154 | `accepts an explicit Doubao profileId while defaulting to the application profile` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 164 | `invokes execFile with structured Playwright arguments and the session environment` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 207 | `resolves a Windows npm wrapper to the Playwright JavaScript entrypoint` | — | `domain` | 打包边界、运行时依赖与应用身份保持一致 | 临时目录: makeTemporaryDirectory + 文件 fixture: writeFileSync :: equal + deep-equal + match |
| 232 | `passes evaluate timeoutMs through to the runtime process` | — | `domain` | 打包边界、运行时依赖与应用身份保持一致 | 临时目录: makeTemporaryDirectory :: equal + deep-equal |
| 248 | `maps an execFile timeout to a stable runtime error` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 270 | `maps browser session-not-open diagnostics from stdout or stderr` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 299 | `does not classify a session diagnostic from the source error message alone` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 315 | `maps a failed execFile command without hiding its diagnostics` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 334 | `keeps the legacy synchronous pwCmd, pwRun, and runCode APIs working` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | store/service stub: fakeExecSync :: equal + deep-equal + match |

### `tests/runtime-tools.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 30 | `prepares only regular node.exe and LICENSE files from a verified archive` | — | `packaging`、`store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal |
| 63 | `rejects a downloaded archive whose checksum differs from the manifest` | — | `packaging`、`store` | 发布状态、重复保护与尝试历史保持一致<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |

### `tests/storage-maintenance-service.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 37 | `registers safe usage and cache cleanup IPC commands` | — | `ipc` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal + deep-equal |
| 56 | `reports logs, temporary files, DOCX cache, and profile without following path links` | — | `security` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>文档文本提取与空/损坏输入错误语义保持稳定 | store/service stub: createStorageMaintenanceService :: equal |
| 82 | `removes only expired or over-limit whitelisted files and preserves protected data` | — | `security` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createStorageMaintenanceService :: equal |
| 121 | `blocks cleanup while any collection, generation, or submission task is active` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createStorageMaintenanceService :: equal |
| 141 | `blocks cleanup when the activity provider returns a direct running state` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createStorageMaintenanceService :: equal |
| 160 | `continues after one delete fails and makes repeated cleanup safe` | — | `domain` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createStorageMaintenanceService :: equal |

### `tests/storage-paths.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 23 | `classifies every mutable path into the correct storage root` | — | `security` | 安全边界与敏感信息不泄露 | — |
| 49 | `rejects relative roots and roots that mix storage categories` | — | `domain` | 安全边界与敏感信息不泄露 | — |
| 63 | `creates only the marker, visible folders, and managed portable records` | — | `domain` | 安全边界与敏感信息不泄露 | — |
| 82 | `keeps application configuration separate from portable content` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | — |

### `tests/submission-attempt-rebind.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 86 | `rebinds the same queue pair to the new attempt before retrying the remote call` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 113 | `cancels a new reservation and skips the remote call when rebind cannot persist` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: readFileSync :: equal |

### `tests/submission-batch-reconcile-write.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 12 | `applies several transitions with one batch rename` | — | `store` | 发布状态、重复保护与尝试历史保持一致 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createSubmissionBatchStore :: equal + deep-equal |

### `tests/submission-batch-worker-integration.test.js`

- 测试声明数：**7**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 15 | `retries an active saved failed publication through the submission service` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createSubmissionBatchStore :: equal + truthiness |
| 182 | `writes a failed worker outcome back to both the publication ledger and batch` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: FAKE_ADAPTER_FAILED :: equal |
| 200 | `writes a successful worker outcome back to the batch without losing the published ledger result` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 217 | `keeps an uncertain worker result visible in both records` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 234 | `cancels the queued attempt when stop is requested before the remote call` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 255 | `does not let an old attempt update the newer attempt's batch result` | — | `store` | 发布状态、重复保护与尝试历史保持一致 | store/service stub: FAKE_ADAPTER_FAILED :: equal |
| 276 | `reconciles a stale queued batch, keeps ordinary cancel unavailable, and permits failed-item cleanup` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: FAKE_ADAPTER_FAILED :: equal |

### `tests/submission-pair-state.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 67 | `strictly classifies unsafe, missing, changed, and conflicting pairs` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: equal |
| 99 | `uses both_absent for failed historical cleanup across evaluate, preview, apply, and reconcile` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 135 | `cancels a latest queued reservation safely when both queue files are absent` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |

### `tests/submission-preflight-integration.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 3 | `preflight failure makes no media request and no submission order` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createMediaWorkbenchService :: equal |

### `tests/template-catalog.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 13 | `discovers a v2 template from its path with body-only content` | — | `security` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 30 | `accepts strict optional metadata and derives a platform description from platform.json` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 44 | `isolates one invalid template and keeps other platforms usable` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 57 | `keeps legacy front matter compatible and rejects builtin/custom collisions without overwriting` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 71 | `changes revision when a valid body changes` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯 | — |
| 83 | `diagnoses duplicate platform display names without merging ids` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |

### `tests/template-generation-contract.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 18 | `passes正文-only, v2 metadata, and legacy templates through one batch preview seam` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createTemplateStore :: equal + deep-equal + throws/rejects |

### `tests/template-store.test.js`

- 测试声明数：**13**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 27 | `lists multiple Chinese templates for one platform and selects by exact id` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 34 | `lists templates independently for a second platform` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 39 | `discovers all template platforms when no platform filter is supplied` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 44 | `rejects duplicate template names within one platform` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: throws/rejects |
| 50 | `rejects duplicate front matter keys` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 55 | `rejects unsafe front matter template names` | — | `store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 63 | `rejects missing front matter, required fields, platform mismatches, and empty bodies` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: throws/rejects |
| 80 | `rejects platform and template path traversal` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 86 | `rejects a platform symlink resolving outside the real templates directory` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |
| 107 | `merges read-only builtins with custom templates and marks their sources` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createTemplateStore + 文件 fixture: writeFileSync :: deep-equal |
| 124 | `keeps an explicit null builtin root disabled` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createTemplateStore :: truthiness |
| 129 | `rejects a custom template that collides with a builtin id` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createTemplateStore + 文件 fixture: writeFileSync :: throws/rejects |
| 141 | `copies a builtin into an independent custom template with a source snapshot` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createTemplateStore + 文件 fixture: writeFileSync :: equal + deep-equal |

### `tests/workspace-bootstrap-ipc.test.js`

- 测试声明数：**9**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 25 | `registers exactly the seven workspace bootstrap channels` | — | `ipc`、`store` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: deep-equal |
| 41 | `uses the native open-directory dialog and passes only the selected path to choose` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: deep-equal |
| 60 | `maps dialog cancellation to a stable error without side effects` | — | `ipc`、`store` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal |
| 79 | `keeps request-switch path-free and uses the directory dialog` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal + deep-equal |
| 101 | `passes only a token to confirm-selection and rejects renderer paths` | — | `renderer`、`ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal + deep-equal |
| 121 | `wraps all handler results and sanitizes arbitrary error details` | — | `ipc`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 工作区 fixture: workspacePath + IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal |
| 144 | `delegates open-current to the service and does not expose Electron` | — | `ipc`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal + deep-equal |
| 161 | `sanitizes open-current failures with the stable open error code` | — | `ipc`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal |
| 184 | `sanitizes unavailable switch state errors` | — | `ipc`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal |

### `tests/workspace-bootstrap-service.test.js`

- 测试声明数：**33**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 103 | `prefers a valid environment workspace and marks it as an override` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: workspacePath + store/service stub: createWorkspaceBootstrapService :: equal |
| 131 | `uses saved configuration only when the environment is absent` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: workspacePath :: equal |
| 144 | `requires selection with a specific stable error when saved configuration is damaged` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: workspacePath + 文件 fixture: writeFileSync :: equal |
| 170 | `uses invalid state for a saved path rejected by the validator` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspacePath + 文件 fixture: writeFileSync :: equal |
| 187 | `does not fall back when the environment override itself is invalid` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: workspacePath + store/service stub: createWorkspaceBootstrapService :: equal |
| 209 | `returns cancellation without creating, saving, or relaunching` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 219 | `classifies empty, existing, and nonempty directories into pending selections` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal |
| 240 | `confirms an empty directory with only the marker and missing workspace directories` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspacePath + 文件 fixture: readFileSync :: equal + deep-equal |
| 263 | `confirms existing workspaces without changing their contents` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 279 | `confirms nonempty directories without changing unrelated files` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal |
| 295 | `rejects every existing AutoPublish directory link before initialization` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 336 | `rejects an existing non-directory AutoPublish path before initialization` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 350 | `fails closed when lstat cannot inspect an AutoPublish path` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: createWorkspaceBootstrapService + 文件 fixture: writeFileSync :: equal |
| 383 | `returns a stable initialization error without saving or relaunching` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 405 | `rolls back initialized directories and marker when location persistence fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 426 | `refuses to remove a marker replaced before rollback and reports cleanup failure` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal |
| 448 | `detects marker modification immediately after the write and preserves it` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal |
| 473 | `refuses to remove a directory deleted and rebuilt before rollback` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 496 | `keeps the first directory identity when replacement races with marker failure` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 文件 fixture: writeFileSync :: equal |
| 521 | `reports cleanup failure when a newly created directory cannot be removed` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 554 | `makes selection tokens single-use, expiring, and immune to renderer path substitution` | — | `renderer`、`security`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 573 | `invalidates the previous token before attempting an invalid new selection` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 587 | `rechecks task and queue state at confirmation and blocks active work` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 607 | `blocks workspace switching while a generation batch is running` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 620 | `blocks request-switch under an environment override` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | — |
| 639 | `keeps a saved path after relaunch failure and does not retry in the same confirmation` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspacePath :: equal + deep-equal |
| 652 | `allows a failed relaunch to be retried for the same path and then becomes idempotent` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 681 | `serializes confirm, choose, and cancel while confirmation awaits relaunch` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 709 | `rejects bootstrap while confirmation is waiting for relaunch` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 726 | `maps task and queue state exceptions to a stable unavailable error` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 739 | `treats confirming the current path as a stable no-op` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspacePath :: equal |
| 755 | `returns current validation and delegates open-current` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspacePath :: equal + deep-equal |
| 772 | `maps openPath failures to a stable error without exposing the original message` | — | `store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/workspace-data-invalidation.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 15 | `merges same-scope refreshes, notifies subscribers, and ignores an older revision` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createWorkspaceDataStore :: equal |
| 42 | `preserves loading, error, and explicit manual refresh behavior` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createWorkspaceDataStore :: equal + throws/rejects |

### `tests/workspace-location-store.test.js`

- 测试声明数：**11**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 20 | `rejects missing or invalid userData paths without falling back to cwd` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore :: equal |
| 34 | `reports a missing configuration without creating one` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 临时目录: createTempDirectory + store/service stub: createWorkspaceLocationStore :: equal + deep-equal |
| 45 | `reads a strict version 1 configuration` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore + 文件 fixture: writeFileSync :: deep-equal |
| 56 | `reports corrupted JSON with a stable error code` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + store/service stub: createWorkspaceLocationStore + 文件 fixture: writeFileSync :: equal |
| 69 | `reports unknown versions separately from invalid schema fields` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore + 文件 fixture: writeFileSync :: equal |
| 99 | `atomically writes a version 1 configuration in userData only` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore + 文件 fixture: readFileSync :: deep-equal |
| 115 | `does not rename a truncated write and handles short writes by completing the buffer` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore + 文件 fixture: readFileSync :: equal + deep-equal |
| 145 | `preserves the old configuration when the atomic rename fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore + 文件 fixture: writeFileSync :: equal + deep-equal |
| 171 | `reports cleanup failure separately when an atomic write cannot remove its temporary file` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 200 | `rejects a symlink configuration file for both reads and writes` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore + 文件 fixture: writeFileSync :: equal |
| 225 | `returns a stable error when a write input getter throws` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore :: equal |

### `tests/workspace-paths.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 40 | `keeps the selected content library limited to portable content paths` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: equal + truthiness |
| 65 | `initializes a content library without creating local or installation state` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync :: equal + truthiness |
| 86 | `loads application tool configuration before config-dependent modules are evaluated` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: equal + deep-equal |
| 120 | `requires explicit appRoot and workspaceRoot at every runtime configuration entry point` | — | `store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot :: throws/rejects |
| 146 | `loads the workspace environment once and exposes workspace paths` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 临时目录: mkdtempSync + 工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal |
| 179 | `reports stable secrets-free validation errors for missing startup configuration` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | — |
| 190 | `does not retain workspace secrets after switching to a workspace without them` | — | `store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: equal |
| 231 | `keeps media API key resolution free of dotenv loading side effects` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: equal |

### `tests/workspace-validator.test.js`

- 测试声明数：**11**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 33 | `classifies writable empty and nonempty directories without initializing them` | — | `security`、`store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 文件 fixture: writeFileSync :: equal + deep-equal |
| 54 | `classifies a valid version 1 marker as an existing workspace` | — | `security`、`store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory :: equal + deep-equal |
| 69 | `validates a marker through a fixed path when its filename uses Windows casing` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 文件 fixture: writeFileSync :: equal + deep-equal |
| 91 | `does not classify a damaged case-variant marker as a nonempty directory` | — | `security`、`store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 文件 fixture: writeFileSync :: equal |
| 109 | `returns stable invalid errors for missing paths and files` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 文件 fixture: writeFileSync :: equal |
| 133 | `rejects roots, system paths, application paths, their parents, and userData` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory :: equal |
| 160 | `rejects a directory when the random write probe cannot create a file` | — | `security`、`store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory :: equal + deep-equal |
| 183 | `rejects paths whose realpath cannot be resolved` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory :: equal |
| 202 | `fails closed when a protected path realpath fails` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory :: equal |
| 232 | `reports probe cleanup failures without claiming the directory is merely unwritable` | — | `security`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory :: equal |
| 257 | `rejects damaged, unknown-version, and linked markers` | — | `security`、`store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: createTempDirectory + 文件 fixture: writeFileSync :: equal |

## 重复测试名称候选

以下仅按静态解析后的精确测试名分组，不判断输入、分支或可观察结果是否相同；不自动删除。

未发现重复测试名。

## 相同 fixture/断言组合候选

以下分组只比较静态命中的 fixture 与断言类别。它们是保守的人工审查入口，不等同于重复覆盖：必须进一步核对输入、分支、依赖替身和可观察结果后，才能决定合并或删除。

### `文件 fixture: readFileSync :: match`（18 项）

- `tests/content-library-migration.test.js:284` — excludes the one-shot migration script from the desktop package
- `tests/hepan-provider-settings.test.js:212` — renders configured paths as safe status and submits only changed setting fields
- `tests/j4125-auth-contract.test.js:7` — contains an isolated HTTPS auth service contract without business data
- `tests/production-packaging.test.js:7` — inherits alpha boundaries while requiring signed ASAR production artifacts
- `tests/renderer-article-history.test.js:71` — keeps article opening separate from queue selection
- `tests/renderer-article-history.test.js:82` — offers a current-client trash view with restore and confirmed permanent deletion
- `tests/renderer-article-history.test.js:95` — keeps saved articles selectable for submission queueing
- `tests/renderer-batch-generation.test.js:41` — offers one-material retry in the batch source step and updates only that client material
- `tests/renderer-batch-generation.test.js:174` — exposes renderer-only generation batch wrappers through preload
- `tests/renderer-hepan-settings.test.js:7` — renders independent safe capability guidance and never renders the Cookie
- `tests/renderer-history-editor-flow.test.js:315` — locks the history selection seam to an in-place editor instead of the generate tab
- `tests/renderer-history-editor-flow.test.js:342` — shows repairable removal transactions as manual repair instead of automatic recovery
- `tests/renderer-publication-history.test.js:67` — keeps the history detail target-oriented and visibly blocks uncertain direct retry
- `tests/renderer-residue-cleanup-flow.test.js:136` — declares the transaction lifecycle contract at the renderer boundary
- `tests/renderer-settings.test.js:15` — exposes storage maintenance and the safe browser self-check bridge
- `tests/renderer-settings.test.js:29` — keeps cache cleanup guarded while exposing usage categories
- `tests/renderer-settings.test.js:42` — organizes provider and system settings behind responsive navigation
- `tests/renderer-time-format.test.js:26` — is used by the order history view for persisted timestamps

### `文件 fixture: writeFileSync :: equal + deep-equal`（16 项）

- `tests/article-store.test.js:138` — recovers a complete prior article after an interrupted two-file update
- `tests/article-store.test.js:181` — normalizes a legacy single research id without manufacturing snapshots
- `tests/article-store.test.js:203` — accepts an IPC-roundtripped legacy article with matching singular and plural research ids
- `tests/article-trash-service.test.js:48` — creates a minimal tombstone, keeps queue copies and records, and restores articles
- `tests/hepan-publish-contract.test.js:20` — passes Markdown/TXT through a random temporary JSON payload and always removes it
- `tests/hepan-publish-contract.test.js:93` — maps payload validation failures to stable safe outcomes and cleans after runner errors
- `tests/legacy-migration.test.js:84` — matches only the exact search query after removing a UTF-8 BOM
- `tests/media-workbench-service.test.js:31` — scans text articles and applies selected resources from drafts
- `tests/media-workbench-service.test.js:47` — previews text articles with draft resource fields merged
- `tests/media-workbench-service.test.js:109` — submits tasks serially and continues after one failure
- `tests/media-workbench-service.test.js:139` — stop request skips tasks after the current request
- `tests/workspace-bootstrap-service.test.js:263` — confirms existing workspaces without changing their contents
- `tests/workspace-bootstrap-service.test.js:295` — rejects every existing AutoPublish directory link before initialization
- `tests/workspace-bootstrap-service.test.js:336` — rejects an existing non-directory AutoPublish path before initialization
- `tests/workspace-bootstrap-service.test.js:383` — returns a stable initialization error without saving or relaunching
- `tests/workspace-bootstrap-service.test.js:405` — rolls back initialized directories and marker when location persistence fails

### `文件 fixture: writeFileSync :: throws/rejects`（12 项）

- `tests/article-store.test.js:101` — rejects damaged JSON, missing markdown, and mismatched markdown
- `tests/client-knowledge.test.js:175` — does not use the workspace as clients root when clients is missing
- `tests/client-knowledge.test.js:186` — rejects a clients root that is a regular file
- `tests/client-knowledge.test.js:228` — rejects a client symlink resolving outside workspace.clients
- `tests/client-knowledge.test.js:287` — rejects missing and empty queries
- `tests/hepan-article-source.test.js:68` — returns stable article errors for invalid extension, empty values, invalid UTF-8, and oversized input
- `tests/question-store.test.js:236` — rejects malformed questions.json with a stable error
- `tests/research-store.test.js:75` — rejects invalid JSON and JSON arrays
- `tests/template-store.test.js:44` — rejects duplicate template names within one platform
- `tests/template-store.test.js:50` — rejects duplicate front matter keys
- `tests/template-store.test.js:55` — rejects unsafe front matter template names
- `tests/template-store.test.js:63` — rejects missing front matter, required fields, platform mismatches, and empty bodies

### `IPC stub: handlers :: deep-equal`（10 项）

- `tests/ai-content-ipc.test.js:60` — exposes safe removal transaction query and retry handlers
- `tests/content-submission-ipc.test.js:3` — requires confirmed true and never accepts renderer paths
- `tests/content-submission-ipc.test.js:10` — exposes current-client submission batch history without renderer paths
- `tests/content-submission-ipc.test.js:24` — forwards only the preview action plan token for batch cancellation
- `tests/content-submission-ipc.test.js:59` — exposes reconciliation cleanup previews and keeps queue paths out of the renderer response
- `tests/content-submission-ipc.test.js:75` — keeps residue cleanup counts and reason codes while stripping filesystem fields
- `tests/desktop-ipc-response.test.js:15` — wraps async handlers
- `tests/doubao-collection-ipc.test.js:57` — registers the complete public channel surface
- `tests/doubao-collection-ipc.test.js:62` — routes batch preview and prepared start through validated public inputs
- `tests/publication-ipc.test.js:45` — rejects renderer path-like publication history input

### `store/service stub: fakeStore :: equal + deep-equal`（10 项）

- `tests/article-review-service.test.js:58` — reviews a cross-client selection and reports incomplete source provenance
- `tests/article-review-service.test.js:107` — is idempotent for saved articles and does not change review timestamps
- `tests/generation-batch-runner.test.js:98` — passes the complete task to article lookup before generating a pending task
- `tests/generation-batch-runner.test.js:125` — does not leave a task pending when article lookup fails before claim
- `tests/generation-batch-runner.test.js:216` — retries rate limits, network failures, timeouts, and server failures with injected waits
- `tests/generation-batch-runner.test.js:236` — pauses the batch for configuration errors and continues after non-retryable task errors
- `tests/generation-batch-runner.test.js:269` — pauses the whole batch for missing configuration and invalid models
- `tests/generation-batch-runner.test.js:294` — repairs a saved article without another AI call and retries failed tasks only
- `tests/generation-batch-runner.test.js:324` — runs each task once with a validated future concurrency greater than one
- `tests/generation-batch-runner.test.js:379` — keeps the running task alive while cancelling later pending tasks

### `文件 fixture: writeFileSync :: equal`（8 项）

- `tests/hepan-publish-contract.test.js:60` — keeps DOCX on the --article path and does not create a JSON payload
- `tests/hepan-python-payload-runtime.test.js:75` — validates the real Node-generated Markdown and TXT payloads without cookie, image, or network access
- `tests/submission-pair-state.test.js:67` — strictly classifies unsafe, missing, changed, and conflicting pairs
- `tests/workspace-bootstrap-service.test.js:219` — classifies empty, existing, and nonempty directories into pending selections
- `tests/workspace-bootstrap-service.test.js:279` — confirms nonempty directories without changing unrelated files
- `tests/workspace-bootstrap-service.test.js:426` — refuses to remove a marker replaced before rollback and reports cleanup failure
- `tests/workspace-bootstrap-service.test.js:448` — detects marker modification immediately after the write and preserves it
- `tests/workspace-bootstrap-service.test.js:496` — keeps the first directory identity when replacement races with marker failure

### `临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects`（7 项）

- `tests/client-knowledge.test.js:204` — rejects client metadata symlinks resolving outside the client directory
- `tests/client-knowledge.test.js:238` — rejects a clients root symlink resolving outside the workspace
- `tests/client-knowledge.test.js:262` — rejects a search query file link resolving outside the client directory
- `tests/question-store.test.js:257` — rejects a questions.json file symlink escaping workspace
- `tests/question-store.test.js:290` — rejects a search_query.txt file symlink escaping workspace
- `tests/runtime-tools.test.js:63` — rejects a downloaded archive whose checksum differs from the manifest
- `tests/template-store.test.js:86` — rejects a platform symlink resolving outside the real templates directory

### `文件 fixture: writeFileSync :: deep-equal`（6 项）

- `tests/article-store.test.js:63` — lists direct article JSON records by updatedAt descending
- `tests/article-store.test.js:129` — ignores temporary and non-JSON files while listing
- `tests/hepan-article-source.test.js:38` — uses the first non-empty TXT line as title and preserves safe paragraphs
- `tests/hepan-article-source.test.js:55` — scans supported ordinary files while excluding sidecars, temporary files, and symlinks
- `tests/hepan-publish-contract.test.js:117` — keeps local payload runtime, remote rejection, and uncertain outcomes distinct
- `tests/media-draft-store.test.js:38` — migrates old single resource drafts

### `IPC stub: handlers :: equal + deep-equal`（5 项）

- `tests/auth-ipc-boundary.test.js:7` — exposes only auth operations and broadcasts state changes
- `tests/content-submission-ipc.test.js:41` — passes an optional media resource id but continues rejecting renderer paths
- `tests/publication-ipc.test.js:5` — lists publication history for many articles in one ledger query and strips sensitive aggregate fields
- `tests/publication-ipc.test.js:55` — requires a second-confirmation marker and exposes only safe reconciliation fields
- `tests/storage-maintenance-service.test.js:37` — registers safe usage and cache cleanup IPC commands

### `IPC stub: ipcMain + store/service stub: fakeIpc :: equal + deep-equal`（5 项）

- `tests/content-generation-batch-ipc.test.js:28` — returns only allowlisted error code and message without provider details
- `tests/content-generation-batch-ipc.test.js:37` — returns safe template identity details for invalid batch templates
- `tests/content-generation-batch-ipc.test.js:65` — subscribes and unsubscribes renderer state listeners
- `tests/generation-submission-handoff-ipc.test.js:11` — rejects renderer paths and unknown fields before invoking the service
- `tests/generation-submission-handoff-ipc.test.js:22` — returns only the allowlisted safe error for a stale preview

### `store/service stub: createStorageMaintenanceService :: equal`（5 项）

- `tests/storage-maintenance-service.test.js:56` — reports logs, temporary files, DOCX cache, and profile without following path links
- `tests/storage-maintenance-service.test.js:82` — removes only expired or over-limit whitelisted files and preserves protected data
- `tests/storage-maintenance-service.test.js:121` — blocks cleanup while any collection, generation, or submission task is active
- `tests/storage-maintenance-service.test.js:141` — blocks cleanup when the activity provider returns a direct running state
- `tests/storage-maintenance-service.test.js:160` — continues after one delete fails and makes repeated cleanup safe

### `工作区 fixture: workspacePath :: equal`（4 项）

- `tests/desktop-packaging.test.js:472` — fails closed when runtime initialization throws
- `tests/renderer-workspace-behavior.test.js:165` — disables Settings workspace commands while relaunching
- `tests/workspace-bootstrap-service.test.js:131` — uses saved configuration only when the environment is absent
- `tests/workspace-bootstrap-service.test.js:739` — treats confirming the current path as a stable no-op

### `工作区 fixture: workspacePath :: equal + deep-equal`（4 项）

- `tests/authenticated-runtime.test.js:9` — starts once, exposes bootstrap state, and disposes idempotently
- `tests/renderer-workspace-behavior.test.js:41` — starts in checking, mounts App only for ready, and never calls business APIs
- `tests/workspace-bootstrap-service.test.js:639` — keeps a saved path after relaunch failure and does not retry in the same confirmation
- `tests/workspace-bootstrap-service.test.js:755` — returns current validation and delegates open-current

### `临时目录: createTempDirectory :: equal`（4 项）

- `tests/workspace-validator.test.js:133` — rejects roots, system paths, application paths, their parents, and userData
- `tests/workspace-validator.test.js:183` — rejects paths whose realpath cannot be resolved
- `tests/workspace-validator.test.js:202` — fails closed when a protected path realpath fails
- `tests/workspace-validator.test.js:232` — reports probe cleanup failures without claiming the directory is merely unwritable

### `临时目录: mkdtempSync :: throws/rejects`（4 项）

- `tests/article-store.test.js:160` — rejects generated client directories that resolve outside generated
- `tests/question-store.test.js:317` — rejects a customer directory symlink escaping workspace.clients
- `tests/question-store.test.js:342` — rejects a clients root symlink escaping workspace
- `tests/research-store.test.js:90` — rejects unsafe research path segments and linked client directories

### `IPC stub: createIpc :: equal + deep-equal`（4 项）

- `tests/ai-content-ipc.test.js:12` — registers the complete thin content IPC surface
- `tests/ai-content-ipc.test.js:41` — returns safe provenance validation errors through the generation IPC boundary
- `tests/ai-provider-ipc.test.js:12` — registers a thin safe configuration boundary
- `tests/ai-provider-ipc.test.js:35` — returns only coded safe errors

### `store/service stub: fakeRuntime :: equal`（4 项）

- `tests/doubao-browser-adapter.test.js:338` — detects when the current Doubao page requires login
- `tests/doubao-browser-adapter.test.js:347` — checks login state without opening a visible page
- `tests/doubao-browser-adapter.test.js:416` — reuses a ready session for collection and reopens after close
- `tests/doubao-browser-adapter.test.js:494` — detects login wording even when the page exposes an input

### `工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + throws/rejects`（3 项）

- `tests/hepan-provider-settings.test.js:116` — maps a failed login to a stable error without leaking cookie or temp path
- `tests/hepan-provider-settings.test.js:167` — uses a safe Python error code when the login command exits non-zero
- `tests/hepan-provider-settings.test.js:189` — fails the payload self-test before dependency or login checks

### `工作区 fixture: workspaceRoot :: equal`（3 项）

- `tests/article-trash-submission-lifecycle.test.js:44` — cancels unchanged queued pairs, removes both files, and preserves title/history
- `tests/article-trash-submission-lifecycle.test.js:62` — blocks the whole selection when any target is active
- `tests/legacy-migration.test.js:270` — exits nonzero from the command when the schema is invalid

### `工作区 fixture: workspaceRoot + store/service stub: createContentSubmissionService :: equal`（3 项）

- `tests/article-trash-service.test.js:154` — previews and commits one coordinated removal, cancelling only its queued attempt
- `tests/article-trash-service.test.js:180` — blocks an entire selection when one publication is active and leaves every side effect untouched
- `tests/article-trash-service.test.js:202` — resumes a confirmed removal from the durable transaction after an interruption

### `工作区 fixture: workspaceRoot + store/service stub: createResearchStore :: equal + deep-equal`（3 项）

- `tests/legacy-migration.test.js:59` — copies allowed client knowledge and imports matching research and articles
- `tests/legacy-migration.test.js:111` — is idempotent and does not overwrite non-legacy outputs
- `tests/legacy-migration.test.js:210` — skips malformed citation URLs instead of failing the matching research import

### `临时目录: createTempDirectory + 文件 fixture: writeFileSync :: equal`（3 项）

- `tests/workspace-validator.test.js:91` — does not classify a damaged case-variant marker as a nonempty directory
- `tests/workspace-validator.test.js:109` — returns stable invalid errors for missing paths and files
- `tests/workspace-validator.test.js:257` — rejects damaged, unknown-version, and linked markers

### `临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: equal + throws/rejects`（3 项）

- `tests/doubao-browser-adapter.test.js:605` — stops on a challenge page and captures a diagnostic
- `tests/doubao-browser-adapter.test.js:647` — stops on a page error and does not send a question
- `tests/doubao-browser-adapter.test.js:662` — keeps at most 20 diagnostic file groups

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal`（3 项）

- `tests/content-submission-batch.test.js:181` — returns published and uncertain guards without hiding other targets
- `tests/content-submission-batch.test.js:208` — exposes a queued reservation without a queue file as a conflict
- `tests/content-submission-batch.test.js:219` — does not cancel a reservation after submission has started

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + deep-equal`（3 项）

- `tests/content-submission-batch.test.js:99` — closes cancelled batches, removes their cancel plan, and reports repeat cancellation as idempotent
- `tests/publication-ledger-index.test.js:15` — does not rescan the publication directory for repeated id lookups
- `tests/publication-ledger-store.test.js:42` — captures a bounded immutable title snapshot on first reservation and preserves it across retries

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + throws/rejects`（3 项）

- `tests/legacy-migration.test.js:151` — rejects a linked workspace client target before copying legacy files
- `tests/legacy-migration.test.js:175` — rejects a linked workspace clients root before copying legacy files
- `tests/publication-ledger-store.test.js:28` — accepts an injected submission-records path only inside the workspace

### `临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal`（3 项）

- `tests/batch-workspace-scan.test.js:8` — scans media only from AUTO_PUBLISH_WORKSPACE input
- `tests/content-submission-batch.test.js:56` — creates an auditable batch idempotently and reports content conflicts
- `tests/runtime-tools.test.js:30` — prepares only regular node.exe and LICENSE files from a verified archive

### `临时目录: mkdtempSync + IPC stub: handlers + 文件 fixture: writeFileSync :: equal + deep-equal`（3 项）

- `tests/platform-ipc-boundary.test.js:9` — submits multiple source articles through one serialized desktop job
- `tests/platform-ipc-boundary.test.js:39` — runs confirmed automatic local trash through the main article removal interface
- `tests/platform-ipc-boundary.test.js:82` — keeps a multi-target article when one target is uncertain or archive-failed

### `浏览器/Renderer fixture: browser.newPage :: equal`（3 项）

- `tests/auth-gate.test.js:15` — does not mount the workspace before authentication
- `tests/renderer-platform-queue-refresh-lifecycle.test.js:179` — loads once, stays idle, refreshes manually, and deduplicates terminal revisions
- `tests/renderer-question-editor-session.test.js:90` — opens, closes, restores focus, resets references, and survives client switching

### `文件 fixture: readFileSync :: deep-equal + match`（3 项）

- `tests/application-identity.test.js:9` — uses one stable application name and app id for development and packaging
- `tests/article-store.test.js:44` — writes editable markdown alongside full JSON metadata
- `tests/article-store.test.js:55` — replaces both files when saving an updated article id

### `IPC stub: ipcRenderer :: match`（3 项）

- `tests/architecture-seams.test.js:36` — business views use domain bridges instead of Electron transport or main-process files
- `tests/content-workbench-regression.test.js:76` — exposes the Task 1 batch preview and prepared-start renderer API
- `tests/doubao-content-workbench.test.js:27` — keeps privileged and browser-only implementation out of React files

### `IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal`（3 项）

- `tests/workspace-bootstrap-ipc.test.js:60` — maps dialog cancellation to a stable error without side effects
- `tests/workspace-bootstrap-ipc.test.js:161` — sanitizes open-current failures with the stable open error code
- `tests/workspace-bootstrap-ipc.test.js:184` — sanitizes unavailable switch state errors

### `IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: equal + deep-equal`（3 项）

- `tests/workspace-bootstrap-ipc.test.js:79` — keeps request-switch path-free and uses the directory dialog
- `tests/workspace-bootstrap-ipc.test.js:101` — passes only a token to confirm-selection and rejects renderer paths
- `tests/workspace-bootstrap-ipc.test.js:144` — delegates open-current to the service and does not expose Electron

### `store/service stub: createAuthService :: equal`（3 项）

- `tests/auth-service.test.js:29` — uses the fixed HTTPS endpoint and keeps access tokens in memory
- `tests/auth-service.test.js:54` — allows the six-character password floor for password replacement
- `tests/auth-service.test.js:157` — refreshes before expiry, unrefs timers, and backs off temporary failures

### `store/service stub: createMediaResourceService :: equal`（3 项）

- `tests/media-provider-settings.test.js:57` — resolves a fresh client for each resource operation while one refresh uses one snapshot
- `tests/media-resource-service.test.js:60` — pages cached resources with metadata
- `tests/media-resource-service.test.js:86` — searches cached resources by keyword and paginates the matches

### `store/service stub: createPlatformSettingsService :: equal + throws/rejects`（3 项）

- `tests/media-provider-settings.test.js:44` — keeps environment credentials read-only and gives clear a stable missing-config runtime error
- `tests/platform-settings-service.test.js:45` — gives environment overrides read-only priority and exposes no override secret
- `tests/platform-settings-service.test.js:68` — blocks mutations while platform tasks are running but keeps status readable

### `工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + throws/rejects`（2 项）

- `tests/hepan-provider-settings.test.js:33` — validates the publish interval and exposes the safe default
- `tests/hepan-provider-settings.test.js:48` — reads a valid interval from the environment without exposing secrets

### `工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + deep-equal`（2 项）

- `tests/hepan-provider-settings.test.js:88` — checks Python, imports, and login through a temporary cookie file that is always removed
- `tests/hepan-provider-settings.test.js:136` — preserves safe warnings and account identity without carrying an error code on success

### `工作区 fixture: workspacePath :: equal + match`（2 项）

- `tests/desktop-packaging.test.js:485` — initializes ready runtime after bootstrap and injects protected runtime dependencies
- `tests/desktop-packaging.test.js:500` — disposes the current runtime once before relaunch and tolerates relaunch without runtime

### `工作区 fixture: workspacePath + 文件 fixture: writeFileSync :: equal`（2 项）

- `tests/workspace-bootstrap-service.test.js:144` — requires selection with a specific stable error when saved configuration is damaged
- `tests/workspace-bootstrap-service.test.js:170` — uses invalid state for a saved path rejected by the validator

### `工作区 fixture: workspacePath + store/service stub: createWorkspaceBootstrapService :: equal`（2 项）

- `tests/workspace-bootstrap-service.test.js:103` — prefers a valid environment workspace and marks it as an override
- `tests/workspace-bootstrap-service.test.js:187` — does not fall back when the environment override itself is invalid

### `工作区 fixture: workspaceRoot :: throws/rejects`（2 项）

- `tests/client-knowledge.test.js:74` — rejects null and non-string workspace roots with a boundary error
- `tests/workspace-paths.test.js:120` — requires explicit appRoot and workspaceRoot at every runtime configuration entry point

### `工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: equal`（2 项）

- `tests/legacy-migration.test.js:93` — skips unmatched customers and empty answers while preserving existing knowledge
- `tests/legacy-migration.test.js:131` — loads without node:sqlite and reports a stable unsupported error only when migration reads a database

### `工作区 fixture: workspaceRoot + store/service stub: createDoubaoCollectionDesktopService :: equal`（2 项）

- `tests/doubao-collection-ipc.test.js:130` — closes the collection session after single, completed batch, and failed batch runs
- `tests/doubao-collection-ipc.test.js:194` — keeps the browser open while paused with pending tasks and does not close login sessions

### `工作区 fixture: workspaceRoot + store/service stub: createGenerationBatchStore + 文件 fixture: readFileSync :: equal + deep-equal`（2 项）

- `tests/generation-batch-store.test.js:36` — builds one stable task per client and template and preserves source ids
- `tests/generation-batch-store.test.js:133` — reads old batches without a cancelled count as zero and permanently cancels only pending tasks

### `工作区 fixture: workspaceRoot + store/service stub: createMediaWorkbenchService + 文件 fixture: writeFileSync :: equal + deep-equal`（2 项）

- `tests/media-workbench-service.test.js:160` — preflight blocks resources already reserved for the same article and excludes them from price
- `tests/media-workbench-service.test.js:224` — marks explicit rejection failed and unknown timeout uncertain without treating either as success

### `工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal`（2 项）

- `tests/runtime-diagnostics.test.js:43` — keeps a configured browser channel in not_checked and isolates optional Hepan
- `tests/runtime-diagnostics.test.js:62` — retains a successful browser smoke result for the next diagnostic read

### `临时目录: createTempDirectory :: equal + deep-equal`（2 项）

- `tests/workspace-validator.test.js:54` — classifies a valid version 1 marker as an existing workspace
- `tests/workspace-validator.test.js:160` — rejects a directory when the random write probe cannot create a file

### `临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore :: equal`（2 项）

- `tests/workspace-location-store.test.js:20` — rejects missing or invalid userData paths without falling back to cwd
- `tests/workspace-location-store.test.js:225` — returns a stable error when a write input getter throws

### `临时目录: createTempDirectory + 工作区 fixture: workspacePath + store/service stub: createWorkspaceLocationStore + 文件 fixture: writeFileSync :: equal`（2 项）

- `tests/workspace-location-store.test.js:69` — reports unknown versions separately from invalid schema fields
- `tests/workspace-location-store.test.js:200` — rejects a symlink configuration file for both reads and writes

### `临时目录: createTempDirectory + 文件 fixture: writeFileSync :: equal + deep-equal`（2 项）

- `tests/workspace-validator.test.js:33` — classifies writable empty and nonempty directories without initializing them
- `tests/workspace-validator.test.js:69` — validates a marker through a fixed path when its filename uses Windows casing

### `临时目录: mkdtempSync :: equal`（2 项）

- `tests/content-submission-batch.test.js:78` — writes queued content under the injected portable input root
- `tests/renderer-settings-window-focus.electron.test.js:59` — keeps first save, confirmation cancel, success, failure, and clear immediately interactive

### `临时目录: mkdtempSync :: equal + deep-equal`（2 项）

- `tests/content-submission-batch.test.js:45` — previews generated and saved articles and only platforms declaring queue import
- `tests/content-submission-batch.test.js:131` — previews a complete generated article as immediately queueable

### `临时目录: mkdtempSync :: equal + truthiness`（2 项）

- `tests/workspace-paths.test.js:40` — keeps the selected content library limited to portable content paths
- `tests/workspace-paths.test.js:65` — initializes a content library without creating local or installation state

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal`（2 项）

- `tests/content-submission-batch.test.js:160` — reserves publication targets and writes v2 provenance into the queue sidecar
- `tests/publication-ledger-store.test.js:12` — uses the portable publication directory and versioned JSON records

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createContentGenerationBatchService :: equal`（2 项）

- `tests/content-generation-batch-service.test.js:112` — continues a real persisted pending batch when article lookup requires the task client id
- `tests/content-generation-batch-service.test.js:157` — marks a real batch failed when article lookup fails before task claim

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createMediaOrderService :: equal`（2 项）

- `tests/media-order-service.test.js:136` — syncs an accepted order to published through its publicationId
- `tests/media-order-service.test.js:174` — automatically reconciles an uncertain order when a later sync proves publication

### `临时目录: mkdtempSync + 文件 fixture: writeFileSync :: deep-equal`（2 项）

- `tests/adapter-workspace-injection.test.js:7` — media adapters scan only their injected workspace input without module reload
- `tests/adapter-workspace-injection.test.js:21` — Hepan workspace config overrides inherited global configuration

### `临时目录: mkdtempSync + IPC stub: handlers + 文件 fixture: writeFileSync :: equal + truthiness`（2 项）

- `tests/media-runtime-workspace.test.js:36` — creates draft state beneath deps.paths.data
- `tests/media-runtime-workspace.test.js:55` — scans the historical app media input when no runtime paths are injected

### `临时目录: mkdtempSync + store/service stub: createAuthService :: equal + throws/rejects`（2 项）

- `tests/auth-service.test.js:90` — keeps the encrypted refresh token and account state through temporary failures
- `tests/auth-service.test.js:121` — clears the session only for a terminal refresh error and ignores stale responses

### `临时目录: mkdtempSync + store/service stub: createMediaOrderService :: equal`（2 项）

- `tests/media-runtime-workspace.test.js:113` — reads orders from the same workspace data directory used by the order store
- `tests/media-runtime-workspace.test.js:157` — uses the historical app data directory when no workspace path or environment is supplied

### `临时目录: mkdtempSync + store/service stub: createSubmissionExportService + 文件 fixture: readFileSync :: equal`（2 项）

- `tests/content-submission-export.test.js:55` — reserves a declared publication target and records v2 sidecar identity
- `tests/content-submission-export.test.js:74` — uses a media resource as the publication target when one is supplied

### `浏览器/Renderer fixture: browser.newPage :: equal + truthiness`（2 项）

- `tests/renderer-question-editor-session.test.js:121` — keeps the desktop panel non-blocking and uses a full-screen narrow panel
- `tests/renderer-responsive-layout.test.js:154` — keeps the preflight confirmation button clickable beside the normal authorization status bar

### `浏览器/Renderer fixture: browser.newPage :: match + truthiness`（2 项）

- `tests/renderer-responsive-layout.test.js:189` — rescans media articles and refreshes orders after a successful paid submission
- `tests/renderer-responsive-layout.test.js:217` — exposes the settings page content at the desktop viewport

### `文件 fixture: readFileSync :: equal`（2 项）

- `tests/submission-attempt-rebind.test.js:113` — cancels a new reservation and skips the remote call when rebind cannot persist
- `tests/workspace-paths.test.js:231` — keeps media API key resolution free of dotenv loading side effects

### `文件 fixture: readFileSync :: equal + deep-equal`（2 项）

- `tests/legacy-platform-settings-migration.test.js:70` — imports legacy values into encrypted provider stores, removes old runtime secrets, and is idempotent
- `tests/question-store.test.js:40` — creates, updates, lists, toggles, and deletes a stable question

### `文件 fixture: readFileSync :: equal + match + truthiness`（2 项）

- `tests/react-workbench-regression.test.js:57` — uses the complete main-process platform status shape
- `tests/renderer-responsive-layout.test.js:244` — keeps expanded long-title history rows and row-end actions inside narrow viewports

### `文件 fixture: readFileSync :: equal + throws/rejects`（2 项）

- `tests/publication-ledger.test.js:42` — requires reconciliation for uncertain outcomes
- `tests/published-archive.test.js:69` — rolls the complete source pair back when the sidecar archive step fails

### `文件 fixture: readFileSync :: equal + truthiness`（2 项）

- `tests/publication-ledger-migration.test.js:100` — defaults to a write-free dry-run and classifies queue, order, and orphan archive safely
- `tests/react-workbench-regression.test.js:69` — type-checks before building the renderer

### `文件 fixture: readFileSync :: truthiness`（2 项）

- `tests/react-workbench-regression.test.js:43` — exposes platform commands through preload
- `tests/react-workbench-regression.test.js:48` — shares the structured IPC response envelope

### `文件 fixture: writeFileSync :: equal + throws/rejects`（2 项）

- `tests/published-archive.test.js:52` — rejects a published archive collision without deleting either existing pair
- `tests/question-store.test.js:63` — imports search_query.txt once and rejects normalized duplicates

### `IPC stub: createIpc :: deep-equal`（2 项）

- `tests/ai-content-ipc.test.js:32` — wraps coded service errors without stack traces
- `tests/ai-content-ipc.test.js:53` — rejects non-object generation payloads without exposing internal details

### `IPC stub: handlers :: equal`（2 项）

- `tests/runtime-diagnostics-ipc.test.js:5` — exposes safe capability diagnostics and a browser self-check IPC boundary
- `tests/runtime-diagnostics-ipc.test.js:29` — forwards the updated browser capability returned by a successful self-check

### `IPC stub: handlers :: equal + match`（2 项）

- `tests/doubao-collection-ipc.test.js:334` — rejects unsafe ids, paths, renderer scripts and profile paths at the boundary
- `tests/doubao-collection-ipc.test.js:351` — rejects batches larger than 500 tasks and batch task fields outside the API

### `IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: deep-equal`（2 项）

- `tests/workspace-bootstrap-ipc.test.js:25` — registers exactly the seven workspace bootstrap channels
- `tests/workspace-bootstrap-ipc.test.js:41` — uses the native open-directory dialog and passes only the selected path to choose

### `store/service stub: createAuthService :: throws/rejects`（2 项）

- `tests/auth-service.test.js:42` — maps server failures to fixed non-sensitive error codes
- `tests/auth-service.test.js:47` — preserves stable lock and rate-limit codes regardless of HTTP status

### `store/service stub: createEventFixture :: equal + truthiness`（2 项）

- `tests/generation-snapshot-event.test.js:84` — records one current renderer follow-up IPC and batch read for every state event
- `tests/generation-snapshot-event.test.js:119` — consumes complete snapshot events without renderer follow-up IPC or batch reads

### `store/service stub: createGenerationSubmissionHandoffService :: equal + deep-equal`（2 项）

- `tests/generation-submission-handoff.test.js:16` — previews and commits 50 successful articles across two clients with one confirmation
- `tests/generation-submission-handoff.test.js:66` — blocks duplicate article identities before delegating to the submission service

### `store/service stub: createGenerationSubmissionHandoffService :: throws/rejects`（2 项）

- `tests/generation-submission-handoff.test.js:53` — rejects a commit after the batch revision changes
- `tests/generation-submission-handoff.test.js:98` — rejects a target that is not available for queue import

### `store/service stub: createMediaResourceService :: deep-equal`（2 项）

- `tests/media-resource-service.test.js:147` — adds a normalized resource to the pool and returns pool dto entries
- `tests/media-resource-service.test.js:184` — returns a normalized balance dto from the api client

### `store/service stub: createMemoryStore :: equal + deep-equal`（2 项）

- `tests/article-version-service.test.js:83` — reads the source and creates a fresh generated version without publishing metadata
- `tests/article-version-service.test.js:112` — does not mutate the source and does not share nested content metadata

### `store/service stub: createMemoryStore :: equal + throws/rejects`（2 项）

- `tests/article-version-service.test.js:131` — rejects a conflicting generated id instead of overwriting an article
- `tests/article-version-service.test.js:152` — rejects illegal input and unsafe generated ids before saving

### `store/service stub: createPlatformProviderConfigStore + 文件 fixture: writeFileSync :: equal + throws/rejects`（2 项）

- `tests/platform-provider-config-store.test.js:56` — fails closed for encryption, symlink and atomic-write failures
- `tests/platform-provider-config-store.test.js:78` — keeps separate provider files independently readable

### `store/service stub: createPlatformSettingsService :: equal + deep-equal`（2 项）

- `tests/media-provider-settings.test.js:28` — saves without calling the network and tests balance without replacing the saved config
- `tests/platform-settings-service.test.js:34` — exposes a small status interface without secrets and saves without testing

### `store/service stub: createPlatformTaskStateStore :: equal`（2 项）

- `tests/platform-task-progress.test.js:7` — restores 7 of 20 processed tasks without exposing paths
- `tests/platform-task-progress.test.js:36` — does not double count duplicate heartbeats or old runs

### `store/service stub: createTestStatusStore :: equal + deep-equal`（2 项）

- `tests/ai-provider-service.test.js:117` — records only a safe successful test result, supports clear, and fingerprints settings
- `tests/ai-provider-service.test.js:138` — tests a first draft without creating formal application configuration

### `store/service stub: FAKE_ADAPTER_FAILED :: equal`（2 项）

- `tests/submission-batch-worker-integration.test.js:182` — writes a failed worker outcome back to both the publication ledger and batch
- `tests/submission-batch-worker-integration.test.js:255` — does not let an old attempt update the newer attempt's batch result

### `store/service stub: fakeStore :: equal`（2 项）

- `tests/generation-batch-runner.test.js:186` — aborts the active task and leaves later tasks pending when stopped
- `tests/generation-batch-runner.test.js:427` — handles a controllable fifty-task run without duplicate execution after stop and continue

## 受控执行记录

以下结果来自隔离 fixture 或本地构建，不连接真实 AI、浏览器远端投稿服务或客户工作区：

### Phase 0-7 runtime/publication/submission/Renderer implementation record

- `tests/runtime-publication-wiring.test.js`：通过 `registerIpc()` 的生产式 IPC 组装观察 publication IPC 与文章管理 snapshot 是否读取同一 published record；`a4361cf` 后作为单一主进程 ledger 注入的回归测试。
- `tests/platform-archive-worker-boundary.test.js`：在临时工作区制造远端 `published` 与本地 archive conflict，销毁 Worker service 后重新构建主进程 query；`7c6b5b3` 后验证归档失败是持久 batch item 事实，且不把 publication 改为 failed。
- `tests/content-submission-query-benchmark.test.js`：真实 `SubmissionBatchStore` 的 `listBatches()` 操作计数 benchmark；`5403eee`、`092c538` 后验证一次查询只全量读取 batch store 一次、sidecar 每 item 至多一次，并保持近似线性。1000-batch 墙钟 p95 因旧、新 fixture 派生工作不等价而不可比；该项作为接受的 unavailable wall-clock gate 记录，不宣称时间提升。
- `tests/desktop-task-service.test.js`、`tests/platform-ipc-boundary.test.js` 与 `tests/platform-submission-invocation-count.test.js`：`77f22ca` 后验证唯一普通平台远端执行链是 `platforms:submit-selected` -> `startPlatformSubmit` -> Worker `platform-submit`。
- Phase 6 caller Go 证据：`desktop:start-batch`、`desktop:stop-batch`、`desktop:refresh-queue`、`desktop:get-state` 仅在被删除的 preload/IPC 链内互相引用；Renderer 没有 `desktopConsole.batch` 调用；Worker `batch` 是 `runPublicationBatch` 的唯一生产调用者。相反，`npm run snapshot` -> `scripts/snapshot.cmd` -> Worker `snapshot` -> `createQueueSnapshot` 仍是受支持 CLI，故 snapshot 保留。
- Phase 7 controller/test replacement：`tests/platform-submission-controller.test.mjs` 通过 bridge interface 覆盖重复 submit/pause/stop 抑制、陈旧命令隔离、每 terminal revision 一次刷新、residue inspect/confirm/cleanup/refresh 和 dispose；`tests/article-management-controller.test.js` 通过 controller interface 覆盖客户原子重置且保留 workspace target 偏好、陈旧 snapshot/cancellation 隔离、重复 mutation 抑制和 removal watch/poll 在客户切换或 dispose 后停止。旧 `renderer-residue-cleanup-flow` 源码字符串断言已由其真实页面 cleanup 行为与 controller interface 测试替代，覆盖“不留 busy、失败不报成功、残留清理仅刷新一次”的不变量。业务发布阶段仍由主进程 snapshot 的 `workflowByArticle` 提供。

对应实施提交：`8fc1cba`（基线）、`a4361cf`（ledger）、`7c6b5b3`（archive）、`5403eee`/`092c538`（read snapshot）、`7e62241`/`83784e9`/`920b8d0`/`6bef000`（submission modules）、`e320a97`/`e38b85d`/`95959b9`（Workspace Runtime/invalidation）、`77f22ca`（旧 remote batch 退休）。

| 命令/分组 | 结果 |
| --- | --- |
| `npm run typecheck:bridge` | 通过 |
| `npm run typecheck:renderer` | 通过 |
| Renderer 静态分组 | 94/94 通过 |
| 非 Renderer 受控分组 | 732 通过、7 跳过、0 失败；7 项因 Windows 文件 symlink 权限跳过 |
| 文章 attention、客户切换、generation handoff、history/question editor、residue cleanup、responsive layout、platform queue browser 分组 | 通过 |
| `npm run build:renderer` | 通过；当前唯一 JS/首屏 chunk `index-CR-EwY9J.js` 为 704,499 bytes，gzip 196.40 kB |
| `npm test` | 928 通过、0 失败、7 跳过 |
| `node --test`（Phase 7 页面/控制器） | 2026-07-23：控制器与 residue 页面定向 10/10 通过；完整 `npm test` 包含全部 Renderer 页面回归，931 通过、0 失败、7 项 Windows symlink 权限跳过。 |
| `npm run typecheck:renderer` | 2026-07-23：通过 |
| `npm run typecheck:bridge` | 2026-07-23：通过 |
| `npm run lint` | 2026-07-23：通过；旧临时安装包已归档到仓库外，未修改源码或新增宽泛 ignore。 |
| `npm run test:auth` | 2026-07-23：16/16 通过。 |
| `node --test tests/production-packaging.test.js` | 2026-07-23：1/1 通过。 |
| `npm run verify` | 2026-07-23：通过；其中全量测试为 931 通过、0 失败、7 项 Windows symlink 权限跳过。 |
| Alpha package / DOCX / launch smoke | 2026-07-23：通过。`release-alpha/鱼饼大王-Alpha-1.0.1-portable.exe`，artifact、embedded FileVersion/ProductVersion、package.json 和 `config/build-info.json` 均为 `1.0.1`；build-info commit 为 `6da1187`。启动 smoke 使用随机临时工作区及用户目录，退出后清理。 |

`electron-api.ts`、`transport-legacy.ts`、`submission-workflow.js` 及其测试已删除。`tests/architecture-seams.test.js` 继续保护业务 view 不直接依赖 `window.desktopConsole`、`ipcRenderer`、IPC channel 字符串或主进程文件，并保护领域 bridge 不回退到兼容 facade。

### 快照 benchmark

在最终重点验证中的 `node --test tests/article-management-snapshot-benchmark.test.js` 运行里，1000 篇文章/100 个批次的旧路径 p95 为 0.297 ms，新快照路径 p95 为 11.13 ms；IPC 从 104 降为 1，逻辑文件扫描从 104 降为 6。墙钟 p95 会受本机调度噪声影响；新路径还包含安全 DTO clone、attention、transaction 等派生，而旧 fixture 未计入等价成本，因此该数据用于记录预算和架构收益，不宣称达到 25% 时间下降目标。平台调用和生成事件 benchmark 详见对应测试输出及实施计划。

## 后续采集与人工复核

- [x] 完整 `npm test`：928 通过、0 失败、7 跳过。
- [ ] 单独执行 `npm --prefix auth-server test` 并记录实际结果；Renderer lint/build 已在受控执行记录中完成。
- [ ] 运行 `npm audit` 并记录报告时间、范围和已知接受项。
- [x] 对 `submission-workflow.test.js` 的删除完成替代覆盖核对：平台投稿 IPC/调用计数、platform service 和完整投稿生命周期测试覆盖原 owner 行为。
- [ ] 对检测到的四个 Renderer build/browser 流程人工确认是否可在共享 harness 中复用；本清单不改变任何测试执行方式。
