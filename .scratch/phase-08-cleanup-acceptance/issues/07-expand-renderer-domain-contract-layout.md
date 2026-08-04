# 07 — 扩展 Renderer 分域类型与 Bridge 布局

**What to build:** 在保持全部现有 Renderer 能力、DTO 和行为不变的前提下，将共享类型目录和 bridge 出口按 content、generation、platform、media、settings、workspace、auth、publication 等现有业务域并列展开，为分批迁移提供清晰入口；旧 barrel 仅作为有期限的迁移 re-export。

**Blocked by:** 06 — 收敛 Desktop 组合根与 Typed IPC

**Status:** ready-for-agent

## 必读输入

- Ticket 06 的 canonical capability inventory、preload namespaces 和 wire schema。
- Renderer root、共享类型、domain bridges、feature public surfaces 与全部 production imports。
- Phase 6 handoff中的 contract/bridge/inventory 决策和当前 Renderer typecheck/build tests。

## 开始门禁

1. 确认 Ticket 06 完成且 IPC/preload surface 已冻结。
2. 生成共享类型和 bridge symbol 的真实 import/caller 图，按业务域列出迁移批次。
3. 为 symbol identity、domain ownership、禁止循环依赖和旧 barrel 最终删除建立 expand–contract 清单。

## 执行过程

1. 新增按现有业务域组织的内部类型模块，只移动既有 type/interface，不添加字段、channel 或 capability。
2. 将 wire DTO、feature snapshot、view model 分开；相同字段只保留一个权威定义，必要 projection 留在 bridge/feature 边界。
3. 新增明确的 domain bridge 入口，继续委托既有 preload namespace；不引入通用字符串 method dispatch。
4. 旧共享 barrel 暂时仅 re-export 新位置，写静态清单列出所有剩余 caller 和删除 ticket（10）。
5. 迁移公共 feature/测试 fixture 的低冲突 imports，保证 Tickets 08/09 可按 domain 并行工作。
6. 运行类型与 runtime contract parity，证明 wire validator 和运行时行为未因 TypeScript relocation 改变。

## 模块边界

- Wire contract 描述跨进程数据；feature snapshot 描述 Renderer 可观察状态；View props 只描述渲染需要。
- Bridge 只调用一个 preload namespace 并转换安全错误，不拥有业务缓存或跨 feature 状态。
- 临时 re-export 不得增加逻辑、fallback 或长期兼容承诺。

## 验收标准

- [ ] 现有 type/interface 按业务域有唯一权威定义，无字段或行为变化。
- [ ] IPC wire DTO、feature snapshot 和 View props 不再混在一个巨型共享类型文件。
- [ ] bridge 按 domain 有明确入口，无动态 namespace/method 调用。
- [ ] 旧 barrel 只含纯 re-export，所有 remaining caller 映射到 08 或 09，删除边指向 10。
- [ ] 无新循环依赖、无 Renderer → desktop/infrastructure 引用。
- [ ] runtime contract、capability inventory、typecheck 和 build 与 Ticket 06 基线一致。

## 必跑验证

- bridge/contract/inventory/architecture 定向测试。
- renderer/bridge typecheck、Renderer build、lint、完整 root suite、`git diff --check`。

## 交接与停止条件

- 记录新 domain 布局、symbol 迁移表、剩余旧 import 和 08/09 分工。
- 若发现现有 DTO 必须增删字段或 capability 才能迁移，停止并重开 Phase 6。
- Ticket 07 不允许删除旧 barrel，也不自动提交。

