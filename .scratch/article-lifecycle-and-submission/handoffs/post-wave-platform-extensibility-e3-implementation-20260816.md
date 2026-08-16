# Post-Wave E3 Implementation Handoff

**工作包：**`E3 — 特殊平台 contribution 归位`

**执行方式：**Manual Dispatch。已完成 E3 implementation、定向验证与本交接；未启动 Primary Audit、finding remediation、commit、merge、push 或 E4。

**基线：**`codex/jiagou @ 5a31857550feecad50991b223961038a5e79305c`，其中 E2 implementation/audit closure 均为当前 HEAD 祖先；开始执行时工作树 clean。

## Implementation scope

- Hepan 平台模块现在直接拥有 settings-backed regular preparation 与 account inspection；临时 Cookie 只在真实 submit/legacy worker run 前生成，并在成功、失败或停止路径清理。删除共享 `hepan-regular-preparation-adapter.js` 与 `platform-account-runtime.js`。
- Hepan settings adapter 提供具名 legacy worker runtime contribution；`platform-settings-service` 只聚合 code-owned runtime context、interval、timeout 与 cleanup，桌面任务和 worker 不再识别 Hepan ID 或具名 payload 字段。
- workspace composition 只遍历 definition 已声明的 `settingsContribution` / `clientProfileContribution`。Hepan/media settings adapter 由各自平台模块创建；Lieju profile reader 通过 content owner 的 `getClientPublicationProfile` 读取 claimed client 的 `lieju` profile。
- regular preparation 只按 loader 投影的 profile-reader collection 注入资料，并在 required fields 不完整时 fail-closed；不回退全局配置、环境路径、默认账号或其他客户资料。
- media 继续只有 resource/settings projection，没有 regular submission port；未修改普通队列、文章生命周期、订单、attention、publication writer、schema 或远端结果合同。
- architecture absence gate 证明 workspace composition、desktop task 与 worker 不含 Hepan/Lieju 分支，且两个退役共享 wrapper 文件不存在。

## Validation on final implementation source state

在 `auto—publish/`、基线 HEAD 加当前 E3 dirty diff 上实际运行：

1. E3 Hepan settings/env/application、account、temporary secret、worker runtime；Lieju profile/browser/HTTP；media/definition；三平台 accepted/rejected/group-blocked/uncertain 直接矩阵：`202 passed / 0 failed / 0 skipped / 6849.1635 ms`。
2. 计划 §1 跨平台/图片/工作区 baseline：`103 passed / 0 failed / 0 skipped / 6732.2362 ms`。
3. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped / 1747.9597 ms`。
4. `npm run typecheck:main`：PASS。
5. E3 production/test 文件定向 ESLint：PASS。
6. `git diff --check`：PASS；只有 working-copy LF→CRLF warning。

## Boundaries and unrun acceptance

- 未运行 full `npm test`、bridge/Renderer typecheck/build 或实际 alpha package smoke；E3 没有 IPC/Renderer/asset include 变更，完整组合门禁与 package smoke 留给 E6。
- 未执行真实登录、投稿、图片上传、付费、取消、订单核对、生产数据库或生产迁移；这些操作未经本次授权且 E3 禁止。
- 未启动 E3 Primary Audit。当前 implementation 尚未 commit；计划 gate 仅推进到 `E3 PRIMARY AUDIT READY`，未进入 E4。

## Git / next gate

- HEAD：`5a31857550feecad50991b223961038a5e79305c`。
- 工作树包含 E3 production/test diff、本 handoff 与计划 gate 更新；无已知无关用户改动。
- 下一 gate：`E3 PRIMARY AUDIT READY`。
