# Post-Wave E4 Implementation Handoff

**工作包：**`E4 — 图片库窄 port 与交付边界`

**执行方式：**Manual Dispatch。已完成 E4 implementation、定向验证与本交接；未启动 Primary Audit、finding remediation、commit、merge、push 或 E5。

**基线：**`codex/jiagou @ 2d5c946302d361fce70824aefbcdde024da34169`，E0～E3 implementation/audit closure 均为当前 HEAD 祖先；开始执行时工作树 clean。

## Implementation scope

- 新增唯一 `src/content/image-plan-v1.js` parser：`version: 1`、所有层级 exact keys、0～5 count、一致的 `textOnly/selectedCount/images`、安全 image metadata、唯一 `imageId` 与封闭 warning code/stage 均在同一 owner 校验并冻结。
- `client-image-library` 删除无 production consumer 的 `listImages/listAvailableImages/scanMany/select/selectImages/resolveImage` surface，只保留内部 owner 测试需要的 `scan/invalidate`，并投影 exact `imageSelectionPort.select` 与 `imageAssetReader.read`。
- selection port 只返回安全引用与安全 warning，不暴露 relative/absolute path、bytes、scanner/cache/diagnostic detail；`regular-image-plan-service` 只依赖该 port，并把可恢复 I/O 映射为既有稳定 plan warning。
- asset reader 每次交付重新验证 client、专用图片根、path containment、symlink/regular-file、metadata/mime/extension/size；读取按 `open/fstat/64 MiB limit/fixed-length read/path recheck` 收口，避免先把超大文件载入内存。返回 bytes 与 SHA-256 fingerprint 一致的不可序列化、inspect-redacted、冻结进程内资产。
- workspace composition 从同一 library instance 向选图链和平台 runtime 分别注入两个窄 port；没有第二图片库、缓存、持久 writer 或进程外 DTO。
- Lieju 只解析稳定 `ImagePlanV1` 并调用 `imageAssetReader`；删除对 `client-image-reference`、`client-image-metadata`、文件路径和通用 fingerprint 的直接依赖。4 槽位、1 MiB 平台限制、multipart charset、HTTP/browser transport 与 best-effort warning 继续由 Lieju owner 持有。
- Toutiao/Hepan 未声明图片 capability 时，新 admission 无配置也显式保存 `imageCount=0`；显式非零 admission/preview/update 在 writer 前以 `REGULAR_QUEUE_IMAGE_PUBLISHING_UNSUPPORTED` fail-closed。Lieju 继续允许 0～5 配置；既有持久 schema、队列/生命周期/结果状态机不变。
- 新增 dependency-direction absence gate，证明 `src/platforms/*` 不直接依赖任何 `client-image-*` implementation，plan service 不再 import 图片库内部模块。

## Validation on final implementation source state

在 `auto—publish/`、上述基线 HEAD 加当前 E4 dirty diff 上实际运行：

1. E4 parser/port/path/cache/selection/Lieju HTTP+browser+multipart/普通队列与 08/18 回归直接矩阵：`100 passed / 0 failed / 0 skipped / 13302.3417 ms`。
2. 计划 §1 跨平台/图片/工作区 baseline：`104 passed / 0 failed / 0 skipped / 7196.8273 ms`。
3. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped / 2485.2297 ms`。
4. `npm run typecheck:main`：PASS。
5. E4 production/test 文件定向 ESLint：PASS。
6. 基线原本 Prettier-compliant 且本次直接修改的 source/test 与全部新增文件，经局部 `prettier --write` 后 `prettier --check` PASS；未格式化基线即不合规的大文件。
7. `git diff --check`：PASS；只有 working-copy LF→CRLF warning。

实施中还运行过一次覆盖全部改动文件的探索性 Prettier check，17 个文件报告 style warning；逐项与 HEAD 对照后，只格式化基线原本合规的直接 owner/新增文件，避免把既有大文件全量格式化并扩大 diff。格式化后的最终 source state 已重新运行上述全部门禁。

## Boundaries and unrun acceptance

- 未运行 full `npm test`、Renderer/bridge typecheck/build 或实际 alpha package smoke；E4 没有 IPC/Renderer/schema/asset include 变更，完整组合门禁与 package smoke 留给 E6。
- 未执行真实登录、投稿、图片上传、付费、取消、订单核对、生产数据库或生产迁移；E4 测试全部使用本地合成文件与假 transport，真实图片上传次数为 0。
- 未新增或修改 publication/queue/order/attention writer、远端 retry、人工 decision 或持久 evidence schema。
- 未启动 E4 Primary Audit；当前 implementation 尚未 commit，计划 gate 仅推进到 `E4 PRIMARY AUDIT READY`，未进入 E5。

## Git / next gate

- HEAD：`2d5c946302d361fce70824aefbcdde024da34169`。
- 工作树包含 E4 production/test diff、本 handoff 与计划 gate 更新；无已知无关用户改动或生成物。
- 下一 gate：`E4 PRIMARY AUDIT READY`。
