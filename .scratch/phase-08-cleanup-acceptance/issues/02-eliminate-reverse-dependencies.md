# 02 — 消除 `src → desktop` 反向依赖

**What to build:** workspace 路径、Playwright/runtime 资源解析等基础能力沿目标依赖方向提供，`src` 内层不再导入 Electron/desktop implementation；production 与测试通过同一稳定 seam 获得这些能力，静态门禁能阻止反向依赖回流。

**Blocked by:** 01 — 冻结 Phase 8 基线与清理决策图

**Status:** COMPLETE

## 必读输入

- Ticket 01 的调用图、反向依赖清单与 Phase 8 handoff。
- 目标架构的依赖方向、ContentIdentity、组合根与目录原则。
- 当前 workspace path factory、内容 store、Playwright/runtime resolver、Hepan runtime path 和真实 composition caller。
- 覆盖 workspace/path/link、runtime packaging、platform adapter 的现有 contract tests。

## 开始门禁

1. 确认 Ticket 01 已完成且没有要求重开前序阶段的未决 interface 问题。
2. 重跑当前反向引用静态查询并保存精确命中；不能只依赖 Ticket 01 的旧计数。
3. 写一个会在任一 `src → desktop` production import 存在时失败的架构红测。

## 执行过程

1. 将纯路径/资源规则放到依赖中立的实现位置，或由 composition root 注入现有 seam；不要为测试额外暴露 public setter。
2. 先扩展新位置并保持测试绿色，再按 workspace/content、Playwright、Hepan/runtime 三个批次迁移真实 caller。
3. 每迁移一批，运行对应路径安全、普通文件、symlink/junction、packaged/development 分支和 caller 回归。
4. 所有 caller 迁移后删除旧 re-export、fallback 和 desktop 反向入口；不留下长期 compatibility wrapper。
5. 收紧 architecture test，使 `src`、Domain/Application、Renderer/worker 的禁止依赖由真实 production source 自动检查。
6. 复核模块接口：caller 只提供业务需要的 root/context，不学习 ASAR、Electron app path 或平台脚本内部顺序。

## 模块边界

- 路径策略只解析/校验路径，不执行任务、不修改用户数据。
- Runtime resolver 只解析资源并返回安全结果，不启动 Playwright/Python/Electron。
- Composition root 只创建和注入依赖，不复制路径算法。
- 不新增 Domain/Application 产品接口，不改变 workspace schema 或业务 identity。

## 验收标准

- [ ] 第一方 production `src → desktop` 引用为 0，并由架构测试读取真实 source roots 保护。
- [ ] Domain/Application 不引用 Electron、IPC、具体数据库或平台 implementation。
- [ ] Renderer 不引用 Node/desktop/infrastructure；worker/adapter 不获得 OperationalStore writer。
- [ ] packaged/development runtime 解析、workspace 路径和 link 安全行为保持不变。
- [ ] 旧 re-export、源码 fallback 和仅为迁移存在的 wrapper 已删除。
- [ ] 新内部模块职责单一，公共参数没有增加 caller 必须理解的实现细节。

## 必跑验证

- 架构 seam、workspace/path/link、runtime resolver、Hepan/Playwright packaging 定向测试。
- lint、main/bridge/renderer typecheck、packaging contracts。
- 完整 root suite；随后 `git diff --check`。

## 交接与停止条件

- 在 Phase 8 handoff 记录移动的责任、删除的旧入口、0 引用证据和稳定接口。
- 若只能通过扩大 Domain/Application interface 或让 caller 传递 desktop implementation 才能消除依赖，停止并重开所属阶段。
- 若 packaged production 路径需要源码 fallback 才能通过，停止；不得放宽 fail-closed 规则。
- 不自动提交。
