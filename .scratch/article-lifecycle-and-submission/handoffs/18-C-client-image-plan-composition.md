# 18-C — 客户随机图片计划与 Composition 接线：Closure Handoff

## 状态与范围

- 工作包：`18-C-client-image-plan-composition`。
- 开始 integration HEAD：`d44ebe68abcbae06673ad05e4a14b5922a2c5bac`；implementation commit：`3818539df0d584f52cb1f3707b1f7276721429f8`；Primary Audit remediation commit：`cb5160d334e09e373933ef57d1b441005c956b70`。
- 本 handoff 和 Wave Plan 状态回填见 closure commit；18-C 至此 `COMPLETE`，18-D 只能从该 closure 的 clean integration HEAD 串行开始。
- 未执行真实登录、图片上传、发布、付费、取消、订单核对或生产迁移。

## 已实现的 owner 与合同

- `src/infrastructure/workspace/storage-paths.js` 新增路径策略常量 `CLIENT_IMAGE_DIRECTORY_NAME = "images"`，并在 workspace paths 中提供 `clientImageDirectoryName`。这是客户目录下的相对专用子目录名，不是机器绝对路径，也不会主动创建、移动或删除客户图片。
- `desktop/composition/workspace-runtime-composition.js` 在每个 workspace runtime 中唯一创建 `ClientImageLibrary`，显式传入 `workspaceRoot`、既有 paths 和 `paths.clientImageDirectoryName`；不再让 production composition 落回 Ticket 17 的客户根目录默认扫描。composition 只保留这个 library 的既有 per-workspace/per-client cache，不另建缓存或已使用记录。
- 新的 `desktop/services/regular-image-plan-service.js` 只拥有单次 `createPlan({ clientId, imageCount })`：调用 Ticket 17 的 `selectImages`，将安全图片元数据映射为 `{ imageId, name, extension, mimeType, width, height, size }`，并输出 `{ requestedCount, selectedCount, textOnly, images, warnings }`。它使用 Ticket 17 的 `relativePathForImageId` 验证每个 `imageId`，拒绝伪造或编码绝对路径的库结果；计划没有绝对/相对路径、二进制、DOM、Cookie、上传 token、evidence 或持久化。
- `imageCount=0` 直接返回空计划；`N>M` 保留 Ticket 17 的实际 `M` 张无放回选择；每次调用不传 `excludeImageIds`，因而同一计划不会重复、跨文章可以重复。
- 已知可恢复 I/O/图片库故障被转换为固定安全 warning 与空计划；缺失目录或无可用图也产生空计划。客户 ID、图片数量、随机源和 library result 的合同错误 fail-closed，未经识别的编程错误继续传播，不以静默 fallback 掩盖。
- 此包没有调用 prepare port、queue claim、adapter、IPC、Renderer、`resolveImage`、`preparedSubmissionEvidenceV1` 或 publication outcome。18-D 将在其已冻结的 account verification 后唯一调用点接入该进程内服务。

## 定向验证

在 `auto—publish/` 实际通过：

```text
node --test --test-concurrency=1 tests/regular-image-plan-service.test.js tests/client-image-selector.test.js tests/client-image-library.test.js tests/workspace-runtime-lifecycle.test.js tests/phase-03-composition.test.js tests/phase-07-regular-queue.test.js
# 42 passed, 0 failed, 0 skipped

npx --no-install eslint src/infrastructure/workspace/storage-paths.js desktop/services/regular-image-plan-service.js desktop/composition/workspace-runtime-composition.js tests/regular-image-plan-service.test.js
# PASS

npx --no-install prettier --check --end-of-line auto src/infrastructure/workspace/storage-paths.js desktop/services/regular-image-plan-service.js tests/regular-image-plan-service.test.js
# PASS

git diff --check
# PASS
```

新增 `tests/regular-image-plan-service.test.js` 覆盖：production composition 显式传递专用目录名；客户根目录其他图片和客户 B 图片不会进入客户 A plan；单计划无重复、跨 plan 可复用、`N>M`、零图、目录缺失、损坏图片、扫描 I/O 失败安全降级、无绝对路径/real path/bytes 泄漏、伪造 image ID 拒绝，以及非法输入/未识别编程错误 fail-closed。

`workspace-runtime-composition.js` 的 Prettier check 在 implementation base `d44ebe6` 亦失败，属于 `P3 / EXPOSED_PREEXISTING` 的格式债；owner 为 `desktop/composition` 的后续格式化维护。它没有改变本 Ticket 行为、公开合同或验证结果，因此未在本次进行无关整文件重格式化。

未运行全量 `npm test` 或 Wave 12 final gate；它们属于 Wave 12 末尾 18-E 的 gate，不是 18-C closure 的要求。

## Audit closure

- **Primary Audit scope：** `d44ebe6..3818539` 的 workspace 路径配置、唯一 `ClientImageLibrary` composition、`RegularImagePlanService` 输入/输出和可恢复故障分类、runtime module consumer，以及 Ticket 17 和直接 queue/runtime 回归。
- **Checked invariants：** production 显式使用专用目录；客户之间及客户根目录候选集隔离；计划不持久化、不含路径或二进制、不建第二缓存；同一选择无重复且跨文章可复用；图片 I/O 只生成安全 warning/纯文本而不阻断文字投稿；claim/prepare/adapter/evidence 边界仍留给 18-D。
- **Finding remediation：** `P2 / INTRODUCED_BY_CHANGE`：初始 service 只检查 `client-image:` 前缀，不能单独保证 image ID 是 Ticket 17 的稳定安全引用。`cb5160d` 改为复用 `relativePathForImageId`，并以编码绝对路径的伪造 ID 回归验证，已关闭。
- **Bounded Re-audit：** 只复核 remediation diff、plan 的安全投影、直接 composition consumer 与上述 42 项回归；无新 blocker、无公开合同/schema/owner/远端副作用边界变化，结论 `PASS`。

## 后续边界

- 18-C 已 `COMPLETE`；18-D 可以从本 closure commit 的 clean integration HEAD 串行开始。
- 不得由本 Ticket 提前接入 prepare port、平台 adapter、上传、正文布局、submission evidence 或远端操作。
