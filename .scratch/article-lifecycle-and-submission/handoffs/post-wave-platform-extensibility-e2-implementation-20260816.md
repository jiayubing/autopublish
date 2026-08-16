# Post-Wave E2 Implementation Handoff

**工作包：**`E2 — 通用消费者迁移与静态知识去重`

**执行方式：**Manual Dispatch。仅完成 E2 implementation、定向验证与本交接；未启动 Primary Audit、finding remediation、commit、merge、push 或 E3。

**基线：**`codex/jiagou @ c2f11e43b5e44ea7c90d17f7b189eda8cbe7d4b7`，其中 E1 implementation commit `6c1641ea89acfacd3c9877b6f92bfffb28d54763` 与 E1 provenance 文档均为当前 HEAD 祖先；开始执行时工作树 clean。

## Implementation scope

- `src/core/platforms.js` 从 code-owned `config/platforms.json` 的 enabled IDs 发现对应 definition/runtime module，严格拒绝未知配置字段、空/重复/非法 ID 和路径注入；未接入 workspace、环境或远端扩展源。
- workspace composition 在 loader seam 后立即投影 directory、regular submission、account inspection、login session 与 legacy queue 的窄 collection，并分别下传给投稿目录、preparation、账号检查、登录、workbench、post-processing、maintenance 与 shutdown。
- definition `displayName` 贯穿 main read model、IPC contract、bridge/types 和 Renderer；删除 Renderer 平行 display-name map，regular queue group 复用当前 queue definition projection。
- 新增 `desktop/security/external-links.js`：固定应用 host 与 enabled definitions 的 exact hosts 合并，仅允许无 userinfo、无非默认端口的 HTTP/HTTPS exact hostname；workspace、环境与远端内容不能扩大 allowlist。
- desktop task pause/dispose 遍历实际 loaded login session ports；单个平台 cleanup failure 只形成安全诊断，不覆盖主错误或阻止其余 cleanup。
- 删除运行时 `liejuInput`、`toutiaoInput`、`hepanInput` 重复字段；普通平台继续使用受控 `input/<scanDir>`，paid media 的真实具名 `mediaInput` 保留。
- publication target、workbench queue reader 与 alpha package inventory 改由 definition projection/target kind/enabled platform runtime files 驱动；Hepan Python/vendor 等特殊资产仍由显式 package gate 验证。
- E3 范围内的 Hepan preparation override 与 Lieju client-profile resolver 分支有意保留；未修改普通队列状态机、文章生命周期、订单、attention、publication writer 或远端结果语义。

## Validation on final implementation source state

在 `auto—publish/` 实际运行：

1. E0 §1 baseline：`101 passed / 0 failed / 0 skipped / 6855.7335 ms`。
2. E2 直接合同与回归集合（definition、security、session cleanup、account、IPC、workbench、workspace、regular queue、18-B、25-C、post-processing、publication target、package inventory）：`137 passed / 0 failed / 0 skipped / 1698.2761 ms`。
3. Phase 06 production IPC fixture matrix、Phase 08 cleanup gates、article lifecycle 与 C3 package verifier：`74 passed / 0 failed / 0 skipped / 116189.9108 ms`。
4. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped / 1836.7716 ms`。
5. `npm run typecheck:renderer`、`npm run typecheck:bridge`、`npm run typecheck:main`：全部 PASS。
6. `npm run build:renderer`：PASS；Vite 仅报告既有的大 chunk advisory，不影响构建结果。
7. E2 production/test 文件定向 ESLint：PASS。
8. `npm run pack:smoke`：PASS；生成本地 dirty alpha directory package，最终输出 `Alpha package contents OK`。只使用本地合成 smoke，不执行远端操作。
9. `git diff --check`：PASS；仅显示 working-copy LF→CRLF warning。
10. 静态残影检查：production 中无 `PLATFORM_DISPLAY_NAMES`、`getPlatformDisplayName`、三个具名普通平台 input field 或 `PLATFORM_SESSIONS`；`loadedPlatforms` 只留在 loader 后的 composition 初始拆分和 worker 局部 normalized collection。

验证过程中曾有一组旧 regular queue fixture 仍传入 E1 宽 record，导致扩展组合集出现 21 个失败；fixture 按 E2 窄公开合同迁移后，直接集合与上述最终回归全部通过。该中间失败不作为最终 PASS evidence。

## Boundaries and unrun acceptance

- 未运行 full `npm test`；E2 implementation gate 已覆盖计划规定的直接合同、101 baseline、Phase 06/08、typecheck/build、packaging contract 与实际 alpha package smoke，full suite 留给 E6 最终组合 gate。
- 未执行真实 Electron 账号登录、投稿、图片上传、付费、取消、订单核对、生产数据库或生产迁移；这些操作未经本次授权且 E2 禁止。
- 未启动 E2 Primary Audit；当前改动尚未 commit、merge 或 push，也未进入 E3。

## Git / next gate

- HEAD：`c2f11e43b5e44ea7c90d17f7b189eda8cbe7d4b7`。
- 工作树包含 E2 production/test diff、本 handoff 与计划 gate 更新；本地 build/package 生成物不纳入源代码交接。
- 下一 gate：`E2 PRIMARY AUDIT READY`。
