# Post-Wave E4 Audit Remediation

**工作包：**`E4 — 图片库窄 port 与交付边界`

**结论：**Primary Audit 的两个 blocking findings 已关闭，bounded re-audit `PASS`，当前 gate 为 `E4 COMMIT READY`。未 commit、merge、push 或进入 E5。

## Source state

- Base HEAD：`2d5c946302d361fce70824aefbcdde024da34169`。
- 审计与修复对象：上述 HEAD 加当前 E4 implementation/remediation/test/docs dirty diff。
- E0～E3 closure 均为当前 HEAD 祖先；没有发现无关用户改动或生成物。

## Findings and remediation

- F1 `P2 / INTRODUCED_BY_CHANGE`：asset 的非枚举 `toJSON` 只能阻止 JSON，`structuredClone` / V8 serialization 仍会复制客户图片 bytes；`Object.freeze` 也不能冻结 Buffer，外部修改会让 bytes 与 fingerprint 失配。修复后 asset 使用不可 structured-clone 的进程内 opaque proxy，私有 bytes 只通过防御性副本读取，JSON、structured clone 与 V8 serialization 均 fail-closed，普通 inspect 只返回安全占位文本。
- F2 `P2 / INTRODUCED_BY_CHANGE`：通用 metadata 可产出超过 `ImagePlanV1` 上限的尺寸，导致 selection 成功后 plan parser 抛错并中断整次准备。修复后 `ImagePlanV1` 单一拥有通用 bytes/dimension 上限，metadata scanner 在 selection 前按相同约束淘汰候选；超限图片产生安全 scan warning，并自动降级为纯文本。
- Lieju delivery 只读取一次 asset bytes 副本后执行平台 1 MiB gate；未恢复任何 `client-image-*` 平台直接依赖。
- 两项修复未修改 schema、持久 writer、事务、队列/生命周期状态机、uncertain/retry、IPC/Renderer 或远端副作用边界；无 deferred finding，无 escalation。

## Bounded re-audit validation

在 `auto—publish/`、上述 dirty source state 上实际运行：

1. E4 ImagePlan/library/selection/Lieju HTTP+browser+multipart/队列与生命周期直接矩阵：`97 passed / 0 failed / 0 skipped`。
2. 计划 §1 跨平台/图片/工作区 baseline：`104 passed / 0 failed / 0 skipped`。
3. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped`。
4. `npm run typecheck:main`：PASS。
5. 修复 production/test 文件定向 ESLint 与局部 Prettier check：PASS。
6. `git diff --check`：PASS；仅有 working-copy LF→CRLF warning。

回归额外明确证明：

- `JSON.stringify(asset)`、`structuredClone(asset)` 与 `v8.serialize(asset)` 均不能携带客户图片资产离开进程内边界；修改已取得的 bytes 副本不会改变后续读取或 fingerprint 一致性。
- 宽度 `100001` 的合成 PNG 不再产生 `REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID`，而是被 scanner 安全跳过并形成 text-only plan。

## Boundaries and next gate

- 未运行 full `npm test`、bridge/Renderer typecheck/build 或实际 package smoke；按计划留给 E6 combined closure。
- 未执行真实登录、投稿、图片上传、付费、取消、订单核对、生产数据库或生产迁移。
- 下一 gate：`E4 COMMIT READY`。当前请求未授权 commit/merge/push；提交与 provenance closure 完成前不得进入 E5。
