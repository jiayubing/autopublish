# 18-0 — 图片瘦身合同与 Owner Map 冻结

**Goal:** 在不写 production code 的前提下，把 Ticket 18 的最终产品语义、现有公开合同、真实调用链和工作包文件范围冻结，避免后续线程重新发明图片状态机或误改核心 submission/outcome schema。

**Blocked by:** 08、09、10、17 `COMPLETE`；Ticket 26 的 26-I 本地 closure 已闭合；Wave Plan 的 Wave 12 本地 closure 调度例外；Ticket 18 umbrella 当前版本。

## 本线程职责

1. 只读取当前 HEAD 的 Ticket 17 公开 API/直接测试，确认随机、不足、零图、客户隔离和 `resolveImage` 行为；不重审其内部实现。
2. 只读取 08/09 当前公开 `PreparedSubmission`、evidence、submission-start/outcome 合同及其直接测试，不重开历史审计。
3. 追踪真实普通平台直接链路：queue group persistence → claim → preparation port → `beginRegularRemoteSubmission` → submit；不扩展到无关 UI、订单或 migration owner。
4. 建立 18-A–D 的互斥文件/owner map，并确认 `imageCount` 是唯一新增持久事实、进程内 `imagePlan` 是唯一跨 owner seam。
5. 判断 18-C 的组合职责应进入现有 preparation owner 还是形成一个有真实失败降级逻辑的窄模块；禁止预先指定纯透传 service/manager。
6. 对 downstream 19–21 只核对其消费 `imagePlan` 的既有前提，不修改其合同，不分析或提前实现平台协议。
7. 形成 `handoffs/18-0-image-contract-owner-map.md`，只记录 integration HEAD、合同 identity、owner/file map、直接测试清单和后续包停止条件。

## 禁止跨界

- 不修改 production source、schema、migration、Renderer 或平台 adapter。
- 不新增 V2 evidence、图片 DTO 公共版本、generic result union 或 compatibility shim。
- 不新增独立 capability registry、generic image framework、上传 adapter、纯透传 service/manager 或平台分支。
- 不把 Ticket 17 改回 pending，不重构已经验收通过的图片库。
- 不修改任何 Ticket 19–21 / Wave 13 文档或 production adapter。
- 不执行真实账号登录、图片上传或发布。

## Acceptance criteria

- [ ] handoff 明确记录完全随机、同篇不重复/跨篇可重复、N>M 用 M、0 图继续文字、图片失败自动降级。
- [ ] 证明当前 V1 evidence 已能表达 `text_only|with_images` 且无需新增字段；`decisionKind` 保留但新路径固定 `initial`。
- [ ] 明确 `layoutSlot` 由平台实际准备结果拥有，不再存在 Ticket 18 通用均匀布局 owner。
- [ ] 明确生产图片源必须显式使用专用 `imageDirectoryName`，Ticket 17 默认客户根扫描不得被 production composition 采用。
- [ ] 输出 18-A–D 的互斥 owner/file map；任何共享 owner 只能串行修改。
- [ ] 证明删除拟新增的 18-C 模块若只会删除透传代码，则不创建该模块；只有集中随机计划、降级和安全诊断职责时才允许成为独立 owner。
- [ ] 列出每个包最小定向测试和 escalation 条件；没有 production diff。

## Stop / return conditions

仅当当前 HEAD 的公开 V1 已无法表达上述语义、Ticket 17 随机行为已回归、或真实 owner 与 umbrella 冲突时返回主线程阻塞；普通文件布局变化由本线程更新 owner map 后继续。
