# Post-Wave E1 平台 definition 与 capability-aware loader 实施交接

**工作包：**`E1 — 平台 definition 与 capability-aware loader`

**基线：**`codex/jiagou @ 7747e64743ad3441097df1294874bc120772a1ad + E0 documentation diff`

**执行模式：**Manual Dispatch。完成 implementation、定向回归与 handoff；未执行 Primary Audit、commit、merge、push 或 E2。

## 实施结果

- 新增 exact、immutable `PlatformDefinitionV1` parser，覆盖顶层/capability/contribution exact keys、ID/display/scanDir/host、resource/image invariants、重复 ID 与稳定 error code。
- 四个内置平台各自拥有 code-owned `definition.js` 与 `platform.js`；启用配置仍只保存 ID。冻结投影为：Lieju regular/login/inspect/image 且无 legacy，Toutiao regular/legacy/login/inspect，Hepan regular/legacy/inspect + settings/runtime artifact contribution，media resource + settings 且无普通执行 port。
- `src/core/platforms.js` 只输出 immutable normalized record：definition、submission directory entry 与声明过的窄 ports。缺失、额外、形状非法的 port 在装载期 fail-closed；单个平台失败不会隐藏其他合法平台。
- loader 诊断只投影稳定 code 与安全 `platformId/action/schemaVersion/capability/port` metadata；全局 diagnostic contract 增加对应安全字段，不记录 definition 原值、host/path、Cookie 或供应商异常。
- 移除四个 adapter 的 default 宽对象 export；协议测试继续通过具名 factory/helper 访问平台内部实现，没有 compatibility export。
- 普通 admission/preparation、账号检查、登录、legacy workbench/worker、投稿目录和 maintenance 的直接调用链改用窄 port。Lieju 不再进入 legacy worker，media 不再靠平台 ID 特判阻断。
- Toutiao 每次 module 创建独立 CommonJS runtime；Lieju factory、Hepan instance runtime override 与 worker active-platform cleanup 均保持 workspace/run 隔离，不共享 mutable adapter/session 状态。
- Hepan runtime artifact contribution 只返回 exact requirement projection；builder include 仍由既有 package owner 显式控制。

## 验证

在 `auto—publish/` 执行：

1. 最终 E1 + E0 baseline 扩展集：`107 passed / 0 failed / 0 skipped / 6797.3503 ms`。
2. 直接 worker/IPC/queue/maintenance/Hepan/diagnostic 回归：`78 passed / 0 failed / 0 skipped / 2826.9165 ms`。
3. 最终 production/desktop/runtime/C3 package contract：`40 passed / 0 failed / 0 skipped / 1780.8691 ms`。
4. `tests/phase-08-cleanup-gates.test.js`：`5 passed / 0 failed / 0 skipped / 103631.5116 ms`；该次结果早于最后一处 E1 source correction，不作为最终 source-state gate，只保留过程 evidence。
5. E1 production/test 文件定向 ESLint：PASS。
6. `git diff --check`：PASS（仅 Git 的既有 LF→CRLF working-copy 提示）。

最终 107-test 扩展基线、40-test package contract 与定向 ESLint 均在最后一处 production source correction 后重跑并 PASS。

## 未运行与剩余 gate

- 未执行 E1 Primary Audit；当前 gate 为 `E1 PRIMARY AUDIT READY`，E1 尚不能标记 `COMPLETE`，不得进入 E2。
- 未运行 full `npm test`、Renderer typecheck/build、真实 `electron-builder` package smoke；Manual Dispatch 未授权最终整套门禁，E1 最低验证已覆盖 definition/loader、直接调用链和 package contract。
- 未执行真实登录、投稿、图片上传、付费、取消或生产迁移；本工作包不需要且没有授权。
- E2 的 display-name、external-host、workspace named path、Renderer/static metadata 去重未提前实施。

## Git / provenance

- HEAD 保持 `7747e64743ad3441097df1294874bc120772a1ad`。
- E0 文档和本次 E1 source/test/handoff 均为未提交 working-tree diff。
- 未 stage、commit、merge、push。
