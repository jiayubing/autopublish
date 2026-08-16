# Post-Wave E3 Primary Audit 与 Bounded Re-audit

**工作包：**`E3 — 特殊平台 contribution 归位`

**审计范围：**E3 working-tree diff、计划 E3 acceptance、Hepan settings-backed regular preparation/account inspection/legacy worker runtime、Lieju client-profile reader、media resource/settings projection、workspace composition、desktop task/worker、definition loader 投影及最小直接调用链。未重审 E0～E2 已关闭 finding，未进入 E4。

## Checked invariants

- Hepan settings、临时 Cookie、Python/runtime 与 cleanup 仍由 Hepan/settings owner 管理；共享 composition、desktop task 与 worker 不识别 Hepan 具名字段或平台 ID。
- 临时 Cookie 只在真实 submit/legacy worker run 前生成，正常、异常和停止路径均执行 cleanup；cleanup failure 不覆盖已确认远端结果或主业务错误。
- Lieju profile 只从 claimed client 的 content owner 读取，缺失/不完整时 fail-closed，不回退全局配置、环境路径或默认账号。
- media 只投影 resource/settings contribution，不进入普通投稿 port。
- loader 仅投影 definition 已声明的冻结具名 contribution；未新增 generic contribution manager、第二 writer、状态机、自动 retry 或 schema。
- current Toutiao/Hepan/Lieju accepted、rejected、group-blocked、uncertain 与 first-wins/不重试语义不变。
- architecture absence gate 仅用于平台 ID 分支与 retired wrapper absence，不替代公开行为测试。

## Findings and remediation

### F1 — P1 / `EXPOSED_PREEXISTING` / blocking / CLOSED

Hepan regular preparation 把 `preparedRuntime` 作为 `runtime` 传给真实 adapter；adapter 构造时会复制该对象。submit 前写入原对象的临时 `cookiePath` 因而不可见，真实 regular submission 会在远端调用前稳定返回 `HEPAN_CONFIG_NOT_SET`。该缺陷已存在于退役 wrapper，E3 搬迁后由本轮审计暴露，但直接违反 E3 Hepan 正常链路 acceptance。

修复：Hepan settings-backed runtime 改为向 adapter 提供 `getRuntime()`，submit 时读取当前临时 Cookie 路径；回归测试证明 prepare 阶段路径为空、submit 窗口内可见、cleanup 后重新清空。

### F2 — P2 / `EXPOSED_PREEXISTING` / blocking / CLOSED

临时 Cookie cleanup 抛错会覆盖 adapter 已确认的 accepted/rejected/uncertain 结果或主业务异常，可能把明确成功错误改写为 uncertain，同时没有安全诊断。该行为同样来自退役 wrapper，直接违反 cleanup 不覆盖业务结果与远端 observation 保真的约束。

修复：cleanup 保持 best-effort，失败仅发出不含路径/Cookie 的稳定 storage diagnostic；无论 cleanup 是否抛错，运行时立即清空 `cookiePath`，原业务结果保持不变。回归覆盖 accepted + cleanup failure。

**Deferred findings：**无。

## Bounded re-audit

复审仅覆盖 F1/F2 修复 diff、Hepan 动态 runtime 可见性、临时凭据 cleanup、已确认远端结果保真、settings/profile/media contribution、直接普通平台状态矩阵与对应回归。两个 blocking findings 均已关闭；修复未改变公开合同、schema、事实 owner、事务或远端副作用边界，未触发 escalation。

最终 dirty source state 验证：

1. finding-scoped 回归：`63 passed / 0 failed / 0 skipped`。
2. E3 Hepan/Lieju/media/settings/profile/worker/普通平台直接矩阵：`231 passed / 0 failed / 0 skipped / 13098.0606 ms`。
3. 计划 §1 baseline：`103 passed / 0 failed / 0 skipped / 6716.5606 ms`。
4. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped / 1723.5571 ms`。
5. `npm run typecheck:main`、E3 production/test 定向 ESLint 与 `git diff --check`：PASS（仅 LF→CRLF warning）。

## Conclusion / next gate

Primary Audit 与 bounded re-audit `PASS`，无 blocking 或 deferred finding。E3 尚未标记 `COMPLETE`：需把最终 production/test/doc source state 提交为 clean HEAD，并在该 HEAD 运行 closure evidence。当前 gate：`E3 COMMIT READY`。
