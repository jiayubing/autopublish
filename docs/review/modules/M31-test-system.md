# M31 测试体系与架构约束深度审查

> 状态：已完成（2026-07-24）。

## 发现列表

### TEMP-M31-01：默认测试命令漏跑 `.mjs` 测试文件

- 分类：测试覆盖 / 发布门禁
- 严重程度：中
- 置信度：高
- 位置：`auto—publish/package.json:9`；`tests/platform-submission-controller.test.mjs`。
- 问题：`node --test tests/*.test.js` 只匹配 `.js`，仓库已有 `.mjs` 测试不会进入 `npm test`；CI 直接调用 `npm run test`，因此该测试长期不在默认门禁内。
- 修复方向：显式列出 `.js` 与 `.mjs`，或使用 Node test runner 的目录/多扩展发现方式，并在 CI 输出实际收集文件清单。

### TEMP-M31-02：默认测试套件包含与当前生产接口漂移的架构 seam 断言

- 分类：测试契约 / 架构约束
- 严重程度：中
- 置信度：高
- 位置：`tests/renderer-workbench-controller-seams.test.js`；`scripts/verify.js` focused plan 列表。
- 问题：已定向执行的 renderer controller seam 测试 2/2 失败，仍要求已经弃用的 `usePlatformWorkbenchController` / `useArticleManagementSnapshot` hooks；当前实际 controller 接口测试 `platform-submission-controller.test.mjs` 6/6 通过。由于失败文件是 `.js`，它会进入默认 `npm test` 并使全量门禁变红；这属于测试契约漂移，不自动证明生产 controller 已坏。
- 修复方向：按当前 controller seam 重写架构断言，或若 hook 是仍有效的架构决策则恢复生产接口；门禁必须只有一个可执行、无互相矛盾的 seam 契约。

## 其他覆盖核对

认证与 M22–M27 定向测试覆盖较强，但生产 packaging 只做配置文本断言；没有真实 Electron 安装、TLS/Tunnel、断电/磁盘满、外部站点和灾备恢复测试。测试命令存在 `.mjs` 漏跑和嵌套 workflow 漏发现的组合风险。

## 模块审查结论

M31 深审完成，保留两条中风险测试门禁 finding；测试数量不能替代默认命令、CI 触发和生产 seam 的可执行证据。
