# 19-F — 列举网 Playwright 提交前保底与 Mode Policy

**Goal:** 在不把 transport 选择推给逐篇投稿 UI 的情况下，完成 `auto` / `playwright_only` 平台级策略，并证明 Playwright 只能在 HTTP POST 调用前保底。

**Blocked by:** 19-E `COMPLETE`。

## 主 owner / 允许修改

- 列举网 adapter 的 prepare / transport policy 组合。
- 现有 Playwright 填表 / 提交实现，使其消费 19-A–D 同一冻结 target/body/image plan。
- 既有 runtime configuration / composition 中最小的平台级 mode 注入 seam；不默认新增 Renderer 页面。

## 本包职责

1. `auto` 默认选 HTTP；只有登录需交互、HTTP 准备阶段明确不兼容或未调用 POST 的安全准备故障时才可选 Playwright。
2. `playwright_only` 直接使用既有浏览器路径，但仍消费同一城市 / 区域、纯文本 body、图片 manifest 和 outcome classifier。
3. 冻结窄的内部 mode policy，不建立文章级 transport 状态、不修改队列 identity、不在普通投稿界面让用户逐篇选择。
4. HTTP POST 已调用或是否调用无法确认时，fallback 门必须 fail closed 并返回 uncertain。
5. 保持既有手工登录、Session 保存和 stop 行为；不引入第二 browser lifecycle。

## 禁止跨界

- 不新增逐篇 HTTP / Playwright 选择 UI，不新增 transport 持久事实或 migration。
- 不复制城市 parser、body renderer、image resolver 或 outcome 状态机。
- 不将 uncertain 降级为明确失败以触发 Playwright 重发。

## Acceptance criteria / 最低验证

- [ ] `auto` 正常路径 Browser launch=0；提交前解析 / Session 故障可转 Playwright；HTTP POST 后任何故障 Playwright submit=0。
- [ ] `playwright_only` 从开始即不调用 HTTP POST，并使用与 HTTP 相同的冻结平台正文和图片 evidence。
- [ ] 城市模糊匹配 / 北京回退 / 区域最后一项在两条 transport 的合同证据一致。
- [ ] 登录失效、停止、二次 submit、进程重启和 concurrent preparation 矩阵通过。

## 停止条件

若平台级紧急 mode 必须新增 Renderer / IPC / 持久 schema 才能实现，停止并返回主任务拆成独立配置包；不在 19-F 内顺手扩大。
