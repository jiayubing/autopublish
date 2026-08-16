# Post-Wave E2 Primary Audit 与 Bounded Re-audit

**工作包：**`E2 — 通用消费者迁移与静态知识去重`

**审计范围：**E2 worktree diff、计划 E2 acceptance、definition/loader 后的窄 collection、workspace composition、account/login/workbench/post-processing/shutdown 直接消费者、displayName IPC/bridge/Renderer 链、external-host trust boundary、workspace `input/<scanDir>`、alpha package verifier 与直接测试。未重审 E0/E1 已关闭 finding，未进入 E3。

## Checked invariants

- 通用消费者只接收其所需窄 role collection；E3 的 Hepan settings preparation 与 Lieju client-profile 特殊分支未被伪装成通用能力。
- displayName 由 definition 贯穿 main read model、IPC contract、bridge/types 与 Renderer，不保留 Renderer 平行表。
- external-host allowlist 只来自 code-owned enabled definitions 与固定应用 host，严格拒绝子域冒充、userinfo、非默认端口、非 HTTP(S) 和 workspace/环境扩展。
- workspace 切换构造新的 adapter/session collection；shutdown 遍历实际 login ports，cleanup failure 不覆盖主错误。
- 普通平台输入位于受控 `input/<scanDir>`；不存在三个具名普通平台 workspace path field。
- package verifier 对被验证 artifact 自身的 enabled config、definition/runtime module 与 E2 新 runtime owner fail-closed；Hepan 特殊资产继续显式验证。
- 未新增或修改 production 队列状态机、文章生命周期、订单、attention、publication writer、自动 retry 或真实远端副作用。

## Findings and remediation

### F1 — P2 / `INTRODUCED_BY_CHANGE` / blocking / CLOSED

`scripts/verify-alpha-package.js` 的动态平台 inventory 从当前源码 `config/platforms.json` 生成，而不是从被验证 ASAR 的配置生成；包内启用额外平台但缺 definition/runtime 时 verifier 会错误放行，同时新引入的 `desktop/security/external-links.js` 未进入 required inventory。

修复：静态 required inventory 增加 external-link policy 与 platform core owners；`verifyPackage()` 从 ASAR 提取并 exact 校验 packaged `config/platforms.json`，再要求该 artifact 启用平台的 definition/runtime。合成 package 测试覆盖 packaged subset、缺 synthetic runtime、未知配置字段与缺 external policy。

### F2 — P2 / `INTRODUCED_BY_CHANGE` / blocking / CLOSED

删除 `hepanInput` 后，Hepan adapter 重新使用硬编码 `input/hepan`，使运行时输入路径不再由 definition `scanDir` 单一驱动。

修复：Hepan platform module 将已验证 definition scanDir 显式下传 adapter；adapter 只在安全 scanDir 存在时解析 workspace input。行为测试证明自定义 definition-owned scan directory 被使用，旧硬编码目录不会被扫描。

**Deferred findings：**无。

## Bounded re-audit

复审仅覆盖 F1/F2 修复 diff、artifact-side inventory、Hepan input resolution、definition/loader、直接 package/path/security callers 与对应回归。两个 blocking findings 均已关闭；修复未改变公开产品合同、schema、事实 owner、事务或远端副作用边界，未触发 escalation。

最终 dirty source state 验证：

1. E2 直接合同与回归：`139 passed / 0 failed / 0 skipped / 1790.5798 ms`。
2. `npm run test:packaging`：`49 passed / 0 failed / 0 skipped / 2247.5546 ms`。
3. `npm run typecheck:main`、`npm run typecheck:bridge`、`npm run typecheck:renderer`：PASS。
4. finding-scoped ESLint 与 `git diff --check`：PASS（仅 LF→CRLF warning）。
5. `npm run pack:smoke`：PASS，最终输出 `Alpha package contents OK`；只使用本地合成 smoke。

## Conclusion / next gate

Primary Audit 与 bounded re-audit `PASS`，无 blocking 或 deferred finding。E2 尚未标记 `COMPLETE`：按 `EXECUTION-PROTOCOL.md` 与 `AUDIT-PROTOCOL.md`，仍需获得 commit 授权，将最终 production/test/doc source state 提交为 clean HEAD，并在该 HEAD 运行 closure evidence。当前 gate：`E2 COMMIT READY`。

