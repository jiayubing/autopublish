# M02 — Critical Silent Failure Hardening

**Purpose:** 治理关键运行路径中会吞掉真实失败的空 `catch` / 无诊断 fallback，使故障保留既有安全语义与可追踪证据；不在本阶段机械清空全库所有 catch。

**Status:** `COMPLETE`；本次 closure 已完成 submission pair persistence 收口与最终门禁

**Scheduling gate:** M01 完成、独立审计/修复/合并并在新集成 `HEAD` 定向复验后调度；维护 5.5 的第二项。M02 完成并通过维护 5.5 最终门禁后才放行波次 6。

## 第一阶段 owner 范围

优先检查：

- `desktop/services/auth-service.js` 与 session/token persistence；
- `desktop/services/platform-run.js`、`desktop/worker/run-task.js`、普通平台执行链；
- `desktop/workspace-runtime.js`、`desktop/composition/workspace-runtime-composition.js`；
- submission/file persistence 与本地状态 mutation；
- `src/core/playwright.js` 及 M01 迁移后 runtime；
- 与上述调用链直接相关的关键 cleanup/diagnostic sink。

## 分类规则

每个空 catch 必须归入且只归入一种：

1. **best-effort cleanup**：允许不向上抛，但要让代码结构明确是 cleanup；必要时记录安全 debug diagnostic，不能影响主结果。
2. **optional probe/parse**：必须显式返回稳定 fallback/result，不能靠空 catch 隐式表达“失败等于不存在”。
3. **persistence/state mutation**：不得静默吞错；必须返回/抛出既有结构化错误或失败关闭。
4. **remote/process control**：不得静默吞错；必须保留安全 diagnostic，并维持 unknown/uncertain/stop 语义。

## Hard boundaries

- 不一次性修改与关键链无关的 UI listener、脚本和历史迁移器；残余项由 M06 收口。
- 不改变产品错误文案/状态机来隐藏实现异常。
- 不把敏感供应商异常、Cookie、token、正文或绝对路径塞进日志。
- 不为减少 catch 数量而删除必要 cleanup 防护。

## Acceptance criteria

- [x] 上述关键 owner 中不存在无语义的空 catch；保留的 best-effort cleanup 有明确意图和安全行为测试/注释。
- [x] auth/session persistence 失败不会被报告为成功或悄悄丢失状态。
- [x] platform/worker/workspace/submission 的 process、文件、状态写入失败会进入既有稳定错误/diagnostic/uncertain 语义。
- [x] 故障注入测试覆盖至少 persistence write/rename、child/process failure、workspace read/write 和关键 cleanup 不覆盖主错误。
- [x] 不新增敏感日志泄露，错误 metadata 仍满足仓库安全合同。
- [x] 形成残余 silent-catch inventory，明确哪些延后 M06、为何不属于关键路径。

## Residual silent-failure inventory (deferred to M06)

- `desktop/services/submission-operation-staging.js`：仅删除空 staging directory 的 best-effort cleanup；文件/状态事实已在此前步骤确认，目录删除失败不会把操作投影为完成或改变业务事实，延后 M06 统一分类。
- 其他非本次 M02 关键 owner 的空 catch：不在本次 closure 扩大范围，避免机械清理和改变既有业务语义；由 M06 按最终边界逐项处理。
