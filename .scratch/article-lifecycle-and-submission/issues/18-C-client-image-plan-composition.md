# 18-C — 客户随机图片计划与 Composition 接线

**Goal:** 在每篇普通平台文章真正取得 claim 后，根据 `articleIdentityV1.clientId + queueGroup.imageCount` 调用 Ticket 17，形成仅进程内、安全、best-effort 的随机图片计划。

**Blocked by:** 18-B `COMPLETE`。

## 本线程职责

1. 在 workspace/composition 中实例化唯一 `ClientImageLibrary`，显式提供客户专用 `imageDirectoryName`；生产代码不得依赖 Ticket 17 的“客户根目录”默认扫描。
2. 新建窄 `RegularImagePlanService`（名称可按现有命名规范调整）：输入至少为 `clientId`、`imageCount`，输出安全 image plan。
3. image plan 只保存稳定 `imageId` 和必要安全元数据；不含绝对路径、二进制、DOM、上传 token。
4. 每次文章 claim 后才随机选择；同一 plan 内使用 Ticket 17 的无放回选择，跨文章不传 `excludeImageIds`，因此允许连续复用同图。
5. 请求 N 而可用 M<N 时返回 M；N=0 或无图返回空计划。
6. 目录不存在、扫描/元数据错误、可恢复图片库异常一律转换为安全 warning + 空计划。只有输入身份/配置本身非法等编程/合同错误可以 fail-closed，不能把图片 I/O 问题变成文字投稿失败。
7. cache 复用 Ticket 17；不在本 service 建第二图片缓存/已使用记录。
8. 增加专用子目录、客户隔离、N>M、0 图、随机复用、异常降级、无绝对路径泄漏测试。

## 建议的进程内输出形态

```text
{
  requestedCount,
  selectedCount,
  textOnly,
  images: [{ imageId, name, extension, mimeType, width, height, size }],
  warnings: [{ code, stage }]
}
```

这不是公开 IPC DTO，也不持久化。具体字段以 18-0 owner map 和现有安全 DTO 复用情况为准；不得为了该形态创建平行 V1 evidence。

## Owner / 允许修改

- `desktop/composition/workspace-runtime-composition.js` 或更窄的 queue composition root
- 新的 application/service image-plan 深模块
- Ticket 17 仅允许最小 bugfix；正常情况下只消费其公开 API
- 对应 composition / image-plan tests

## 禁止跨界

- 不改 queue schema、IPC/Renderer 配置面。
- 不改 platform adapter，不上传图片，不修改正文。
- 不计算通用正文布局，不生成 `layoutSlot`。
- 不写 `preparedSubmissionEvidenceV1` / publication outcome。
- 不记录图片近期使用或移动/删除客户文件。

## Acceptance criteria

- [ ] production composition 显式传 `imageDirectoryName`，测试证明客户根目录其他 JPG 不会进入候选集。
- [ ] claim 对 client A 只能得到 A 专用图片目录资产，绝不混入 client B。
- [ ] `imageCount=5`、可用 2 张时 selected=2；0 张时合法空计划。
- [ ] 两个不同文章 plan 允许选中同一 imageId；单个 plan 内不重复。
- [ ] 目录缺失、损坏文件、扫描失败等返回安全 warning/空计划，不抛出会中断文字投稿的可恢复图片异常。
- [ ] image plan 不含绝对路径/realPath/二进制；需要真实路径只能由后续 adapter 准备阶段通过 Ticket 17 `resolveImage` 临时获得。
- [ ] 不新增 module-global mutable cache 或使用历史表。
- [ ] Ticket 17 定向回归 + 新 image-plan/composition tests PASS；handoff 记录 dedicated-dir 配置来源和异常降级矩阵。

## Stop / return conditions

若“客户专用图片目录”的真实配置来源在当前 HEAD 完全不存在且无法由既有 workspace/config owner提供，应返回主线程记录一个最小配置 owner 决策点；不得硬编码用户机器绝对路径。
