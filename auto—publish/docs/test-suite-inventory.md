# 测试套件清单（Phase 0）

> 自动生成文件。重新运行 `node scripts/test-inventory.js` 会重新扫描 `tests/*.test.js` 并覆盖本清单。

## 范围与证据边界

- 生成时间：`2026-07-26T02:15:16.132Z`（仅是清单生成时间，不是测试运行时间）。
- 扫描范围：根目录 `tests/*.test.js`，共 **188 个文件**；静态解析出 **1001 个测试声明**。
- 本脚本只使用 Node 内置 `fs`、`path` 和字符串扫描；不会 `require` 测试文件，不启动 Node test runner，不启动浏览器、Vite、Electron、Python 或任何外部服务，也不发起网络请求。
- `Renderer build`、`启动浏览器`、`读取生产源码` 均为静态证据标签，不代表本次执行过这些行为；未检测到证据时只表示“未见静态证据”。
- 运行时间、通过/失败/跳过、认证测试、lint/typecheck、Renderer build、audit 和包体积均未在本次清单生成中实际采集，不伪造基线。

## 基线记录

| 项目 | 状态 | 证据/采集命令 |
| --- | --- | --- |
| 根测试文件 | 已静态扫描：188 个 | `tests/*.test.js` |
| 根测试声明数 | 已静态解析：1001 个 | 不是实际运行结果；需用 `npm test` 采集 |
| 根测试运行时间与通过/失败/跳过 | 待采集 | `npm test` |
| 认证服务测试 | 待采集 | `npm --prefix auth-server test` |
| Renderer lint/typecheck | 待采集 | `npm --prefix media-workbench run lint`（计划命令） |
| Renderer production build 时间与产物体积 | 待采集 | `npm run build:renderer` |
| npm audit | 待采集 | `npm audit` |
| 安装包/包体积 | 待采集 | 需在明确的 alpha/production 构建后记录 |

## 汇总

| 指标 | 数值 |
| --- | ---: |
| 测试文件 | 188 |
| 静态测试声明 | 1001 |
| 检测到 Renderer build 静态证据的文件 | 7 |
| 检测到浏览器启动静态证据的文件 | 10 |
| 检测到读取生产源码静态证据的文件 | 43 |
| 未提取出明确不变量、需人工确认的测试声明 | 0 |

### 按主层级的静态测试声明数

| 主层级 | 测试声明数 |
| --- | ---: |
| `domain` | 236 |
| `ipc` | 58 |
| `migration` | 76 |
| `packaging` | 54 |
| `renderer` | 197 |
| `security` | 38 |
| `store` | 342 |

## 文件清单

| 文件 | 测试数 | 主层级 | 构建 Renderer | 启动浏览器 | 读取生产源码 | 字节数 | 文件修改时间 |
| --- | ---: | --- | --- | --- | --- | ---: | --- |
| `tests/adapter-workspace-injection.test.js` | 2 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2115 | `2026-07-25T09:22:45.217Z` |
| `tests/ai-client.test.js` | 11 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8959 | `2026-07-24T01:34:08.680Z` |
| `tests/ai-content-ipc.test.js` | 5 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6107 | `2026-07-24T01:34:08.681Z` |
| `tests/ai-content-service.test.js` | 11 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 12272 | `2026-07-25T16:01:43.544Z` |
| `tests/ai-provider-config-store.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6110 | `2026-07-24T01:34:08.681Z` |
| `tests/ai-provider-ipc.test.js` | 2 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2767 | `2026-07-24T01:34:08.681Z` |
| `tests/ai-provider-service.test.js` | 8 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7626 | `2026-07-24T01:34:08.681Z` |
| `tests/alpha-smoke-verifier.test.js` | 1 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 397 | `2026-07-24T01:34:08.681Z` |
| `tests/application-identity.test.js` | 2 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2120 | `2026-07-24T01:34:08.681Z` |
| `tests/architecture-seams.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 5382 | `2026-07-24T05:00:11.360Z` |
| `tests/article-attention-invalidation.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2643 | `2026-07-24T01:34:08.682Z` |
| `tests/article-attention-policy.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2839 | `2026-07-24T01:34:08.682Z` |
| `tests/article-attention-query.test.js` | 1 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1160 | `2026-07-25T13:08:12.259Z` |
| `tests/article-editor-session.test.js` | 8 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6481 | `2026-07-25T22:08:36.102Z` |
| `tests/article-generator.test.js` | 16 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16650 | `2026-07-24T01:34:08.683Z` |
| `tests/article-management-controller.test.js` | 5 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4854 | `2026-07-24T01:34:08.683Z` |
| `tests/article-management-filter-model.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2766 | `2026-07-24T01:34:08.684Z` |
| `tests/article-management-snapshot-benchmark.test.js` | 2 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8235 | `2026-07-24T01:34:08.684Z` |
| `tests/article-management-snapshot.test.js` | 6 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5682 | `2026-07-24T01:34:08.684Z` |
| `tests/article-removal-recovery-scheduler.test.js` | 2 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1280 | `2026-07-25T13:32:20.721Z` |
| `tests/article-removal-service.test.js` | 19 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16948 | `2026-07-25T21:37:05.079Z` |
| `tests/article-removal-transaction-store.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4457 | `2026-07-25T15:48:46.066Z` |
| `tests/article-review-service.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5647 | `2026-07-25T16:01:10.430Z` |
| `tests/article-store.test.js` | 24 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 20875 | `2026-07-25T15:26:26.585Z` |
| `tests/article-submission-eligibility.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1987 | `2026-07-24T01:34:08.685Z` |
| `tests/article-version-service.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7267 | `2026-07-25T16:01:10.430Z` |
| `tests/article-workflow.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2252 | `2026-07-24T01:34:08.685Z` |
| `tests/articles-docx.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1117 | `2026-07-24T01:34:08.685Z` |
| `tests/auth-gate.test.js` | 2 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 2755 | `2026-07-24T01:34:08.685Z` |
| `tests/auth-ipc-boundary.test.js` | 1 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1271 | `2026-07-24T01:34:08.686Z` |
| `tests/auth-local-data-boundary.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1712 | `2026-07-24T01:34:08.686Z` |
| `tests/auth-protected-ipc.test.js` | 2 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1586 | `2026-07-24T01:34:08.686Z` |
| `tests/auth-service.test.js` | 8 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8989 | `2026-07-24T01:34:08.686Z` |
| `tests/authenticated-runtime.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1114 | `2026-07-24T01:34:08.687Z` |
| `tests/batch-workspace-scan.test.js` | 1 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1640 | `2026-07-24T01:34:08.687Z` |
| `tests/ci-workflow-contract.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2301 | `2026-07-24T08:12:40.986Z` |
| `tests/client-knowledge.test.js` | 23 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 15330 | `2026-07-24T01:34:08.687Z` |
| `tests/client-material-store.test.js` | 9 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 11938 | `2026-07-24T01:34:08.687Z` |
| `tests/content-generation-batch-ipc.test.js` | 5 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6455 | `2026-07-24T01:34:08.688Z` |
| `tests/content-generation-batch-service.test.js` | 11 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 23043 | `2026-07-25T16:05:14.898Z` |
| `tests/content-library-migration.test.js` | 9 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 15352 | `2026-07-24T01:34:08.688Z` |
| `tests/content-metadata-migration.test.js` | 16 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 19450 | `2026-07-26T02:02:01.662Z` |
| `tests/content-store.test.js` | 2 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1403 | `2026-07-25T11:47:29.571Z` |
| `tests/content-submission-ipc.test.js` | 7 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6829 | `2026-07-24T23:24:01.601Z` |
| `tests/content-workbench-regression.test.js` | 8 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 5961 | `2026-07-24T01:34:08.689Z` |
| `tests/content-workspace.test.js` | 7 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3665 | `2026-07-24T01:34:08.689Z` |
| `tests/desktop-ipc-response.test.js` | 5 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1281 | `2026-07-24T01:34:08.689Z` |
| `tests/desktop-packaging.test.js` | 32 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 37742 | `2026-07-25T10:33:01.146Z` |
| `tests/desktop-task-service.test.js` | 7 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 10913 | `2026-07-25T09:42:38.671Z` |
| `tests/desktop-workbench-flow.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1936 | `2026-07-25T05:54:02.933Z` |
| `tests/device-identity-store.test.js` | 2 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1582 | `2026-07-24T01:34:08.691Z` |
| `tests/docx-text-extractor.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1954 | `2026-07-24T01:34:08.691Z` |
| `tests/doubao-browser-adapter.test.js` | 28 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 31158 | `2026-07-25T03:33:09.887Z` |
| `tests/doubao-collection-ipc.test.js` | 12 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16683 | `2026-07-24T01:34:08.692Z` |
| `tests/doubao-collection-queue.test.js` | 13 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 14836 | `2026-07-24T01:34:08.692Z` |
| `tests/doubao-collection-service.test.js` | 17 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17065 | `2026-07-24T01:34:08.692Z` |
| `tests/doubao-content-workbench.test.js` | 22 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 14363 | `2026-07-24T01:34:08.693Z` |
| `tests/doubao-page-parser.test.js` | 11 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6134 | `2026-07-24T01:34:08.693Z` |
| `tests/electron-security.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2249 | `2026-07-24T01:34:08.693Z` |
| `tests/generation-batch-runner.test.js` | 14 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17656 | `2026-07-25T16:03:22.983Z` |
| `tests/generation-batch-store.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8699 | `2026-07-24T01:34:08.695Z` |
| `tests/generation-snapshot-event.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6450 | `2026-07-25T16:06:05.171Z` |
| `tests/generation-snapshot-order.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1958 | `2026-07-24T01:34:08.695Z` |
| `tests/generation-submission-handoff-ipc.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2369 | `2026-07-25T04:04:16.400Z` |
| `tests/generation-submission-handoff.test.js` | 5 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8707 | `2026-07-25T11:39:58.227Z` |
| `tests/hepan-article-source.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3829 | `2026-07-24T01:34:08.696Z` |
| `tests/hepan-login-check.test.js` | 9 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 12590 | `2026-07-25T03:25:33.010Z` |
| `tests/hepan-provider-settings.test.js` | 11 | `store` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 16005 | `2026-07-25T03:20:11.009Z` |
| `tests/hepan-publish-contract.test.js` | 9 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 16009 | `2026-07-25T10:34:07.450Z` |
| `tests/hepan-python-payload-runtime.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 8851 | `2026-07-25T03:26:36.085Z` |
| `tests/hepan-settings-patch-contract.test.js` | 10 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 12452 | `2026-07-24T01:34:08.697Z` |
| `tests/j4125-auth-contract.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1012 | `2026-07-24T01:34:08.697Z` |
| `tests/legacy-migration.test.js` | 16 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17669 | `2026-07-24T01:34:08.697Z` |
| `tests/legacy-platform-settings-migration.test.js` | 3 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5753 | `2026-07-24T01:34:08.697Z` |
| `tests/legacy-submission-path-audit.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1760 | `2026-07-24T01:34:08.698Z` |
| `tests/media-article-converter.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 963 | `2026-07-24T01:34:08.698Z` |
| `tests/media-article-drawer-boundary.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 795 | `2026-07-24T01:34:08.698Z` |
| `tests/media-client.test.js` | 2 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1861 | `2026-07-25T02:36:16.076Z` |
| `tests/media-draft-store.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2391 | `2026-07-24T01:34:08.698Z` |
| `tests/media-preflight.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1453 | `2026-07-24T01:34:08.698Z` |
| `tests/media-provider-settings.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5824 | `2026-07-25T02:35:04.066Z` |
| `tests/media-resource-service.test.js` | 6 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6187 | `2026-07-24T01:34:08.699Z` |
| `tests/media-resource-ux.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 888 | `2026-07-24T01:34:08.699Z` |
| `tests/media-workbench-flow.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 907 | `2026-07-24T01:34:08.699Z` |
| `tests/packaged-docx-runtime.test.js` | 2 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 867 | `2026-07-24T01:34:08.699Z` |
| `tests/packaged-playwright-runtime.test.js` | 3 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2754 | `2026-07-24T01:34:08.700Z` |
| `tests/phase-01-architecture.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 3505 | `2026-07-24T15:17:58.937Z` |
| `tests/phase-01-domain-contracts.test.js` | 4 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5107 | `2026-07-24T12:14:16.028Z` |
| `tests/phase-02-architecture.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1058 | `2026-07-24T13:43:07.376Z` |
| `tests/phase-02-migration.test.js` | 5 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 10458 | `2026-07-24T14:25:26.052Z` |
| `tests/phase-02-operational-store.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5445 | `2026-07-24T22:51:50.005Z` |
| `tests/phase-02-runtime-capacity.test.js` | 4 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 10120 | `2026-07-24T15:30:53.515Z` |
| `tests/phase-03-account-profile-ipc.test.js` | 2 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2488 | `2026-07-25T04:05:32.058Z` |
| `tests/phase-03-composition.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6110 | `2026-07-25T01:25:11.166Z` |
| `tests/phase-03-content-account-binding-execution.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1516 | `2026-07-24T23:38:35.127Z` |
| `tests/phase-03-content-batch-store.test.js` | 1 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1515 | `2026-07-24T23:31:21.333Z` |
| `tests/phase-03-content-publication-chain.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 9426 | `2026-07-25T16:04:23.277Z` |
| `tests/phase-03-media-adapter-readonly.test.js` | 1 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 529 | `2026-07-24T23:09:27.301Z` |
| `tests/phase-03-media-order-evidence.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1226 | `2026-07-24T23:10:21.325Z` |
| `tests/phase-03-media-order-projection.test.js` | 3 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1814 | `2026-07-24T23:59:00.678Z` |
| `tests/phase-03-media-order-reconcile.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1496 | `2026-07-24T23:20:56.574Z` |
| `tests/phase-03-media-publication-workflow.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3407 | `2026-07-24T23:14:07.021Z` |
| `tests/phase-03-operational-content-submission.test.js` | 4 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6642 | `2026-07-25T16:04:23.277Z` |
| `tests/phase-03-post-processing.test.js` | 2 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5076 | `2026-07-24T23:00:54.870Z` |
| `tests/phase-03-publication-history-ipc.test.js` | 1 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1767 | `2026-07-24T23:07:06.991Z` |
| `tests/phase-03-publication-workflow.test.js` | 10 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 13098 | `2026-07-25T00:36:37.909Z` |
| `tests/phase-03-publisher-adapter.test.js` | 3 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2068 | `2026-07-24T16:38:21.865Z` |
| `tests/phase-03-runtime-no-legacy-ledger.test.js` | 4 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1892 | `2026-07-25T00:44:30.112Z` |
| `tests/phase-03-workbench-readonly.test.js` | 1 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 742 | `2026-07-24T22:38:40.559Z` |
| `tests/phase-03-worker-main-contract.test.js` | 9 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 9052 | `2026-07-25T09:07:22.851Z` |
| `tests/phase-04-browser-evidence.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 737 | `2026-07-25T03:28:37.172Z` |
| `tests/phase-04-hepan-runtime-paths.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 754 | `2026-07-25T02:19:25.094Z` |
| `tests/phase-04-media-transport.test.js` | 1 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1051 | `2026-07-25T02:29:21.450Z` |
| `tests/phase-04-platform-account-projection.test.js` | 4 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3691 | `2026-07-25T08:09:23.323Z` |
| `tests/phase-04-platform-run.test.js` | 6 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6012 | `2026-07-25T08:54:33.057Z` |
| `tests/phase-05-handoff-capacity.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3846 | `2026-07-25T15:35:06.032Z` |
| `tests/phase-05-p1-blockers.test.js` | 8 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17035 | `2026-07-26T01:02:54.294Z` |
| `tests/phase-05-production-removal.test.js` | 1 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3374 | `2026-07-25T21:38:40.880Z` |
| `tests/phase-05-production-seams.test.js` | 6 | `store` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 3671 | `2026-07-25T22:23:00.053Z` |
| `tests/phase-05-trash-confirmation.test.js` | 2 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2315 | `2026-07-25T16:01:10.429Z` |
| `tests/platform-account-binding-store.test.js` | 2 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2011 | `2026-07-25T04:52:36.768Z` |
| `tests/platform-account-inspector.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3609 | `2026-07-25T04:48:01.726Z` |
| `tests/platform-browser-session-lifecycle.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1606 | `2026-07-24T01:34:08.700Z` |
| `tests/platform-provider-config-store.test.js` | 4 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5245 | `2026-07-24T01:34:08.700Z` |
| `tests/platform-settings-service.test.js` | 5 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 5150 | `2026-07-24T01:34:08.701Z` |
| `tests/platform-task-progress.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3710 | `2026-07-24T01:34:08.701Z` |
| `tests/platform-workbench-service.test.js` | 6 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6877 | `2026-07-25T07:27:29.668Z` |
| `tests/production-packaging.test.js` | 1 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 746 | `2026-07-25T16:10:04.814Z` |
| `tests/prompt-builder.test.js` | 11 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6667 | `2026-07-24T01:34:08.702Z` |
| `tests/publication-article-identity.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1759 | `2026-07-24T01:34:08.702Z` |
| `tests/publication-ipc.test.js` | 3 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4530 | `2026-07-24T01:34:08.703Z` |
| `tests/publication-targets.test.js` | 3 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1514 | `2026-07-24T01:34:08.703Z` |
| `tests/published-archive.test.js` | 3 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4806 | `2026-07-24T01:34:08.704Z` |
| `tests/question-store.test.js` | 14 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17765 | `2026-07-25T11:30:15.698Z` |
| `tests/react-workbench-regression.test.js` | 9 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 5316 | `2026-07-25T08:09:23.323Z` |
| `tests/renderer-ai-provider-settings.test.js` | 8 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 4343 | `2026-07-24T01:34:08.705Z` |
| `tests/renderer-article-attention-actions.test.js` | 1 | `renderer` | 否（未见静态证据） | 是（检测到 chromium/firefox/webkit/electron launch 调用） | 否（未见静态证据） | 8139 | `2026-07-24T01:34:08.705Z` |
| `tests/renderer-article-history.test.js` | 9 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 7766 | `2026-07-24T01:34:08.705Z` |
| `tests/renderer-article-management-filters.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1153 | `2026-07-24T01:34:08.705Z` |
| `tests/renderer-article-management-flow.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1040 | `2026-07-24T01:34:08.705Z` |
| `tests/renderer-batch-generation.test.js` | 25 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 15676 | `2026-07-24T01:34:08.706Z` |
| `tests/renderer-confirmation-host.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2594 | `2026-07-24T01:34:08.706Z` |
| `tests/renderer-content-client-switch.test.js` | 1 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 17511 | `2026-07-25T04:26:15.863Z` |
| `tests/renderer-content-confirmation-flow.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1586 | `2026-07-24T01:34:08.707Z` |
| `tests/renderer-content-generation.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1641 | `2026-07-24T01:34:08.707Z` |
| `tests/renderer-content-refresh-lifecycle.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2677 | `2026-07-24T08:03:03.785Z` |
| `tests/renderer-content-submission-batch-actions.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2138 | `2026-07-24T01:34:08.707Z` |
| `tests/renderer-encoding.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1994 | `2026-07-24T01:34:08.707Z` |
| `tests/renderer-generation-submission-handoff.test.js` | 1 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 8501 | `2026-07-25T04:05:14.400Z` |
| `tests/renderer-harness-lock.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 1229 | `2026-07-24T05:00:11.387Z` |
| `tests/renderer-hepan-settings.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1303 | `2026-07-24T01:34:08.708Z` |
| `tests/renderer-history-editor-flow.test.js` | 5 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 21593 | `2026-07-24T01:34:08.708Z` |
| `tests/renderer-platform-cross-page-progress.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 770 | `2026-07-24T01:34:08.708Z` |
| `tests/renderer-platform-queue-refresh-lifecycle.test.js` | 1 | `renderer` | 否（未见静态证据） | 是（检测到 chromium/firefox/webkit/electron launch 调用） | 否（未见静态证据） | 12344 | `2026-07-24T01:34:08.708Z` |
| `tests/renderer-platform-queue-refresh.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1139 | `2026-07-24T01:34:08.708Z` |
| `tests/renderer-platform-task-store.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 753 | `2026-07-24T01:34:08.709Z` |
| `tests/renderer-publication-history.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 3994 | `2026-07-24T01:34:08.709Z` |
| `tests/renderer-published-trash-flow.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1156 | `2026-07-24T01:34:08.709Z` |
| `tests/renderer-question-editor-session.test.js` | 5 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 10886 | `2026-07-24T01:34:08.709Z` |
| `tests/renderer-residue-cleanup-flow.test.js` | 1 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 8653 | `2026-07-24T01:34:08.710Z` |
| `tests/renderer-resource-library-api.test.js` | 1 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 923 | `2026-07-24T01:34:08.710Z` |
| `tests/renderer-responsive-layout.test.js` | 6 | `renderer` | 是（检测到共享 Renderer harness 的构建入口调用） | 是（检测到共享 Renderer harness 的浏览器生命周期入口调用） | 否（未见静态证据） | 20729 | `2026-07-24T01:34:08.710Z` |
| `tests/renderer-settings-window-focus.electron.test.js` | 1 | `renderer` | 否（未见静态证据） | 是（检测到 chromium/firefox/webkit/electron launch 调用） | 否（未见静态证据） | 9211 | `2026-07-24T01:34:08.710Z` |
| `tests/renderer-settings.test.js` | 4 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 3055 | `2026-07-24T01:34:08.711Z` |
| `tests/renderer-template-discovery-empty-client.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 2390 | `2026-07-24T01:34:08.711Z` |
| `tests/renderer-time-format.test.js` | 3 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1521 | `2026-07-24T01:34:08.711Z` |
| `tests/renderer-workbench-controller-seams.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1514 | `2026-07-24T05:00:11.370Z` |
| `tests/renderer-workspace-behavior.test.js` | 7 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7348 | `2026-07-24T01:34:08.711Z` |
| `tests/renderer-workspace-contract.test.js` | 7 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 4300 | `2026-07-24T01:34:08.711Z` |
| `tests/research-store.test.js` | 9 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 7193 | `2026-07-24T01:34:08.711Z` |
| `tests/runtime-diagnostics-ipc.test.js` | 3 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3280 | `2026-07-25T14:04:42.265Z` |
| `tests/runtime-diagnostics.test.js` | 16 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 17068 | `2026-07-25T14:03:39.640Z` |
| `tests/runtime-tools.test.js` | 2 | `packaging` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3304 | `2026-07-24T01:34:08.712Z` |
| `tests/storage-maintenance-service.test.js` | 6 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 10281 | `2026-07-24T10:53:02.793Z` |
| `tests/storage-paths.test.js` | 4 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4548 | `2026-07-24T01:34:08.713Z` |
| `tests/submission-query-interface.test.js` | 2 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 2653 | `2026-07-24T01:34:08.715Z` |
| `tests/template-catalog.test.js` | 6 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 6214 | `2026-07-24T01:34:08.715Z` |
| `tests/template-generation-contract.test.js` | 1 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 4713 | `2026-07-25T16:06:05.172Z` |
| `tests/template-store.test.js` | 13 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 9950 | `2026-07-24T01:34:08.715Z` |
| `tests/test-discovery-contract.test.js` | 1 | `domain` | 否（未见静态证据） | 否（未见静态证据） | 是（检测到文件读取调用的生产路径参数、生产根变量或生产源码读取辅助函数） | 1043 | `2026-07-24T05:00:11.392Z` |
| `tests/workspace-bootstrap-ipc.test.js` | 9 | `ipc` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 10591 | `2026-07-24T01:34:08.716Z` |
| `tests/workspace-bootstrap-service.test.js` | 33 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 37485 | `2026-07-24T01:34:08.716Z` |
| `tests/workspace-data-invalidation.test.js` | 2 | `renderer` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3494 | `2026-07-24T01:34:08.716Z` |
| `tests/workspace-location-store.test.js` | 11 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 11880 | `2026-07-24T01:34:08.716Z` |
| `tests/workspace-manifest.test.js` | 2 | `migration` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 3785 | `2026-07-24T08:03:03.785Z` |
| `tests/workspace-paths.test.js` | 8 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 11433 | `2026-07-24T01:34:08.717Z` |
| `tests/workspace-runtime-lifecycle.test.js` | 6 | `store` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 11234 | `2026-07-24T01:34:08.717Z` |
| `tests/workspace-validator.test.js` | 11 | `security` | 否（未见静态证据） | 否（未见静态证据） | 否（未见静态证据） | 12299 | `2026-07-24T01:34:08.717Z` |

## 测试声明明细

每一项的层级和不变量都是静态候选。`待人工确认` 不表示该测试无价值，只表示自动扫描没有足够语义证据；删除前必须人工确认替代覆盖。

### `tests/adapter-workspace-injection.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `media adapters scan only their injected workspace input without module reload` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: deep-equal |
| 22 | `Hepan workspace config overrides inherited global configuration` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: deep-equal |

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
| 9 | `attention and workspace seams keep ownership and dependency direction explicit` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + match |
| 56 | `business views use domain bridges instead of Electron transport or main-process files` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: ipcRenderer :: match |
| 74 | `article management owns one revisioned snapshot seam` | — | `renderer` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 92 | `electron transport facade is gone and domains own their bridge seams` | — | `renderer` | 内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |

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

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 5 | `distinguishes automatic removal recovery from a transaction needing manual repair` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | — |

### `tests/article-editor-session.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 7 | `initializes all editable fields and closes an unchanged session without writing` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 15 | `keeps dirty state and the session open after save failure` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 23 | `drops late A results after switching to B and never writes B` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 33 | `drops late rejection after unmount without changing the new lifecycle` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 41 | `resets saving and outcome state when switching from A to B and fences late resolve` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 53 | `consumes a rejected save as state and keeps B retryable` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 64 | `publishes edits and timed save outcomes to the component subscriber` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 80 | `merges same-identity resource props without reopening or losing local edits` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

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

### `tests/article-management-controller.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 6 | `article management controller rejects a stale client snapshot and clears client-local selection` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 18 | `article management controller resets client facts atomically but retains workspace target preferences` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 36 | `article management controller deduplicates a cancellation mutation and ignores its old-client completion` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 56 | `article management controller stops a removal watch when switching clients or disposing` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 69 | `article management controller owns removal subscription and ignores its late poll after a client switch` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

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

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 28 | `combines one client read into a revisioned snapshot and reuses it` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 42 | `isolates clients and invalidates only after the workspace revision changes` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 58 | `exposes only the client-scoped snapshot seam through IPC` | — | `ipc` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + IPC stub: handlers :: equal |
| 74 | `keeps published history in the snapshot when the ledger supplies the same article record` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 81 | `does not offer cancellation for a published target when an old queued item remains` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 91 | `keeps an article pending while another declared target remains available` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/article-removal-recovery-scheduler.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 4 | `serializes recovery and prevents an in-flight recovery from continuing IO after dispose` | — | `domain` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 11 | `captures recovery rejection as a diagnostic` | — | `domain` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/article-removal-service.test.js`

- 测试声明数：**19**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 39 | `explicit retry revalidates blocked state and does not move the article` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 46 | `reports the persisted pending state rather than committed after initial execution fails` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 52 | `claims a newly persisted transaction before its first destructive action` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createArticleRemovalService :: equal |
| 60 | `fences a runner whose lease expires during an action before it can move an article` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createArticleRemovalService :: equal |
| 68 | `fails closed for a legacy transaction without a content fingerprint` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 75 | `explicit retry keeps needs_repair when content identity or queue fingerprint changed` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 86 | `queue, read and move failures share bounded retry accounting` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 97 | `persistence failures are recorded through the same retry path` | — | `security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 105 | `terminal checkpoint persistence failure returns to a legal recoverable phase` | — | `domain` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 112 | `routes repairable queue conflicts straight to manual repair` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 117 | `resumes a needs_repair transaction from its durable checkpoint after repair` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 127 | `does not duplicate an article move when another runner takes over during the move` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createArticleRemovalService :: equal |
| 138 | `reconciles an article active operation after its trash postcondition is proven` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createArticleRemovalService :: equal |
| 151 | `retries an article active operation with the same operation id when the source remains` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 161 | `reconciles a completed queue active operation without repeating queue I/O` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 170 | `revalidates blocked state and remaining queue actions after queue reconciliation` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 189 | `keeps an active operation repairable when its result cannot be proven` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 199 | `automatic recovery rejects invalid status and phase combinations` | — | `domain` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 206 | `a persistent claim permits only one runner to execute a transaction` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createArticleRemovalService :: equal |

### `tests/article-removal-transaction-store.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `reclaims a stale compare-and-update lock left by a killed process` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createArticleRemovalTransactionStore + 文件 fixture: writeFileSync :: equal |
| 18 | `does not reclaim an aged lock whose recorded owner is still alive` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createArticleRemovalTransactionStore + 文件 fixture: writeFileSync :: equal |
| 28 | `fails closed for aged locks with unknown owner metadata` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createArticleRemovalTransactionStore + 文件 fixture: writeFileSync :: equal |
| 40 | `fails closed for an aged corrupt lock` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createArticleRemovalTransactionStore + 文件 fixture: writeFileSync :: equal |
| 52 | `does not unlink a replacement lock during stale-lock ABA recovery` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createArticleRemovalTransactionStore + 文件 fixture: writeFileSync :: equal |

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

- 测试声明数：**24**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 38 | `saves and reads a complete generated article` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 44 | `writes editable markdown alongside full JSON metadata` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: deep-equal + match |
| 55 | `replaces both files when saving an updated article id` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: deep-equal + match |
| 63 | `lists direct article JSON records by createdAt descending without edit reordering` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal |
| 73 | `sorts createdAt by epoch across offsets and uses ArticleId for equal instants` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |
| 80 | `rejects unsafe client and article path segments` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 89 | `rejects Windows reserved device names in client and article path segments` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 96 | `rejects articles missing required content or provenance fields` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 108 | `rejects damaged JSON, missing markdown, and mismatched markdown` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 124 | `reads markdown checked out with Windows CRLF line endings` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: deep-equal |
| 136 | `ignores temporary and non-JSON files while listing` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal |
| 145 | `recovers a complete prior article after an interrupted two-file update` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 167 | `rejects generated client directories that resolve outside generated` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: throws/rejects |
| 188 | `normalizes a legacy single research id without manufacturing snapshots` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 210 | `accepts an IPC-roundtripped legacy article with matching singular and plural research ids` | — | `migration`、`ipc`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 229 | `rejects inconsistent singular and plural research ids without snapshots` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 239 | `requires new research ids and snapshots to correspond` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 248 | `persists and validates explicit material and template provenance` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 268 | `reviews an article in its existing customer directory without changing creation metadata` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 279 | `rejects mixed legacy and new research metadata instead of dropping new ids` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 296 | `rejects legacy metadata that already contains research snapshots` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 305 | `moves the JSON and Markdown pair into the trash and restores the pair` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 333 | `rolls back both source files when the paired trash move fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 363 | `rejects an unsafe or conflicting trash path without changing the article` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: deep-equal + throws/rejects |

### `tests/article-submission-eligibility.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 20 | `allows a complete generated article without a review click` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 25 | `uses the same policy for saved articles and returns stable Chinese reason codes` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 32 | `blocks incomplete provenance instead of manufacturing a source` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | — |

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

### `tests/ci-workflow-contract.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 15 | `root CI workflow has the required local-layout command contracts` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定 | 文件 fixture: readFileSync :: equal + match |

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
| 158 | `marks a real batch failed when article lookup fails before task claim` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createContentGenerationBatchService :: equal |
| 198 | `reads batch-generation materials through a logical client id` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createContentGenerationBatchService + 文件 fixture: writeFileSync :: deep-equal |
| 222 | `previews client by template tasks and excludes clients missing either source gate` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 231 | `returns an accepted running snapshot before a delayed run completes and rejects a second active run` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 253 | `revalidates sources, reads them at task start, saves generated provenance, and marks the task succeeded` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 267 | `treats only article-not-found reads as missing and never generates after a corrupt read` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 311 | `does not auto-run persisted work after service construction and requires confirmation for config changes` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 322 | `persists safe state events and exposes pause, resume, stop, retry, get, and list operations` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 345 | `returns one ordered runtime snapshot with the selected persisted batch` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 358 | `previews and confirms permanent cancellation of pending tasks` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

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

### `tests/content-metadata-migration.test.js`

- 测试声明数：**16**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 35 | `dry-run reports a version write without modifying the workspace` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot :: equal + deep-equal |
| 45 | `keeps duplicate, missing, corrupt and directory conflicts in a repair report` | — | `migration` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: truthiness |
| 59 | `executes atomically with an independent backup and rolls back byte-for-byte` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + deep-equal + truthiness |
| 71 | `scans generated articles when clients root is absent` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: equal + deep-equal + truthiness |
| 81 | `rejects a tampered backup before touching the workspace` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot :: deep-equal + throws/rejects |
| 92 | `restores the complete workspace after first, middle, and last staging write failures` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: deep-equal + throws/rejects + truthiness |
| 107 | `makes repeated execute explicit only while the workspace matches the committed result` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot :: equal + deep-equal + throws/rejects |
| 118 | `does not treat a changed committed workspace as an execute no-op` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: throws/rejects |
| 128 | `rejects malformed manifests and backup extras before rollback mutation` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: deep-equal + throws/rejects |
| 142 | `requires explicit confirmation and disjoint absolute paths for execute` | — | `migration` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | 工作区 fixture: workspaceRoot :: throws/rejects |
| 150 | `recovers a durable COMMITTING transaction when the process stops between directory renames` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + throws/rejects |
| 167 | `keeps the verified new workspace when old-root cleanup partially fails and recover finishes cleanup` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + throws/rejects |
| 186 | `recovers rollback after the restore switch is interrupted` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + throws/rejects |
| 209 | `rejects a staging root symlink before recovery can install it` | — | `migration`、`security` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + throws/rejects |
| 226 | `requires explicit confirmation before retrying a NEEDS_REPAIR recovery` | — | `migration` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + throws/rejects |
| 244 | `fails closed when an installed workspace has residual staging evidence` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + throws/rejects |

### `tests/content-store.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 5 | `returns closed 0/1/many GenerationTaskId results without selecting a candidate` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createContentStore :: equal + deep-equal |
| 14 | `indexes 5000 articles through one client pass` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createContentStore :: equal |

### `tests/content-submission-ipc.test.js`

- 测试声明数：**7**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 3 | `requires confirmed true and never accepts renderer paths` | — | `renderer`、`ipc` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 10 | `exposes current-client submission batch history without renderer paths` | — | `renderer`、`ipc`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 24 | `forwards only the preview action plan token for batch cancellation` | — | `ipc`、`security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 41 | `rejects a content submission batch without explicit account profile bindings` | — | `ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal |
| 49 | `passes an optional media resource id but continues rejecting renderer paths` | — | `renderer`、`ipc`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: equal + deep-equal |
| 67 | `exposes reconciliation cleanup previews and keeps queue paths out of the renderer response` | — | `renderer`、`ipc`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 83 | `keeps residue cleanup counts and reason codes while stripping filesystem fields` | — | `ipc` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: deep-equal |

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
| 292 | `keeps legacy research, article, migration, submission, and media surfaces in the package boundary` | — | `packaging`、`migration`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | — |
| 307 | `declares new content runtime files and renderer build as alpha package requirements` | — | `renderer`、`packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 328 | `declares the isolated packaged DOCX verifier and Mammoth license` | — | `packaging` | 文档文本提取与空/损坏输入错误语义保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 337 | `declares the bundled Playwright runtime and isolated verifier` | — | `packaging` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 366 | `excludes every private content and application configuration boundary` | — | `packaging`、`security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 393 | `does not package the one-shot content library migration tool` | — | `packaging`、`migration` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 398 | `rejects new private content and AI provider state in an app directory` | — | `packaging` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: truthiness |
| 438 | `documents the new workspace boundaries and generation operations without workspace AI assignments` | — | `packaging`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>文档文本提取与空/损坏输入错误语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 454 | `does not create runtime or business services before workspace bootstrap is ready` | — | `packaging`、`store` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 474 | `keeps every non-ready bootstrap state free of runtime and business initialization` | — | `packaging` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 486 | `fails closed when workspace bootstrap throws and activate does not create a window` | — | `packaging`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 499 | `fails closed when runtime initialization throws` | — | `packaging` | 内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspacePath :: equal |
| 512 | `initializes ready runtime after bootstrap and injects protected runtime dependencies` | — | `packaging`、`security` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspacePath :: equal + match |
| 520 | `wraps shell.openPath failures with a stable safe error` | — | `packaging` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 527 | `disposes the current runtime once before relaunch and tolerates relaunch without runtime` | — | `packaging` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspacePath :: equal + match |
| 538 | `exposes only the workspace bootstrap API and forwards token-only confirmations` | — | `packaging`、`security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 574 | `does not retain a default Documents or cwd workspace fallback` | — | `packaging`、`store` | 内容生成来源、模板与输入选择保持可追溯<br>文档文本提取与空/损坏输入错误语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 581 | `loads the React build from the packaged app files` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |
| 588 | `ships the read-only builtin content template resources` | — | `packaging`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>资源 DTO、分页与外部数据归一化保持稳定 | — |
| 601 | `configures a writable runtime workspace before IPC registration` | — | `packaging`、`ipc`、`store` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot :: truthiness |
| 608 | `excludes private runtime data from alpha package config` | — | `packaging`、`store` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致<br>配置持久化、默认值与环境来源保持明确 | — |
| 616 | `declares every Doubao workspace boundary without excluding runtime code` | — | `packaging`、`security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 640 | `rejects private data in app-owned paths` | — | `packaging` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal + match |
| 674 | `ignores private-looking files inside packaged node_modules dependencies` | — | `packaging` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: match |
| 696 | `packages scripts/config.js because runtime modules require it` | — | `packaging`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 709 | `does not package retired publication ledger writers or scripts` | — | `packaging`、`store` | 发布状态、重复保护与尝试历史保持一致<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 714 | `initializes runtime environment before loading config-dependent services` | — | `packaging`、`store` | IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致<br>配置持久化、默认值与环境来源保持明确 | — |
| 727 | `checks the Doubao service source assembly contract` | — | `packaging` | 平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 735 | `waits for Doubao disposal before quitting and does not re-enter the quit guard` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 764 | `continues runtime disposal and quits when either unsubscribe throws` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 780 | `prevents concurrent before-quit events until the shared disposal completes` | — | `packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 804 | `exposes Doubao commands and a removable queue-state listener` | — | `packaging`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/desktop-task-service.test.js`

- 测试声明数：**7**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `passes complete storage paths to platform-submit workers and keeps worker config portable` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: fakeFork :: equal + deep-equal |
| 49 | `derives worker directories from explicit environment paths` | — | `domain` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 75 | `closes every platform session with the resolved bundled Node and CLI` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 临时目录: mkdtempSync + store/service stub: fakeFork + 文件 fixture: writeFileSync :: equal + deep-equal + match |
| 121 | `snapshots the Hepan interval once when a platform batch starts` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: fakeFork :: equal |
| 159 | `returns a distinct progress watchdog error instead of a fixed batch timeout` | — | `store` | IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: createDesktopTaskService :: equal |
| 176 | `keeps a safe run snapshot available while the renderer is absent` | — | `renderer` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + store/service stub: fakeFork :: equal |
| 214 | `rejects stale, oversized, and secret-bearing worker envelopes` | — | `domain` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: createDesktopTaskService :: equal |

### `tests/desktop-workbench-flow.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `loads the React production renderer from the packaged dist entry` | — | `renderer`、`packaging` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 21 | `keeps media, platform, order, and content workbenches on the React app surface` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 36 | `keeps platform batch selection until explicit confirmation` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | — |

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
| 556 | `writes a structured diagnostic summary without an original screenshot` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime + 文件 fixture: readFileSync :: equal + throws/rejects + match |
| 571 | `times out after 120 seconds when an answer never becomes complete` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: throws/rejects + truthiness |
| 587 | `does not accept an answer that cannot be scoped to the requested question` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: throws/rejects |
| 602 | `stops on a challenge page and captures a structured diagnostic` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime + 文件 fixture: readFileSync :: equal + throws/rejects |
| 619 | `passes the explicit default profileId to the Playwright session` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 634 | `uses an injected profile directory when creating the Doubao session` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 649 | `stops on a page error and does not send a question` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime + 文件 fixture: readFileSync :: equal + throws/rejects + match |
| 667 | `keeps at most 20 diagnostic file groups` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: equal + throws/rejects |
| 684 | `JSON-encodes a question in the send action script` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime :: equal + truthiness |

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
| 124 | `does not leave a task pending when article lookup fails before claim` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: fakeStore :: equal + deep-equal |
| 145 | `runs tasks serially, skips succeeded work, and completes the batch` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + deep-equal + truthiness |
| 173 | `validates the reserved concurrency range` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: throws/rejects |
| 185 | `aborts the active task and leaves later tasks pending when stopped` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal |
| 215 | `retries rate limits, network failures, timeouts, and server failures with injected waits` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + deep-equal |
| 235 | `pauses the batch for configuration errors and continues after non-retryable task errors` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | store/service stub: fakeStore :: equal + deep-equal |
| 268 | `pauses the whole batch for missing configuration and invalid models` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | store/service stub: fakeStore :: equal + deep-equal |
| 293 | `repairs a saved article without another AI call and retries failed tasks only` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: fakeStore :: equal + deep-equal |
| 323 | `runs each task once with a validated future concurrency greater than one` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + deep-equal |
| 349 | `keeps one active run per runner and disposes the active request` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + throws/rejects |
| 378 | `keeps the running task alive while cancelling later pending tasks` | — | `store` | 内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + deep-equal |
| 406 | `publishes live status separately from persisted batch status in every snapshot` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal + truthiness |
| 426 | `handles a controllable fifty-task run without duplicate execution after stop and continue` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: fakeStore :: equal |

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
| 25 | `previews and commits 50 successful articles across two clients with one confirmation` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createGenerationSubmissionHandoffService :: equal + deep-equal |
| 62 | `rejects a commit after the batch revision changes` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createGenerationSubmissionHandoffService :: throws/rejects |
| 75 | `blocks duplicate article identities before delegating to the submission service` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createGenerationSubmissionHandoffService :: equal + deep-equal |
| 93 | `does not expose article content or queue paths in the handoff preview` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | store/service stub: createGenerationSubmissionHandoffService :: equal |
| 107 | `rejects a target that is not available for queue import` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createGenerationSubmissionHandoffService :: throws/rejects |

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

- 测试声明数：**9**。
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
| 233 | `reports a post-request failure as an uncertain-safe Python outcome` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/hepan-provider-settings.test.js`

- 测试声明数：**11**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 17 | `accepts only a real Python file, keeps the site fixed and defaults category 121` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + deep-equal + throws/rejects |
| 33 | `validates the publish interval and exposes the safe default` | — | `store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 48 | `reads a valid interval from the environment without exposing secrets` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 63 | `uses bundled vendor dependencies when no custom vendor directory is configured` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal |
| 88 | `checks Python, imports, and login through a temporary cookie file that is always removed` | — | `store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + deep-equal |
| 116 | `recovers only expired, owned Hepan temporary regular files` | — | `store` | 迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + deep-equal |
| 142 | `maps a failed login to a stable error without leaking cookie or temp path` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 162 | `preserves safe warnings and account identity without carrying an error code on success` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + deep-equal |
| 193 | `uses a safe Python error code when the login command exits non-zero` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 215 | `fails the payload self-test before dependency or login checks` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>配置持久化、默认值与环境来源保持明确 | 工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 238 | `renders configured paths as safe status and submits only changed setting fields` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 文件 fixture: readFileSync :: match |

### `tests/hepan-publish-contract.test.js`

- 测试声明数：**9**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 35 | `projects a verified account identity from the read-only login check` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 73 | `reclaims only expired owned payloads after an interrupted worker` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 94 | `passes Markdown/TXT through a random temporary JSON payload and always removes it` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 134 | `keeps DOCX on the --article path and does not create a JSON payload` | — | `security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: writeFileSync :: equal |
| 167 | `maps payload validation failures to stable safe outcomes and cleans after runner errors` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 191 | `keeps local payload runtime, remote rejection, and uncertain outcomes distinct` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: deep-equal |
| 234 | `default runner keeps the payload until an aborted child closes, then cleans up exactly once` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 301 | `default runner waits for a timed-out child to close before uncertain outcome and payload cleanup` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: equal + deep-equal |
| 330 | `default runner abort terminates a real Windows Node child and removes the payload` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal + deep-equal |

### `tests/hepan-python-payload-runtime.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 70 | `runs the payload validator on the supported Python 3.10-3.13 runtime` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 77 | `validates the real Node-generated Markdown and TXT payloads without cookie, image, or network access` | — | `domain` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 文件 fixture: writeFileSync :: equal |
| 116 | `rejects a directory, symlink, missing file, and invalid JSON with safe payload codes` | — | `security` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createSymlinkFixture + 文件 fixture: writeFileSync :: equal + deep-equal + match |
| 149 | `maps a fake-server disconnect after the publish POST to an uncertain-safe outcome` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: writeFileSync :: equal + deep-equal |

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

### `tests/legacy-submission-path-audit.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 18 | `has no current renderer or command-line caller` | — | `renderer`、`migration`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | 文件 fixture: readFileSync :: equal + deep-equal |

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

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 31 | `sends page and pageSize in mediaList requests` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | — |
| 48 | `refuses redirects instead of forwarding the API key and body to another endpoint` | — | `domain` | 客户端知识、问题查询与来源数据保持稳定 | — |

### `tests/media-draft-store.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 22 | `stores multiple selected resources for one article` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 38 | `migrates old single resource drafts` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: deep-equal |
| 53 | `sets one resource on many files without deleting other draft fields` | — | `store` | 资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

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

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 19 | `requires an explicit endpoint and explicit approval for HTTP transport` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createPlatformSettingsService :: equal + throws/rejects |
| 36 | `requires the environment override to explicitly approve HTTP` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 44 | `saves without calling the network and tests balance without replacing the saved config` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定<br>配置持久化、默认值与环境来源保持明确 | store/service stub: createPlatformSettingsService :: equal + deep-equal |
| 60 | `keeps environment credentials read-only and gives clear a stable missing-config runtime error` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | store/service stub: createPlatformSettingsService :: equal + throws/rejects |
| 73 | `resolves a fresh client for each resource operation while one refresh uses one snapshot` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | store/service stub: createMediaResourceService :: equal |

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

### `tests/media-workbench-flow.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `keeps article editing and the shared media pool in the React app` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

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

### `tests/phase-01-architecture.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `phase 1 composition is injected and is not a second production runtime` | — | `domain` | 打包边界、运行时依赖与应用身份保持一致 | — |
| 27 | `phase 1 contracts stay pure while renderer and worker load only shared definitions` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 51 | `two platform fixtures and the fake publisher validate the common contract without remote calls` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/phase-01-domain-contracts.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 6 | `phase 1 identities normalize once, reject unsafe values, and retain nominal kinds` | — | `domain` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 28 | `phase 1 targets are account-aware, stable, and fail closed for legacy records` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 76 | `publisher outcomes require bound evidence and never accept sensitive fields` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 147 | `safe errors and IPC/worker DTOs are versioned closed records` | — | `ipc` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>资源 DTO、分页与外部数据归一化保持稳定 | — |

### `tests/phase-02-architecture.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 17 | `renderer and worker do not import the SQLite write adapter and production runtime does not auto-create it` | — | `renderer` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: readFileSync :: match |

### `tests/phase-02-migration.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 129 | `dry-run fully reads production-shaped publication, batch, sidecar and JSONL inputs without changing their hashes` | — | `migration`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | 工作区 fixture: workspaceRoot :: equal + deep-equal |
| 166 | `synthetic legacy workspace executes, verifies, backs up, restore-verifies, and preserves all mapped relationships` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + deep-equal + throws/rejects |
| 187 | `corrupt, duplicate, unknown-account and missing-remote legacy facts are explicit manual report items` | — | `migration` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: truthiness |
| 234 | `every migration lifecycle fault leaves source and existing target safe, removes temporary database and releases lease` | — | `migration` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot :: equal + deep-equal + throws/rejects |
| 286 | `rename failure cannot overwrite an existing valid target, and post-rename interruption is explicitly rejected on retry` | — | `migration` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + deep-equal + throws/rejects |

### `tests/phase-02-operational-store.test.js`

- 测试声明数：**5**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 26 | `operational store owns an atomic publication outcome and derived recovery` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |
| 49 | `single write owner, duplicate target and sensitive payload fail closed` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + throws/rejects |
| 90 | `backup verifier reads destination and missing or corrupt targets have no side effects` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 108 | `database reopens after close and explicit batch writes stay isolated from legacy files` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + deep-equal + match |
| 139 | `batch claim revision and remote order evidence are transactional` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: throws/rejects |

### `tests/phase-02-runtime-capacity.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 70 | `real child processes enforce runtime writer and migration lease ownership, then recover after graceful and forced exit` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + deep-equal + throws/rejects |
| 130 | `SQLITE_FULL-equivalent commit failure, inaccessible paths and corruption fail closed without partial facts` | — | `domain` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore + 文件 fixture: writeFileSync :: equal + throws/rejects |
| 174 | `500 and 5000 item batch baseline retains claims, revisions, expiry, reopen and indexed claim query` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + throws/rejects + match + truthiness |
| 271 | `10,000 publication baseline retains actionable recovery and closes with a verified database` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |

### `tests/phase-03-account-profile-ipc.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `account profile IPC requires explicit confirmation and never accepts a caller supplied id` | — | `ipc` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal + deep-equal |
| 29 | `account profiles can be queried from the durable operational store` | — | `ipc`、`store` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: deep-equal |

### `tests/phase-03-composition.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `Phase 3 composition owns one OperationalStore writer and releases it on dispose` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal |
| 41 | `restarted composition rebuilds uncertain attention from OperationalStore with stable account identity` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + deep-equal + throws/rejects + truthiness |
| 69 | `attention retry requeues only an existing failed post-processing job without republishing` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal |

### `tests/phase-03-content-account-binding-execution.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `main rejects a renderer account profile that differs from the durable queue binding` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + store/service stub: createPlatformWorkbenchService + 文件 fixture: writeFileSync :: throws/rejects |

### `tests/phase-03-content-batch-store.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `OperationalStore lists queued content batch items with their durable account binding` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |

### `tests/phase-03-content-publication-chain.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 18 | `content queue execution claims and completes its original OperationalStore item` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |
| 46 | `an account verification failure does not claim later selected platform items` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: deep-equal + throws/rejects |
| 94 | `an expired local claim can be reclaimed instead of reporting that the queue is no longer executable` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |

### `tests/phase-03-media-adapter-readonly.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `media adapter returns remote results without importing or writing the legacy order JSON store` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: match |

### `tests/phase-03-media-order-evidence.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `media order evidence is committed with its remote publication outcome` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: deep-equal |

### `tests/phase-03-media-order-projection.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `media order service has no implicit legacy publication ledger factory` | — | `migration`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | 文件 fixture: readFileSync :: match |
| 15 | `media order views use OperationalStore order projections when supplied` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createMediaOrderService :: equal + deep-equal |
| 26 | `OperationalStore media order sync never writes the retired JSONL history` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + store/service stub: createMediaOrderService + 文件 fixture: writeFileSync :: equal |

### `tests/phase-03-media-order-reconcile.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `media order reconciliation commits verified published evidence and rejects weak URLs` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + throws/rejects |

### `tests/phase-03-media-publication-workflow.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 13 | `media publisher emits receipt-bound outcome without an order JSON writer` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 19 | `media submission service creates an OperationalStore batch and delegates each target to PublicationWorkflow` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |
| 37 | `media command preparation is read-only and derives a media target from selected resources` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>资源 DTO、分页与外部数据归一化保持稳定 | 临时目录: mkdtempSync + store/service stub: createPlatformWorkbenchService + 文件 fixture: writeFileSync :: equal + match |

### `tests/phase-03-operational-content-submission.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 15 | `generic content queue lists only account-bound platform targets` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: deep-equal |
| 30 | `production content service stages a generated article for the paid-media workbench` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore + 文件 fixture: readFileSync :: equal + deep-equal |
| 79 | `production content batch persists explicit account binding in OperationalStore and queue sidecar` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore + 文件 fixture: readFileSync :: equal |
| 100 | `cancelling an unclaimed operational content batch removes only its queue copy` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |

### `tests/phase-03-post-processing.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 31 | `archive post-processing waits for every target in its source group and is idempotent after a crash` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore + 文件 fixture: writeFileSync :: equal + deep-equal + throws/rejects |
| 64 | `failed post-processing is attention-visible and is not automatically re-claimed` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |

### `tests/phase-03-publication-history-ipc.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `production publication history reads committed OperationalStore evidence rather than the JSON ledger` | — | `ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + IPC stub: handlers + store/service stub: createOperationalStore :: equal + deep-equal |

### `tests/phase-03-publication-workflow.test.js`

- 测试声明数：**10**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 40 | `PublicationWorkflow durably reserves before publishing and commits an evidence-bound outcome` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 83 | `PublicationWorkflow verifies the selected account before durable intent and publishes only after intent` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 103 | `PublicationWorkflow converts a publisher crash to uncertain and never claims post-processing before outcome persistence` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 138 | `PublicationWorkflow rejects invalid input before writing a recovery intent` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | — |
| 162 | `PublicationWorkflow recovery and reconcile expose only safe manual outcomes` | — | `domain` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定 | — |
| 203 | `PublicationWorkflow keeps a submitted outcome durable but does not archive it` | — | `store` | 发布状态、重复保护与尝试历史保持一致 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |
| 233 | `PublicationWorkflow recovery turns a stranded remote intent into a blocking uncertain record` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + deep-equal + throws/rejects |
| 271 | `PublicationWorkflow rejects a missing or mismatched account profile before reserving` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + throws/rejects |
| 290 | `PublicationWorkflow fails closed when the current account cannot be verified` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + throws/rejects |
| 303 | `outcome transaction failure leaves a durable recovery intent and never starts post-processing` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + deep-equal + throws/rejects |

### `tests/phase-03-publisher-adapter.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 23 | `final Publisher adapter never upgrades weak legacy success to published` | — | `migration` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 40 | `final Publisher adapter preserves a pre-remote rejection as failed` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 60 | `Publisher router keeps a media resource target distinct from a platform target` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定 | — |

### `tests/phase-03-runtime-no-legacy-ledger.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `workspace runtime does not construct or inject the retired JSON publication ledger` | — | `migration`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: match |
| 14 | `production attention IPC has no implicit legacy ledger factory` | — | `migration`、`ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 文件 fixture: readFileSync :: match |
| 19 | `attention is a derived query and has no persistent writer` | — | `migration`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 文件 fixture: readFileSync :: match |
| 26 | `production content intake has no legacy ledger, JSON batch, or export-writer dependency` | — | `migration`、`store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createSubmissionBatchStore + 文件 fixture: readFileSync :: match |

### `tests/phase-03-workbench-readonly.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `platform workbench is a read-only queue and command-preparation boundary` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | store/service stub: createSubmissionBatchStore + 文件 fixture: readFileSync :: equal |

### `tests/phase-03-worker-main-contract.test.js`

- 测试声明数：**9**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `platform worker does not construct the legacy stateful workbench` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: createPlatformWorkbenchService + 文件 fixture: readFileSync :: match |
| 20 | `worker publisher executor returns an adapter outcome without a state writer` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal + deep-equal |
| 46 | `worker publisher executor turns an adapter exception into uncertain` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: deep-equal |
| 67 | `worker publisher executor never invokes the media adapter without main-process settings` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal |
| 80 | `main worker publisher never upgrades an evidence-free worker success` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 91 | `main worker publisher preserves a published outcome only when the remote evidence binds this input` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 101 | `main worker publisher inspects the sole registered task account before publication` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 114 | `main submission service commits the durable queue batch item rather than creating a second batch` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createPublicationSubmissionService :: equal + deep-equal |
| 129 | `main releases an item claim when account verification rejects before remote publication` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createPublicationSubmissionService :: equal + throws/rejects |

### `tests/phase-04-browser-evidence.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `browser adapters do not retain page-wide weak success predicates` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: match |

### `tests/phase-04-hepan-runtime-paths.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `Hepan production resolver chooses an unpacked ordinary script` | — | `domain` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |

### `tests/phase-04-media-transport.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 8 | `media HTTP requires explicit approval at settings and client boundaries` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |

### `tests/phase-04-platform-account-projection.test.js`

- 测试声明数：**4**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 45 | `platform queue projects only its durable account profile id` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: handlers :: equal + deep-equal |
| 62 | `browser platform login commands open and persist a verified session` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | IPC stub: handlers :: deep-equal |
| 94 | `platform login commands fail closed for platforms without browser login` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | IPC stub: handlers :: equal |
| 107 | `platform submission accepts the durable profile mapping and forwards it unchanged` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | IPC stub: handlers :: equal + deep-equal |

### `tests/phase-04-platform-run.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 24 | `PlatformRun rejects a replacement until a remote-started child has terminated and ignores old events` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 55 | `PlatformRun runs cleanup exactly once across stop and terminal completion` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 70 | `PlatformRun gives its launch an immutable identity and abort signal` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 89 | `PlatformRun keeps the watchdog gate closed until its child exits` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 115 | `PlatformRun terminates a short real local child without releasing the gate early` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |
| 134 | `PlatformRun survives 100 stop-start interleavings without accepting an old run` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定 | — |

### `tests/phase-05-handoff-capacity.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 14 | `runs 500 and 5000 tasks through the production file adapter with one identity scan per preview` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + store/service stub: createArticleStore + 文件 fixture: writeFileSync :: equal |

### `tests/phase-05-p1-blockers.test.js`

- 测试声明数：**8**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 93 | `production queue action survives an OperationalStore write failure after file staging` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 120 | `a checkpoint interruption after moving only the main queue file resumes the same operation` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 137 | `external queue mutation after a staged operation remains fail-closed` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: equal |
| 153 | `partial or unexplained absent queue pairs are not treated as completed` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 207 | `retryable active queue operation retries the queue action with the same operationId` | — | `store` | 发布状态、重复保护与尝试历史保持一致 | — |
| 231 | `a queue active operation with a mismatched operationId fails closed` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 247 | `state_applied queue cleanup resumes the same operation without turning removal into repair` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 274 | `state_applied staging tampering and unexpected entries fail closed` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: writeFileSync :: equal |

### `tests/phase-05-production-removal.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 25 | `production removal uses OperationalStore queue facts and cancels before trashing` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal |

### `tests/phase-05-production-seams.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `has exactly one desktop production ArticleStore composition owner` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | store/service stub: createArticleStore :: deep-equal |
| 15 | `does not let IPC assemble content stores or expose physical store APIs` | — | `ipc`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 文件 fixture: readFileSync :: match |
| 21 | `keeps closed identity cardinality and removes generation first-item fallbacks` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 31 | `keeps the ContentStore caller seam free of legacy ArticleStore injection` | — | `migration`、`security`、`store` | 安全边界与敏感信息不泄露<br>迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 51 | `wires ArticleEditor to the tested authoritative session state machine` | — | `renderer`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 64 | `excludes one-shot content metadata and existing migration tools from installed resources` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/phase-05-trash-confirmation.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 16 | `expires at the exact TTL boundary and fails closed for an invalid execution clock` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 27 | `invalidates all same-tombstone confirmations after the first successful delete` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/platform-account-binding-store.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 12 | `platform account bindings persist only platform and opaque fingerprint` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: localStateRoot + store/service stub: createPlatformAccountBindingStore + 文件 fixture: readFileSync :: equal + deep-equal |
| 40 | `unsafe or malformed existing binding state cannot be overwritten` | — | `store` | 安全边界与敏感信息不泄露<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: localStateRoot + store/service stub: createPlatformAccountBindingStore + 文件 fixture: writeFileSync :: equal + throws/rejects |

### `tests/platform-account-inspector.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `platform account inspector binds only a verified remote identity to its explicit profile` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 56 | `platform account inspector fails closed for a missing or platform-mismatched profile` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 94 | `platform account inspector blocks a later remote account change for the same profile` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

### `tests/platform-browser-session-lifecycle.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `loads, starts, saves, and closes a platform session through one seam` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |

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

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 57 | `scans non-media platform queues` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 69 | `scans and resolves platform queues from the injected content input path` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | store/service stub: createPlatformWorkbenchService + 文件 fixture: writeFileSync :: equal + deep-equal |
| 126 | `builds selected article target plan` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 145 | `prepares an account-bound workflow command without writing publication state` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: createPlatformWorkbenchService :: equal |
| 174 | `keeps source-file body when an adapter omits its body field` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createPlatformWorkbenchService :: equal |
| 195 | `reports missing article body before the operational DTO boundary` | — | `security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | store/service stub: createPlatformWorkbenchService + 文件 fixture: writeFileSync :: throws/rejects |

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

### `tests/publication-ipc.test.js`

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 5 | `lists publication history for many articles in one ledger query and strips sensitive aggregate fields` | — | `ipc`、`store` | 发布状态、重复保护与尝试历史保持一致<br>工作区数据、文件事务与内容生命周期保持完整<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal + deep-equal |
| 45 | `rejects renderer path-like publication history input` | — | `renderer`、`ipc`、`security` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: deep-equal |
| 55 | `requires a second-confirmation marker and exposes only safe reconciliation fields` | — | `ipc` | 安全边界与敏感信息不泄露<br>发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定 | IPC stub: handlers :: equal + deep-equal |

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

### `tests/question-store.test.js`

- 测试声明数：**14**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 40 | `creates, updates, lists, toggles, and deletes a stable question` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: readFileSync :: equal + deep-equal |
| 63 | `imports search_query.txt once and rejects normalized duplicates` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>迁移兼容、幂等与恢复语义保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 文件 fixture: writeFileSync :: equal + throws/rejects |
| 72 | `does not create a missing client directory` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 80 | `resolves a logical client id through metadata rather than its directory name` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: equal |
| 88 | `fails closed on duplicate ClientId metadata without writing either candidate` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定 | 文件 fixture: writeFileSync :: equal + throws/rejects |
| 101 | `keeps the old questions file readable when the atomic rename fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 134 | `preserves the atomic operation error when temporary cleanup fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 172 | `throws a temporary cleanup error when the atomic operation succeeds` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 202 | `returns stable errors for invalid paths and question data` | — | `store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createQuestionStore :: throws/rejects |
| 257 | `rejects malformed questions.json with a stable error` | — | `store` | 客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 文件 fixture: writeFileSync :: throws/rejects |
| 278 | `rejects a questions.json file symlink escaping workspace` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |
| 311 | `rejects a search_query.txt file symlink escaping workspace` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects |
| 338 | `rejects a customer directory symlink escaping workspace.clients` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: throws/rejects |
| 363 | `rejects a clients root symlink escaping workspace` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>客户端知识、问题查询与来源数据保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: throws/rejects |

### `tests/react-workbench-regression.test.js`

- 测试声明数：**9**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `gates renderer localStorage fixtures behind an explicit development flag` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |
| 17 | `keeps Settings limited to manual workflow features` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>配置持久化、默认值与环境来源保持明确 | — |
| 23 | `keeps the platforms workbench reachable` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 29 | `keeps renderer APIs free of mock article persistence` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: mockData :: equal + truthiness |
| 43 | `exposes platform commands through preload` | — | `renderer`、`ipc` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | 文件 fixture: readFileSync :: truthiness |
| 49 | `exposes browser login controls for platform accounts` | — | `renderer` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 56 | `shares the structured IPC response envelope` | — | `renderer`、`ipc` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 文件 fixture: readFileSync :: truthiness |
| 65 | `uses the complete main-process platform status shape` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 文件 fixture: readFileSync :: equal + match + truthiness |
| 80 | `type-checks before building the renderer` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | 文件 fixture: readFileSync :: equal + truthiness |

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
| 192 | `provides a single and batch segmented control without losing the article editor` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 200 | `separates the new-batch wizard from persisted batch monitoring` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 210 | `rehydrates a persisted batch into monitoring and offers a new wizard entry for terminal batches` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 221 | `uses runtime state only when it belongs to the displayed batch` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 229 | `does not let initial idle hydration overwrite a matching runtime batch state` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 238 | `keeps command pending separate from the live batch run and does not optimistically mark every command running` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 247 | `offers continuation when failed tasks are the only unfinished work` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 252 | `keeps pause and stop bound to the displayed batch while continuation waits for a non-live snapshot` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 262 | `rehydrates the same live counts and status after returning to the page` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |
| 271 | `exposes cancelled counts and a preview-confirmed pending cancellation action` | — | `renderer`、`store` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | — |

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

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 29 | `switches from a queued client to another client through the real Renderer` | — | `renderer`、`store` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>客户端知识、问题查询与来源数据保持稳定 | 工作区 fixture: workspacePath + 浏览器/Renderer fixture: browser.newPage :: equal + deep-equal |

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
| 11 | `keeps initial loading silent and makes manual refresh feedback transient` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 24 | `separates workspace, article, and batch refresh intents` | — | `renderer`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |
| 49 | `keeps content-source invalidation separate from customer and template rescans` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | — |

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
| 15 | `closes the modal after a successful handoff and leaves a non-modal summary` | — | `renderer` | 发布状态、重复保护与尝试历史保持一致<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspacePath + 浏览器/Renderer fixture: browser.newPage :: equal + deep-equal + match |

### `tests/renderer-harness-lock.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 11 | `renderer build lock reclaims only old locks without a live owner` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal |

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

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=是；浏览器启动=是；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 109 | `(动态测试名，需人工确认)` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定 | — |

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

### `tests/renderer-workbench-controller-seams.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 10 | `keeps platform selection, request identity, and terminal refresh in a renderer controller` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 23 | `loads article-management snapshots through the production controller seam` | — | `renderer` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | — |

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

- 测试声明数：**3**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 5 | `exposes safe capability diagnostics and a browser self-check IPC boundary` | — | `ipc`、`security` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal |
| 29 | `exposes bounded runtime lifecycle events through the diagnostics IPC` | — | `ipc` | 安全边界与敏感信息不泄露<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | IPC stub: handlers :: deep-equal |
| 39 | `forwards the updated browser capability returned by a successful self-check` | — | `ipc` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | IPC stub: handlers :: equal |

### `tests/runtime-diagnostics.test.js`

- 测试声明数：**16**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `retains safe runtime diagnostic events reported by lifecycle services` | — | `domain` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal |
| 55 | `keeps a configured browser channel in not_checked and isolates optional Hepan` | — | `ipc`、`store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal |
| 74 | `retains a successful browser smoke result for the next diagnostic read` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal |
| 93 | `recovers from a failed browser smoke and resets when the channel changes` | — | `ipc` | 迁移兼容、幂等与恢复语义保持稳定<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal + throws/rejects |
| 121 | `prefers application browser configuration and reports independent capability failures` | — | `store` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>内容生成来源、模板与输入选择保持可追溯<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService + 文件 fixture: writeFileSync :: equal + deep-equal + truthiness |
| 132 | `resolves bundled Node and CLI without PATH or external overrides` | — | `security` | 安全边界与敏感信息不泄露<br>打包边界、运行时依赖与应用身份保持一致 | 工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService + 文件 fixture: writeFileSync :: equal |
| 154 | `exposes an async runtime while keeping Doubao on its own session paths` | — | `domain` | 安全边界与敏感信息不泄露<br>Renderer 用户流程、状态刷新与布局行为保持稳定<br>平台适配、配置隔离与远端结果分类保持稳定 | — |
| 166 | `accepts an explicit Doubao profileId while defaulting to the application profile` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 176 | `invokes execFile with structured Playwright arguments and the session environment` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 219 | `resolves a Windows npm wrapper to the Playwright JavaScript entrypoint` | — | `domain` | 打包边界、运行时依赖与应用身份保持一致 | 临时目录: makeTemporaryDirectory + 文件 fixture: writeFileSync :: equal + deep-equal + match |
| 244 | `passes evaluate timeoutMs through to the runtime process` | — | `domain` | 打包边界、运行时依赖与应用身份保持一致 | 临时目录: makeTemporaryDirectory :: equal + deep-equal |
| 260 | `maps an execFile timeout to a stable runtime error` | — | `domain` | 工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 282 | `maps browser session-not-open diagnostics from stdout or stderr` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 311 | `does not classify a session diagnostic from the source error message alone` | — | `domain` | Renderer 用户流程、状态刷新与布局行为保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 327 | `maps a failed execFile command without hiding its diagnostics` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 346 | `keeps the legacy synchronous pwCmd, pwRun, and runCode APIs working` | — | `migration` | 迁移兼容、幂等与恢复语义保持稳定<br>打包边界、运行时依赖与应用身份保持一致 | store/service stub: fakeExecSync :: equal + deep-equal + match |

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
| 42 | `registers safe usage and cache cleanup IPC commands` | — | `ipc` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>IPC 契约、DTO 过滤与主进程边界保持稳定 | IPC stub: handlers :: equal + deep-equal |
| 78 | `reports usage and cleans caches without following file or directory links` | — | `domain` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createStorageMaintenanceService :: equal |
| 139 | `removes only expired or over-limit whitelisted files and preserves protected data` | — | `security` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createStorageMaintenanceService :: equal |
| 209 | `blocks cleanup while any collection, generation, or submission task is active` | — | `domain` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createStorageMaintenanceService :: equal |
| 233 | `blocks cleanup when the activity provider returns a direct running state` | — | `domain` | 平台适配、配置隔离与远端结果分类保持稳定<br>内容生成来源、模板与输入选择保持可追溯 | store/service stub: createStorageMaintenanceService :: equal |
| 256 | `continues after one delete fails and makes repeated cleanup safe` | — | `domain` | 安全边界与敏感信息不泄露<br>内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整 | store/service stub: createStorageMaintenanceService :: equal |

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

### `tests/submission-query-interface.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 5 | `submission query reads batches once and shares its snapshot with reconciliation and planning` | — | `store` | 发布状态、重复保护与尝试历史保持一致 | — |
| 25 | `submission query formally owns pair inspection, archive failures, and action evaluation` | — | `store` | 发布状态、重复保护与尝试历史保持一致<br>内容生成来源、模板与输入选择保持可追溯 | — |

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

### `tests/test-discovery-contract.test.js`

- 测试声明数：**1**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=是。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 9 | `default test discovery collects both JavaScript module extensions` | — | `domain` | 配置持久化、默认值与环境来源保持明确 | 文件 fixture: readFileSync :: equal + deep-equal + match + truthiness |

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

### `tests/workspace-manifest.test.js`

- 测试声明数：**2**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 16 | `workspace manifest reports only migration inputs as relative hashes` | — | `migration`、`store` | 迁移兼容、幂等与恢复语义保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: equal + deep-equal + match + truthiness |
| 95 | `workspace manifest CLI is read-only and emits no absolute workspace path` | — | `security`、`store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync :: equal + deep-equal + match |

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

### `tests/workspace-runtime-lifecycle.test.js`

- 测试声明数：**6**。
- 未采集运行时间：**待采集**（本脚本未执行该文件）。
- 静态信号：Renderer build=否；浏览器启动=否；读取生产源码=否。

| 行 | 测试名 | 静态标记 | 层级 | 主要不变量 | fixture/断言签名 |
| ---: | --- | --- | --- | --- | --- |
| 46 | `workspace invalidation owns reason-to-scope policy and emits safe monotonic payloads` | — | `store` | 安全边界与敏感信息不泄露<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 60 | `maps every production workspace mutation reason explicitly without a broad fallback` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | — |
| 99 | `workspace runtime validates lifecycle dependencies before a workspace can start` | — | `store` | 工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | IPC stub: ipcMain :: throws/rejects |
| 104 | `workspace runtime gives the Hepan task service its configured platform settings` | — | `store` | 平台适配、配置隔离与远端结果分类保持稳定<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 工作区 fixture: workspacePath + IPC stub: ipcMain + store/service stub: createDesktopTaskService + 文件 fixture: writeFileSync :: equal + truthiness |
| 152 | `disposes services already created when a middle workspace factory fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>工作区数据、文件事务与内容生命周期保持完整<br>打包边界、运行时依赖与应用身份保持一致 | 临时目录: mkdtempSync + 工作区 fixture: workspacePath + store/service stub: createDesktopTaskService :: equal + deep-equal + throws/rejects |
| 176 | `unsubscribes and disposes all started workspace resources when subscription setup fails` | — | `store` | 内容生成来源、模板与输入选择保持可追溯<br>资源 DTO、分页与外部数据归一化保持稳定<br>工作区数据、文件事务与内容生命周期保持完整 | 临时目录: mkdtempSync + 工作区 fixture: workspacePath + store/service stub: createDesktopTaskService :: equal + deep-equal + throws/rejects |

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

### `文件 fixture: readFileSync :: match`（25 项）

- `tests/content-library-migration.test.js:284` — excludes the one-shot migration script from the desktop package
- `tests/hepan-provider-settings.test.js:238` — renders configured paths as safe status and submits only changed setting fields
- `tests/j4125-auth-contract.test.js:7` — contains an isolated HTTPS auth service contract without business data
- `tests/phase-02-architecture.test.js:17` — renderer and worker do not import the SQLite write adapter and production runtime does not auto-create it
- `tests/phase-03-media-adapter-readonly.test.js:8` — media adapter returns remote results without importing or writing the legacy order JSON store
- `tests/phase-03-media-order-projection.test.js:10` — media order service has no implicit legacy publication ledger factory
- `tests/phase-03-runtime-no-legacy-ledger.test.js:8` — workspace runtime does not construct or inject the retired JSON publication ledger
- `tests/phase-03-runtime-no-legacy-ledger.test.js:14` — production attention IPC has no implicit legacy ledger factory
- `tests/phase-03-runtime-no-legacy-ledger.test.js:19` — attention is a derived query and has no persistent writer
- `tests/phase-04-browser-evidence.test.js:8` — browser adapters do not retain page-wide weak success predicates
- `tests/phase-05-production-seams.test.js:15` — does not let IPC assemble content stores or expose physical store APIs
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
- `tests/renderer-settings.test.js:15` — exposes storage maintenance and the safe browser self-check bridge
- `tests/renderer-settings.test.js:29` — keeps cache cleanup guarded while exposing usage categories
- `tests/renderer-settings.test.js:42` — organizes provider and system settings behind responsive navigation
- `tests/renderer-time-format.test.js:26` — is used by the order history view for persisted timestamps

### `文件 fixture: writeFileSync :: equal + deep-equal`（16 项）

- `tests/article-store.test.js:145` — recovers a complete prior article after an interrupted two-file update
- `tests/article-store.test.js:188` — normalizes a legacy single research id without manufacturing snapshots
- `tests/article-store.test.js:210` — accepts an IPC-roundtripped legacy article with matching singular and plural research ids
- `tests/hepan-publish-contract.test.js:73` — reclaims only expired owned payloads after an interrupted worker
- `tests/hepan-publish-contract.test.js:94` — passes Markdown/TXT through a random temporary JSON payload and always removes it
- `tests/hepan-publish-contract.test.js:167` — maps payload validation failures to stable safe outcomes and cleans after runner errors
- `tests/hepan-publish-contract.test.js:234` — default runner keeps the payload until an aborted child closes, then cleans up exactly once
- `tests/hepan-publish-contract.test.js:301` — default runner waits for a timed-out child to close before uncertain outcome and payload cleanup
- `tests/hepan-publish-contract.test.js:330` — default runner abort terminates a real Windows Node child and removes the payload
- `tests/hepan-python-payload-runtime.test.js:149` — maps a fake-server disconnect after the publish POST to an uncertain-safe outcome
- `tests/legacy-migration.test.js:84` — matches only the exact search query after removing a UTF-8 BOM
- `tests/workspace-bootstrap-service.test.js:263` — confirms existing workspaces without changing their contents
- `tests/workspace-bootstrap-service.test.js:295` — rejects every existing AutoPublish directory link before initialization
- `tests/workspace-bootstrap-service.test.js:336` — rejects an existing non-directory AutoPublish path before initialization
- `tests/workspace-bootstrap-service.test.js:383` — returns a stable initialization error without saving or relaunching
- `tests/workspace-bootstrap-service.test.js:405` — rolls back initialized directories and marker when location persistence fails

### `文件 fixture: writeFileSync :: throws/rejects`（12 项）

- `tests/article-store.test.js:108` — rejects damaged JSON, missing markdown, and mismatched markdown
- `tests/client-knowledge.test.js:175` — does not use the workspace as clients root when clients is missing
- `tests/client-knowledge.test.js:186` — rejects a clients root that is a regular file
- `tests/client-knowledge.test.js:228` — rejects a client symlink resolving outside workspace.clients
- `tests/client-knowledge.test.js:287` — rejects missing and empty queries
- `tests/hepan-article-source.test.js:68` — returns stable article errors for invalid extension, empty values, invalid UTF-8, and oversized input
- `tests/question-store.test.js:257` — rejects malformed questions.json with a stable error
- `tests/research-store.test.js:75` — rejects invalid JSON and JSON arrays
- `tests/template-store.test.js:44` — rejects duplicate template names within one platform
- `tests/template-store.test.js:50` — rejects duplicate front matter keys
- `tests/template-store.test.js:55` — rejects unsafe front matter template names
- `tests/template-store.test.js:63` — rejects missing front matter, required fields, platform mismatches, and empty bodies

### `IPC stub: handlers :: deep-equal`（12 项）

- `tests/ai-content-ipc.test.js:60` — exposes safe removal transaction query and retry handlers
- `tests/content-submission-ipc.test.js:3` — requires confirmed true and never accepts renderer paths
- `tests/content-submission-ipc.test.js:10` — exposes current-client submission batch history without renderer paths
- `tests/content-submission-ipc.test.js:24` — forwards only the preview action plan token for batch cancellation
- `tests/content-submission-ipc.test.js:67` — exposes reconciliation cleanup previews and keeps queue paths out of the renderer response
- `tests/content-submission-ipc.test.js:83` — keeps residue cleanup counts and reason codes while stripping filesystem fields
- `tests/desktop-ipc-response.test.js:15` — wraps async handlers
- `tests/doubao-collection-ipc.test.js:57` — registers the complete public channel surface
- `tests/doubao-collection-ipc.test.js:62` — routes batch preview and prepared start through validated public inputs
- `tests/phase-04-platform-account-projection.test.js:62` — browser platform login commands open and persist a verified session
- `tests/publication-ipc.test.js:45` — rejects renderer path-like publication history input
- `tests/runtime-diagnostics-ipc.test.js:29` — exposes bounded runtime lifecycle events through the diagnostics IPC

### `文件 fixture: writeFileSync :: equal`（10 项）

- `tests/hepan-publish-contract.test.js:134` — keeps DOCX on the --article path and does not create a JSON payload
- `tests/hepan-python-payload-runtime.test.js:77` — validates the real Node-generated Markdown and TXT payloads without cookie, image, or network access
- `tests/phase-05-p1-blockers.test.js:137` — external queue mutation after a staged operation remains fail-closed
- `tests/phase-05-p1-blockers.test.js:274` — state_applied staging tampering and unexpected entries fail closed
- `tests/question-store.test.js:80` — resolves a logical client id through metadata rather than its directory name
- `tests/workspace-bootstrap-service.test.js:219` — classifies empty, existing, and nonempty directories into pending selections
- `tests/workspace-bootstrap-service.test.js:279` — confirms nonempty directories without changing unrelated files
- `tests/workspace-bootstrap-service.test.js:426` — refuses to remove a marker replaced before rollback and reports cleanup failure
- `tests/workspace-bootstrap-service.test.js:448` — detects marker modification immediately after the write and preserves it
- `tests/workspace-bootstrap-service.test.js:496` — keeps the first directory identity when replacement races with marker failure

### `store/service stub: fakeStore :: equal + deep-equal`（10 项）

- `tests/article-review-service.test.js:58` — reviews a cross-client selection and reports incomplete source provenance
- `tests/article-review-service.test.js:107` — is idempotent for saved articles and does not change review timestamps
- `tests/generation-batch-runner.test.js:98` — passes the complete task to article lookup before generating a pending task
- `tests/generation-batch-runner.test.js:124` — does not leave a task pending when article lookup fails before claim
- `tests/generation-batch-runner.test.js:215` — retries rate limits, network failures, timeouts, and server failures with injected waits
- `tests/generation-batch-runner.test.js:235` — pauses the batch for configuration errors and continues after non-retryable task errors
- `tests/generation-batch-runner.test.js:268` — pauses the whole batch for missing configuration and invalid models
- `tests/generation-batch-runner.test.js:293` — repairs a saved article without another AI call and retries failed tasks only
- `tests/generation-batch-runner.test.js:323` — runs each task once with a validated future concurrency greater than one
- `tests/generation-batch-runner.test.js:378` — keeps the running task alive while cancelling later pending tasks

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal`（8 项）

- `tests/phase-03-content-batch-store.test.js:10` — OperationalStore lists queued content batch items with their durable account binding
- `tests/phase-03-content-publication-chain.test.js:18` — content queue execution claims and completes its original OperationalStore item
- `tests/phase-03-content-publication-chain.test.js:94` — an expired local claim can be reclaimed instead of reporting that the queue is no longer executable
- `tests/phase-03-media-publication-workflow.test.js:19` — media submission service creates an OperationalStore batch and delegates each target to PublicationWorkflow
- `tests/phase-03-operational-content-submission.test.js:100` — cancelling an unclaimed operational content batch removes only its queue copy
- `tests/phase-03-post-processing.test.js:64` — failed post-processing is attention-visible and is not automatically re-claimed
- `tests/phase-03-publication-workflow.test.js:203` — PublicationWorkflow keeps a submitted outcome durable but does not archive it
- `tests/phase-05-production-removal.test.js:25` — production removal uses OperationalStore queue facts and cancels before trashing

### `IPC stub: handlers :: equal + deep-equal`（8 项）

- `tests/auth-ipc-boundary.test.js:7` — exposes only auth operations and broadcasts state changes
- `tests/content-submission-ipc.test.js:49` — passes an optional media resource id but continues rejecting renderer paths
- `tests/phase-03-account-profile-ipc.test.js:11` — account profile IPC requires explicit confirmation and never accepts a caller supplied id
- `tests/phase-04-platform-account-projection.test.js:45` — platform queue projects only its durable account profile id
- `tests/phase-04-platform-account-projection.test.js:107` — platform submission accepts the durable profile mapping and forwards it unchanged
- `tests/publication-ipc.test.js:5` — lists publication history for many articles in one ledger query and strips sensitive aggregate fields
- `tests/publication-ipc.test.js:55` — requires a second-confirmation marker and exposes only safe reconciliation fields
- `tests/storage-maintenance-service.test.js:42` — registers safe usage and cache cleanup IPC commands

### `临时目录: mkdtempSync + 文件 fixture: writeFileSync :: throws/rejects`（7 项）

- `tests/client-knowledge.test.js:204` — rejects client metadata symlinks resolving outside the client directory
- `tests/client-knowledge.test.js:238` — rejects a clients root symlink resolving outside the workspace
- `tests/client-knowledge.test.js:262` — rejects a search query file link resolving outside the client directory
- `tests/question-store.test.js:278` — rejects a questions.json file symlink escaping workspace
- `tests/question-store.test.js:311` — rejects a search_query.txt file symlink escaping workspace
- `tests/runtime-tools.test.js:63` — rejects a downloaded archive whose checksum differs from the manifest
- `tests/template-store.test.js:86` — rejects a platform symlink resolving outside the real templates directory

### `工作区 fixture: workspaceRoot + 文件 fixture: readFileSync :: equal + throws/rejects`（6 项）

- `tests/content-metadata-migration.test.js:150` — recovers a durable COMMITTING transaction when the process stops between directory renames
- `tests/content-metadata-migration.test.js:167` — keeps the verified new workspace when old-root cleanup partially fails and recover finishes cleanup
- `tests/content-metadata-migration.test.js:186` — recovers rollback after the restore switch is interrupted
- `tests/content-metadata-migration.test.js:209` — rejects a staging root symlink before recovery can install it
- `tests/content-metadata-migration.test.js:226` — requires explicit confirmation before retrying a NEEDS_REPAIR recovery
- `tests/content-metadata-migration.test.js:244` — fails closed when an installed workspace has residual staging evidence

### `文件 fixture: writeFileSync :: deep-equal`（6 项）

- `tests/article-store.test.js:63` — lists direct article JSON records by createdAt descending without edit reordering
- `tests/article-store.test.js:136` — ignores temporary and non-JSON files while listing
- `tests/hepan-article-source.test.js:38` — uses the first non-empty TXT line as title and preserves safe paragraphs
- `tests/hepan-article-source.test.js:55` — scans supported ordinary files while excluding sidecars, temporary files, and symlinks
- `tests/hepan-publish-contract.test.js:191` — keeps local payload runtime, remote rejection, and uncertain outcomes distinct
- `tests/media-draft-store.test.js:38` — migrates old single resource drafts

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createArticleRemovalTransactionStore + 文件 fixture: writeFileSync :: equal`（5 项）

- `tests/article-removal-transaction-store.test.js:8` — reclaims a stale compare-and-update lock left by a killed process
- `tests/article-removal-transaction-store.test.js:18` — does not reclaim an aged lock whose recorded owner is still alive
- `tests/article-removal-transaction-store.test.js:28` — fails closed for aged locks with unknown owner metadata
- `tests/article-removal-transaction-store.test.js:40` — fails closed for an aged corrupt lock
- `tests/article-removal-transaction-store.test.js:52` — does not unlink a replacement lock during stale-lock ABA recovery

### `IPC stub: ipcMain + store/service stub: fakeIpc :: equal + deep-equal`（5 项）

- `tests/content-generation-batch-ipc.test.js:28` — returns only allowlisted error code and message without provider details
- `tests/content-generation-batch-ipc.test.js:37` — returns safe template identity details for invalid batch templates
- `tests/content-generation-batch-ipc.test.js:65` — subscribes and unsubscribes renderer state listeners
- `tests/generation-submission-handoff-ipc.test.js:11` — rejects renderer paths and unknown fields before invoking the service
- `tests/generation-submission-handoff-ipc.test.js:22` — returns only the allowlisted safe error for a stale preview

### `store/service stub: createArticleRemovalService :: equal`（5 项）

- `tests/article-removal-service.test.js:52` — claims a newly persisted transaction before its first destructive action
- `tests/article-removal-service.test.js:60` — fences a runner whose lease expires during an action before it can move an article
- `tests/article-removal-service.test.js:127` — does not duplicate an article move when another runner takes over during the move
- `tests/article-removal-service.test.js:138` — reconciles an article active operation after its trash postcondition is proven
- `tests/article-removal-service.test.js:206` — a persistent claim permits only one runner to execute a transaction

### `store/service stub: createStorageMaintenanceService :: equal`（5 项）

- `tests/storage-maintenance-service.test.js:78` — reports usage and cleans caches without following file or directory links
- `tests/storage-maintenance-service.test.js:139` — removes only expired or over-limit whitelisted files and preserves protected data
- `tests/storage-maintenance-service.test.js:209` — blocks cleanup while any collection, generation, or submission task is active
- `tests/storage-maintenance-service.test.js:233` — blocks cleanup when the activity provider returns a direct running state
- `tests/storage-maintenance-service.test.js:256` — continues after one delete fails and makes repeated cleanup safe

### `工作区 fixture: workspacePath :: equal`（4 项）

- `tests/desktop-packaging.test.js:499` — fails closed when runtime initialization throws
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

- `tests/article-store.test.js:167` — rejects generated client directories that resolve outside generated
- `tests/question-store.test.js:338` — rejects a customer directory symlink escaping workspace.clients
- `tests/question-store.test.js:363` — rejects a clients root symlink escaping workspace
- `tests/research-store.test.js:90` — rejects unsafe research path segments and linked client directories

### `临时目录: mkdtempSync + 文件 fixture: writeFileSync :: equal`（4 项）

- `tests/batch-workspace-scan.test.js:8` — scans media only from AUTO_PUBLISH_WORKSPACE input
- `tests/phase-03-worker-main-contract.test.js:67` — worker publisher executor never invokes the media adapter without main-process settings
- `tests/renderer-harness-lock.test.js:11` — renderer build lock reclaims only old locks without a live owner
- `tests/runtime-tools.test.js:30` — prepares only regular node.exe and LICENSE files from a verified archive

### `IPC stub: createIpc :: equal + deep-equal`（4 项）

- `tests/ai-content-ipc.test.js:12` — registers the complete thin content IPC surface
- `tests/ai-content-ipc.test.js:41` — returns safe provenance validation errors through the generation IPC boundary
- `tests/ai-provider-ipc.test.js:12` — registers a thin safe configuration boundary
- `tests/ai-provider-ipc.test.js:35` — returns only coded safe errors

### `IPC stub: handlers :: equal`（4 项）

- `tests/content-submission-ipc.test.js:41` — rejects a content submission batch without explicit account profile bindings
- `tests/phase-04-platform-account-projection.test.js:94` — platform login commands fail closed for platforms without browser login
- `tests/runtime-diagnostics-ipc.test.js:5` — exposes safe capability diagnostics and a browser self-check IPC boundary
- `tests/runtime-diagnostics-ipc.test.js:39` — forwards the updated browser capability returned by a successful self-check

### `store/service stub: createPlatformSettingsService :: equal + throws/rejects`（4 项）

- `tests/media-provider-settings.test.js:19` — requires an explicit endpoint and explicit approval for HTTP transport
- `tests/media-provider-settings.test.js:60` — keeps environment credentials read-only and gives clear a stable missing-config runtime error
- `tests/platform-settings-service.test.js:45` — gives environment overrides read-only priority and exposes no override secret
- `tests/platform-settings-service.test.js:68` — blocks mutations while platform tasks are running but keeps status readable

### `store/service stub: fakeRuntime :: equal`（4 项）

- `tests/doubao-browser-adapter.test.js:338` — detects when the current Doubao page requires login
- `tests/doubao-browser-adapter.test.js:347` — checks login state without opening a visible page
- `tests/doubao-browser-adapter.test.js:416` — reuses a ready session for collection and reopens after close
- `tests/doubao-browser-adapter.test.js:494` — detects login wording even when the page exposes an input

### `工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + throws/rejects`（3 项）

- `tests/hepan-provider-settings.test.js:142` — maps a failed login to a stable error without leaking cookie or temp path
- `tests/hepan-provider-settings.test.js:193` — uses a safe Python error code when the login command exits non-zero
- `tests/hepan-provider-settings.test.js:215` — fails the payload self-test before dependency or login checks

### `工作区 fixture: workspaceRoot :: equal + deep-equal`（3 项）

- `tests/content-metadata-migration.test.js:35` — dry-run reports a version write without modifying the workspace
- `tests/legacy-migration.test.js:51` — dry-runs against a temporary legacy database without writing output
- `tests/phase-02-migration.test.js:129` — dry-run fully reads production-shaped publication, batch, sidecar and JSONL inputs without changing their hashes

### `工作区 fixture: workspaceRoot :: throws/rejects`（3 项）

- `tests/client-knowledge.test.js:74` — rejects null and non-string workspace roots with a boundary error
- `tests/content-metadata-migration.test.js:142` — requires explicit confirmation and disjoint absolute paths for execute
- `tests/workspace-paths.test.js:120` — requires explicit appRoot and workspaceRoot at every runtime configuration entry point

### `工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + deep-equal + throws/rejects`（3 项）

- `tests/phase-02-migration.test.js:166` — synthetic legacy workspace executes, verifies, backs up, restore-verifies, and preserves all mapped relationships
- `tests/phase-02-migration.test.js:286` — rename failure cannot overwrite an existing valid target, and post-rename interruption is explicitly rejected on retry
- `tests/phase-02-runtime-capacity.test.js:70` — real child processes enforce runtime writer and migration lease ownership, then recover after graceful and forced exit

### `工作区 fixture: workspaceRoot + store/service stub: createResearchStore :: equal + deep-equal`（3 项）

- `tests/legacy-migration.test.js:59` — copies allowed client knowledge and imports matching research and articles
- `tests/legacy-migration.test.js:111` — is idempotent and does not overwrite non-legacy outputs
- `tests/legacy-migration.test.js:210` — skips malformed citation URLs instead of failing the matching research import

### `临时目录: createTempDirectory + 文件 fixture: writeFileSync :: equal`（3 项）

- `tests/workspace-validator.test.js:91` — does not classify a damaged case-variant marker as a nonempty directory
- `tests/workspace-validator.test.js:109` — returns stable invalid errors for missing paths and files
- `tests/workspace-validator.test.js:257` — rejects damaged, unknown-version, and linked markers

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: deep-equal`（3 项）

- `tests/phase-03-account-profile-ipc.test.js:29` — account profiles can be queried from the durable operational store
- `tests/phase-03-media-order-evidence.test.js:10` — media order evidence is committed with its remote publication outcome
- `tests/phase-03-operational-content-submission.test.js:15` — generic content queue lists only account-bound platform targets

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + throws/rejects`（3 项）

- `tests/phase-03-media-order-reconcile.test.js:10` — media order reconciliation commits verified published evidence and rejects weak URLs
- `tests/phase-03-publication-workflow.test.js:271` — PublicationWorkflow rejects a missing or mismatched account profile before reserving
- `tests/phase-03-publication-workflow.test.js:290` — PublicationWorkflow fails closed when the current account cannot be verified

### `临时目录: mkdtempSync + 文件 fixture: writeFileSync :: deep-equal`（3 项）

- `tests/adapter-workspace-injection.test.js:7` — media adapters scan only their injected workspace input without module reload
- `tests/adapter-workspace-injection.test.js:22` — Hepan workspace config overrides inherited global configuration
- `tests/phase-03-worker-main-contract.test.js:46` — worker publisher executor turns an adapter exception into uncertain

### `浏览器/Renderer fixture: browser.newPage :: equal`（3 项）

- `tests/auth-gate.test.js:15` — does not mount the workspace before authentication
- `tests/renderer-platform-queue-refresh-lifecycle.test.js:179` — loads once, stays idle, refreshes manually, and deduplicates terminal revisions
- `tests/renderer-question-editor-session.test.js:90` — opens, closes, restores focus, resets references, and survives client switching

### `文件 fixture: readFileSync :: deep-equal + match`（3 项）

- `tests/application-identity.test.js:9` — uses one stable application name and app id for development and packaging
- `tests/article-store.test.js:44` — writes editable markdown alongside full JSON metadata
- `tests/article-store.test.js:55` — replaces both files when saving an updated article id

### `文件 fixture: readFileSync :: equal + deep-equal`（3 项）

- `tests/legacy-platform-settings-migration.test.js:70` — imports legacy values into encrypted provider stores, removes old runtime secrets, and is idempotent
- `tests/legacy-submission-path-audit.test.js:18` — has no current renderer or command-line caller
- `tests/question-store.test.js:40` — creates, updates, lists, toggles, and deletes a stable question

### `文件 fixture: writeFileSync :: equal + throws/rejects`（3 项）

- `tests/published-archive.test.js:52` — rejects a published archive collision without deleting either existing pair
- `tests/question-store.test.js:63` — imports search_query.txt once and rejects normalized duplicates
- `tests/question-store.test.js:88` — fails closed on duplicate ClientId metadata without writing either candidate

### `IPC stub: ipcRenderer :: match`（3 项）

- `tests/architecture-seams.test.js:56` — business views use domain bridges instead of Electron transport or main-process files
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

- `tests/media-provider-settings.test.js:73` — resolves a fresh client for each resource operation while one refresh uses one snapshot
- `tests/media-resource-service.test.js:60` — pages cached resources with metadata
- `tests/media-resource-service.test.js:86` — searches cached resources by keyword and paginates the matches

### `工作区 fixture: localStateRoot + 文件 fixture: writeFileSync :: equal + throws/rejects`（2 项）

- `tests/hepan-provider-settings.test.js:33` — validates the publish interval and exposes the safe default
- `tests/hepan-provider-settings.test.js:48` — reads a valid interval from the environment without exposing secrets

### `工作区 fixture: localStateRoot + store/service stub: createPlatformSettingsService + 文件 fixture: writeFileSync :: equal + deep-equal`（2 项）

- `tests/hepan-provider-settings.test.js:88` — checks Python, imports, and login through a temporary cookie file that is always removed
- `tests/hepan-provider-settings.test.js:162` — preserves safe warnings and account identity without carrying an error code on success

### `工作区 fixture: workspacePath :: equal + match`（2 项）

- `tests/desktop-packaging.test.js:512` — initializes ready runtime after bootstrap and injects protected runtime dependencies
- `tests/desktop-packaging.test.js:527` — disposes the current runtime once before relaunch and tolerates relaunch without runtime

### `工作区 fixture: workspacePath + 文件 fixture: writeFileSync :: equal`（2 项）

- `tests/workspace-bootstrap-service.test.js:144` — requires selection with a specific stable error when saved configuration is damaged
- `tests/workspace-bootstrap-service.test.js:170` — uses invalid state for a saved path rejected by the validator

### `工作区 fixture: workspacePath + store/service stub: createWorkspaceBootstrapService :: equal`（2 项）

- `tests/workspace-bootstrap-service.test.js:103` — prefers a valid environment workspace and marks it as an override
- `tests/workspace-bootstrap-service.test.js:187` — does not fall back when the environment override itself is invalid

### `工作区 fixture: workspaceRoot :: equal + deep-equal + throws/rejects`（2 项）

- `tests/content-metadata-migration.test.js:107` — makes repeated execute explicit only while the workspace matches the committed result
- `tests/phase-02-migration.test.js:234` — every migration lifecycle fault leaves source and existing target safe, removes temporary database and releases lease

### `工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: equal`（2 项）

- `tests/legacy-migration.test.js:93` — skips unmatched customers and empty answers while preserving existing knowledge
- `tests/legacy-migration.test.js:131` — loads without node:sqlite and reports a stable unsupported error only when migration reads a database

### `工作区 fixture: workspaceRoot + 文件 fixture: writeFileSync :: throws/rejects`（2 项）

- `tests/client-knowledge.test.js:109` — rejects an explicit boundary whose clients root is not workspace.clients
- `tests/content-metadata-migration.test.js:118` — does not treat a changed committed workspace as an execute no-op

### `工作区 fixture: workspaceRoot + store/service stub: createDoubaoCollectionDesktopService :: equal`（2 项）

- `tests/doubao-collection-ipc.test.js:130` — closes the collection session after single, completed batch, and failed batch runs
- `tests/doubao-collection-ipc.test.js:194` — keeps the browser open while paused with pending tasks and does not close login sessions

### `工作区 fixture: workspaceRoot + store/service stub: createGenerationBatchStore + 文件 fixture: readFileSync :: equal + deep-equal`（2 项）

- `tests/generation-batch-store.test.js:36` — builds one stable task per client and template and preserves source ids
- `tests/generation-batch-store.test.js:133` — reads old batches without a cancelled count as zero and permanently cancels only pending tasks

### `工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal`（2 项）

- `tests/phase-02-operational-store.test.js:26` — operational store owns an atomic publication outcome and derived recovery
- `tests/phase-02-runtime-capacity.test.js:271` — 10,000 publication baseline retains actionable recovery and closes with a verified database

### `工作区 fixture: workspaceRoot + store/service stub: createOperationalStore + 文件 fixture: writeFileSync :: equal + throws/rejects`（2 项）

- `tests/phase-02-operational-store.test.js:90` — backup verifier reads destination and missing or corrupt targets have no side effects
- `tests/phase-02-runtime-capacity.test.js:130` — SQLITE_FULL-equivalent commit failure, inaccessible paths and corruption fail closed without partial facts

### `工作区 fixture: workspaceRoot + store/service stub: createRuntimeDiagnosticsService :: equal`（2 项）

- `tests/runtime-diagnostics.test.js:55` — keeps a configured browser channel in not_checked and isolates optional Hepan
- `tests/runtime-diagnostics.test.js:74` — retains a successful browser smoke result for the next diagnostic read

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

### `临时目录: makeTemporaryDirectory + store/service stub: fakeRuntime + 文件 fixture: readFileSync :: equal + throws/rejects + match`（2 项）

- `tests/doubao-browser-adapter.test.js:556` — writes a structured diagnostic summary without an original screenshot
- `tests/doubao-browser-adapter.test.js:649` — stops on a page error and does not send a question

### `临时目录: mkdtempSync :: equal + truthiness`（2 项）

- `tests/workspace-paths.test.js:40` — keeps the selected content library limited to portable content paths
- `tests/workspace-paths.test.js:65` — initializes a content library without creating local or installation state

### `临时目录: mkdtempSync + 工作区 fixture: workspacePath + store/service stub: createDesktopTaskService :: equal + deep-equal + throws/rejects`（2 项）

- `tests/workspace-runtime-lifecycle.test.js:152` — disposes services already created when a middle workspace factory fails
- `tests/workspace-runtime-lifecycle.test.js:176` — unsubscribes and disposes all started workspace resources when subscription setup fails

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal`（2 项）

- `tests/phase-03-composition.test.js:11` — Phase 3 composition owns one OperationalStore writer and releases it on dispose
- `tests/phase-03-composition.test.js:69` — attention retry requeues only an existing failed post-processing job without republishing

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot :: equal + throws/rejects`（2 项）

- `tests/legacy-migration.test.js:151` — rejects a linked workspace client target before copying legacy files
- `tests/legacy-migration.test.js:175` — rejects a linked workspace clients root before copying legacy files

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createContentGenerationBatchService :: equal`（2 项）

- `tests/content-generation-batch-service.test.js:112` — continues a real persisted pending batch when article lookup requires the task client id
- `tests/content-generation-batch-service.test.js:158` — marks a real batch failed when article lookup fails before task claim

### `临时目录: mkdtempSync + 工作区 fixture: workspaceRoot + store/service stub: createOperationalStore :: equal + deep-equal + throws/rejects`（2 项）

- `tests/phase-03-publication-workflow.test.js:233` — PublicationWorkflow recovery turns a stranded remote intent into a blocking uncertain record
- `tests/phase-03-publication-workflow.test.js:303` — outcome transaction failure leaves a durable recovery intent and never starts post-processing

### `临时目录: mkdtempSync + store/service stub: createAuthService :: equal + throws/rejects`（2 项）

- `tests/auth-service.test.js:90` — keeps the encrypted refresh token and account state through temporary failures
- `tests/auth-service.test.js:121` — clears the session only for a terminal refresh error and ignores stale responses

### `浏览器/Renderer fixture: browser.newPage :: equal + truthiness`（2 项）

- `tests/renderer-question-editor-session.test.js:121` — keeps the desktop panel non-blocking and uses a full-screen narrow panel
- `tests/renderer-responsive-layout.test.js:154` — keeps the preflight confirmation button clickable beside the normal authorization status bar

### `浏览器/Renderer fixture: browser.newPage :: match + truthiness`（2 项）

- `tests/renderer-responsive-layout.test.js:189` — rescans media articles and refreshes orders after a successful paid submission
- `tests/renderer-responsive-layout.test.js:217` — exposes the settings page content at the desktop viewport

### `文件 fixture: readFileSync :: equal + match`（2 项）

- `tests/ci-workflow-contract.test.js:15` — root CI workflow has the required local-layout command contracts
- `tests/content-workbench-regression.test.js:98` — keeps Task 10 single and batch generation workflows on renderer APIs

### `文件 fixture: readFileSync :: equal + match + truthiness`（2 项）

- `tests/react-workbench-regression.test.js:65` — uses the complete main-process platform status shape
- `tests/renderer-responsive-layout.test.js:244` — keeps expanded long-title history rows and row-end actions inside narrow viewports

### `文件 fixture: readFileSync :: truthiness`（2 项）

- `tests/react-workbench-regression.test.js:43` — exposes platform commands through preload
- `tests/react-workbench-regression.test.js:56` — shares the structured IPC response envelope

### `文件 fixture: writeFileSync :: equal + match`（2 项）

- `tests/architecture-seams.test.js:9` — attention and workspace seams keep ownership and dependency direction explicit
- `tests/media-article-converter.test.js:20` — converts markdown articles to html

### `IPC stub: createIpc :: deep-equal`（2 项）

- `tests/ai-content-ipc.test.js:32` — wraps coded service errors without stack traces
- `tests/ai-content-ipc.test.js:53` — rejects non-object generation payloads without exposing internal details

### `IPC stub: handlers :: equal + match`（2 项）

- `tests/doubao-collection-ipc.test.js:334` — rejects unsafe ids, paths, renderer scripts and profile paths at the boundary
- `tests/doubao-collection-ipc.test.js:351` — rejects batches larger than 500 tasks and batch task fields outside the API

### `IPC stub: registerWorkspaceBootstrapIpc + store/service stub: fakeIpc :: deep-equal`（2 项）

- `tests/workspace-bootstrap-ipc.test.js:25` — registers exactly the seven workspace bootstrap channels
- `tests/workspace-bootstrap-ipc.test.js:41` — uses the native open-directory dialog and passes only the selected path to choose

### `store/service stub: createAuthService :: throws/rejects`（2 项）

- `tests/auth-service.test.js:42` — maps server failures to fixed non-sensitive error codes
- `tests/auth-service.test.js:47` — preserves stable lock and rate-limit codes regardless of HTTP status

### `store/service stub: createDesktopTaskService :: equal`（2 项）

- `tests/desktop-task-service.test.js:159` — returns a distinct progress watchdog error instead of a fixed batch timeout
- `tests/desktop-task-service.test.js:214` — rejects stale, oversized, and secret-bearing worker envelopes

### `store/service stub: createEventFixture :: equal + truthiness`（2 项）

- `tests/generation-snapshot-event.test.js:84` — records one current renderer follow-up IPC and batch read for every state event
- `tests/generation-snapshot-event.test.js:119` — consumes complete snapshot events without renderer follow-up IPC or batch reads

### `store/service stub: createGenerationSubmissionHandoffService :: equal + deep-equal`（2 项）

- `tests/generation-submission-handoff.test.js:25` — previews and commits 50 successful articles across two clients with one confirmation
- `tests/generation-submission-handoff.test.js:75` — blocks duplicate article identities before delegating to the submission service

### `store/service stub: createGenerationSubmissionHandoffService :: throws/rejects`（2 项）

- `tests/generation-submission-handoff.test.js:62` — rejects a commit after the batch revision changes
- `tests/generation-submission-handoff.test.js:107` — rejects a target that is not available for queue import

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

- `tests/media-provider-settings.test.js:44` — saves without calling the network and tests balance without replacing the saved config
- `tests/platform-settings-service.test.js:34` — exposes a small status interface without secrets and saves without testing

### `store/service stub: createPlatformTaskStateStore :: equal`（2 项）

- `tests/platform-task-progress.test.js:7` — restores 7 of 20 processed tasks without exposing paths
- `tests/platform-task-progress.test.js:36` — does not double count duplicate heartbeats or old runs

### `store/service stub: createPlatformWorkbenchService :: equal`（2 项）

- `tests/platform-workbench-service.test.js:145` — prepares an account-bound workflow command without writing publication state
- `tests/platform-workbench-service.test.js:174` — keeps source-file body when an adapter omits its body field

### `store/service stub: createTestStatusStore :: equal + deep-equal`（2 项）

- `tests/ai-provider-service.test.js:117` — records only a safe successful test result, supports clear, and fingerprints settings
- `tests/ai-provider-service.test.js:138` — tests a first draft without creating formal application configuration

### `store/service stub: fakeStore :: equal`（2 项）

- `tests/generation-batch-runner.test.js:185` — aborts the active task and leaves later tasks pending when stopped
- `tests/generation-batch-runner.test.js:426` — handles a controllable fifty-task run without duplicate execution after stop and continue

## 后续采集与人工复核

- [ ] 在隔离且不连接真实客户/投稿服务的环境执行 `npm test`，记录实际总时长、通过/失败/跳过，并与本清单的静态声明数对照。
- [ ] 单独执行 `npm --prefix auth-server test`、`npm --prefix media-workbench run lint` 和 `npm run build:renderer`，记录实际结果、耗时和产物体积。
- [ ] 运行 `npm audit` 并记录报告时间、范围和已知接受项。
- [ ] 对重复名称和 fixture/断言组合逐项确认替代覆盖位置；只有满足计划删除门槛的测试才进入后续 Phase 6。
- [ ] 对检测到的四个 Renderer build/browser 流程人工确认是否可在共享 harness 中复用；本清单不改变任何测试执行方式。
