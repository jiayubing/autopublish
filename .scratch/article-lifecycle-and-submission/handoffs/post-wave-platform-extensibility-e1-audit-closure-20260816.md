# Post-Wave E1 Primary Audit 与 Closure

**工作包：**`E1 — 平台 definition 与 capability-aware loader`

**基线：**`codex/jiagou @ 7747e64743ad3441097df1294874bc120772a1ad + E0 documentation diff + E1 implementation diff`

**结论：**E1 `COMPLETE`；Primary Audit 的 blocking findings 已全部修复，Bounded Re-audit `PASS`，下一 gate 为 `E2 READY`。E0/E1 已进入本地 integration commit `6c1641ea89acfacd3c9877b6f92bfffb28d54763`；未进入 E2，未 merge/push。

## Scope

- `PlatformDefinitionV1` exact schema、稳定错误与安全诊断；
- capability/contribution 与 immutable narrow-port matrix；
- 四个 built-in definition/runtime module 与 enabled filtering；
- admission/preparation、account/session、legacy workbench/worker、submission catalog/maintenance 的直接调用链；
- workspace/run adapter state isolation、worker pause/final cleanup；
- package/architecture contract 和 E0 直接回归。

未把 E2 的 Renderer display-name、external-host policy、named workspace path 去重或 E3 的特殊 contribution 归位提前纳入本轮 finding。

## Checked invariants

- 未知字段、重复 ID、非法 identity/display/host/path、missing/extra/undeclared port 均 fail-closed；单个平台失败不隐藏其他合法平台。
- capability/contribution 为 false 时对应 own port 不存在；为 true 时只投影 exact、immutable port。
- Lieju、Toutiao、Hepan、media 的 definition projection 与当前真实能力矩阵一致；media/Lieju 不进入无权执行的 legacy worker 路线。
- workspace runtime 不共享 Hepan/Toutiao mutable runtime/session 路径；Toutiao legacy scan 使用当前 workspace input。
- worker pause 与 final cleanup 关闭实际 active loaded legacy ports；单个平台 cleanup failure 不阻止其余 cleanup，也不覆盖主错误。
- diagnostics 只输出 stable code 与 allowlisted metadata；未记录 Cookie、正文、绝对路径或供应商异常。
- 未增加文章生命周期、队列、订单、attention、publication writer、自动 retry 或真实外部副作用。

## Findings 与 disposition

### F1 — P2 / `INTRODUCED_BY_CHANGE` / blocking / CLOSED

重复 definition ID 只隔离后出现的 module，首个同 ID module 仍可能被装载，未完整 fail-closed。修复为先收集所有重复 ID，再隔离该 ID 的全部 module，同时保留其他合法平台；新增 duplicate quarantine 行为测试。

### F2 — P2 / `INTRODUCED_BY_CHANGE` / blocking / CLOSED

loader 为未声明 capability 写入值为 `undefined` 的 own-property，并允许 raw module 显式导出 `port: undefined`，不满足 exact absence contract。修复为只投影声明过的 ports，并以 own-property 检查拒绝任何 undeclared export；新增 absent/undefined-port 回归。

### F3 — P1 / `INTRODUCED_BY_CHANGE` / blocking / CLOSED

Toutiao `legacyQueue.scan()` 直接引用仍要求 `scanDir` 参数的旧方法，调用时会抛 `ERR_INVALID_ARG_TYPE`。修复为平台 module 在窄 port 内绑定 definition `scanDir`，并增加 built-in scan 及 workspace 隔离回归。

### F4 — P1 / `INTRODUCED_BY_CHANGE` / blocking / CLOSED

worker pause 仍调用已删除的宽 `platform.closeSession`，活动 legacy session 实际不会关闭。新增 worker-owned narrow cleanup operation，pause/final cleanup 均遍历 active `legacyQueue.close`，逐平台隔离 cleanup failure；新增行为测试。

### F5 — P2 / `INTRODUCED_BY_CHANGE` / blocking / CLOSED

Toutiao platform factory 未下传 runtime context，scan/profile/daemon/state 路径仍回落到共享默认配置，缺少 E1 要求的 workspace isolation。修复为下传并绑定 workspace/browser runtime；两个 workspace 的 scan 与 login port 实例隔离测试通过，同时保留无显式 runtime 的既有 factory seam。

**Deferred findings：**无。

## Bounded Re-audit

复审只覆盖 F1–F5 修复 diff、loader exactness、Toutiao runtime/scan、worker cleanup、直接 consumers 和对应回归。所有 blocking finding 已关闭；未修改 schema、业务事实 owner、事务或远端副作用边界，未触发 escalation。

## Final validation

在最终 production source state 的 `auto—publish/` 执行：

1. E0 baseline + E1 loader/worker/IPC/queue/maintenance/browser/direct regression：`167 passed / 0 failed / 0 skipped / 28715.1782 ms`。
2. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped / 2809.3971 ms`。
3. `node --test tests/phase-01-architecture.test.js tests/phase-08-cleanup-gates.test.js`：`8 passed / 0 failed / 0 skipped / 95514.5189 ms`。
4. E1 production/test 文件定向 ESLint：PASS。
5. `git diff --check`：PASS（仅既有 LF→CRLF working-copy warning）。

过程中的一次扩展回归曾暴露 Toutiao 无显式 runtime seam 的 2 个失败；修复后已由上述最终 `167/167` 结果完整替代，不作为 closure PASS evidence。

## 未运行与边界

- 未运行 full `npm test`、Renderer typecheck/build 或真实 electron-builder package smoke；这些不是 E1 工作包 closure gate，最终全套 gate 仍由 E6 执行。
- 未执行真实登录、投稿、图片上传、付费、取消、订单核对或生产迁移；本工作包禁止且没有授权。
- 未进入 E2。

## Git / provenance

- Base HEAD：`7747e64743ad3441097df1294874bc120772a1ad`。
- E0/E1 implementation/remediation/tests/audit integration commit：`6c1641ea89acfacd3c9877b6f92bfffb28d54763`。
- 未 merge/push。
