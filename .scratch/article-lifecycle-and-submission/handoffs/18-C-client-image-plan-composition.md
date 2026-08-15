# 18-C — 客户随机图片计划与 Composition 接线：Implementation Handoff

## 状态

- 工作包：`18-C-client-image-plan-composition`。
- 开始 integration HEAD：`d44ebe68abcbae06673ad05e4a14b5922a2c5bac`（`codex/article-lifecycle-submission`，开始时工作树干净）。
- 本次按 Manual Dispatch 完成 implementation、定向验证和本 handoff；**尚未执行 Primary Audit、finding remediation、bounded re-audit、commit 或 merge**，因此 18-C 保持 `RUNNING`，18-D 仍不可调度。
- 未执行真实登录、图片上传、发布、付费、取消、订单核对或生产迁移。

## 已实现的 owner 与合同

- `src/infrastructure/workspace/storage-paths.js` 新增路径策略常量 `CLIENT_IMAGE_DIRECTORY_NAME = "images"`，并在 workspace paths 中提供 `clientImageDirectoryName`。这是客户目录下的相对专用子目录名，不是机器绝对路径，也不会主动创建、移动或删除客户图片。
- `desktop/composition/workspace-runtime-composition.js` 在每个 workspace runtime 中唯一创建 `ClientImageLibrary`，显式传入 `workspaceRoot`、既有 paths 和 `paths.clientImageDirectoryName`；不再让 production composition 落回 Ticket 17 的客户根目录默认扫描。composition 只保留这个 library 的既有 per-workspace/per-client cache，不另建缓存或已使用记录。
- 新的 `desktop/services/regular-image-plan-service.js` 只拥有单次 `createPlan({ clientId, imageCount })`：调用 Ticket 17 的 `selectImages`，将安全图片元数据映射为 `{ imageId, name, extension, mimeType, width, height, size }`，并输出 `{ requestedCount, selectedCount, textOnly, images, warnings }`。没有绝对路径、relative path、real path、二进制、DOM、Cookie、上传 token、evidence 或持久化。
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

npx --no-install prettier --check --end-of-line auto desktop/services/regular-image-plan-service.js tests/regular-image-plan-service.test.js
# PASS

git diff --check
# PASS
```

新增 `tests/regular-image-plan-service.test.js` 覆盖：production composition 显式传递专用目录名；客户根目录其他图片和客户 B 图片不会进入客户 A plan；单计划无重复、跨 plan 可复用、`N>M`、零图、目录缺失、损坏图片、扫描 I/O 失败安全降级、无绝对路径/real path/bytes 泄漏，以及非法输入/未识别编程错误 fail-closed。

未运行全量 `npm test` 或 Wave 12 final gate；它们不属于 18-C Manual Dispatch 的授权范围，也不能替代后续的 Primary Audit 与 closure。

## 后续动作

Primary Audit 只需检查本包新增路径配置、唯一 `ClientImageLibrary` composition、`RegularImagePlanService` 输入/输出与故障分类、直接 runtime consumer，以及上述定向回归。通过 finding remediation 和 bounded re-audit 后，才可在授权下提交/集成并将 18-C 标为 `COMPLETE`；随后才允许从新的 clean integration HEAD 启动 18-D。
