# 13 — 删除旧测试、依赖与构建残余并固化门禁

**What to build:** 所有已迁移 production seam、writer、adapter、hook、bridge、测试、依赖和脚本完成 contract 收缩；CI 自动保护目标依赖方向、唯一 owner/writer、真实 capability reachability、模块规模审查和 production package 边界，旧复杂性不能通过新 wrapper 回流。

**Blocked by:** 03 — 深化 OperationalStore 内部结构；04 — 深化内容存储与文章生命周期；05 — 收敛发布、提交与平台执行编排；06 — 收敛 Desktop 组合根与 Typed IPC；10 — 收缩 Renderer 兼容出口；11 — 深化 Auth 策略实现；12 — 深化诊断、制品与证据工具链

**Status:** ready-for-agent

## 必读输入

- Tickets 01–12 handoff中的删除候选、0 引用证据、保留例外、schemas 和 fixed checks。
- Phase 8 清理清单全部条目、package manifests/build configs、architecture tests、test inventory 与 production archive verifier。
- 原 review findings/OPT disposition；原审查文档只读，不修改历史记录。

## 开始门禁

1. 确认所有 blocker 完成且没有未处理 interface/schema 偏差。
2. 重新从 production root 生成 source/import/export/caller/test/ASAR 清单，不能信任早期计数。
3. 为每类待删对象写 absence/architecture red gate，先证明当前 residual 再删除。

## 执行过程

1. 按 production seam → writer → compatibility adapter → hook/bridge → tests → dependencies/scripts → docs reference 顺序收缩。
2. 每删除一组立即运行稳定 interface、真实 caller、持久化/故障和 package 回归；不要一次批量删除后再猜失败来源。
3. 测试采用 replace-don't-layer：新 interface 测试覆盖同一风险后，删除穿透旧 implementation 或重复行为测试；保留复杂算法、迁移和故障诊断所需内部测试。
4. 检查 test double 能力不得超过 production adapter；所有 skip 必须有平台原因和 issue，不能跳过重构失败。
5. 清理未使用/重复依赖、重复工具链和无 owner scripts；生成输出、fixtures、测试和敏感数据不得进入 production package/Git。
6. 固化 CI gates：依赖方向、唯一 writer/owner、capability reachability、legacy source/archive absence、模块规模/例外清单、package contents 和敏感扫描。
7. 对保留的 >400 行第一方模块逐项复审；>600 行只有纯声明/生成/第三方或明确设计理由才能通过，理由写入最终 module map。

## 模块边界

- Architecture gate 读取真实 production roots，不靠人工维护的伪列表代替可达性。
- 规模 gate 是审查门，不鼓励机械拆函数或 shallow wrapper。
- Package verifier 检查制品，不改业务状态；CI YAML 只编排命令。

## 验收标准

- [ ] Phase 8 production seam/writer/adapter/hook/bridge 清单全部为 0 引用并删除或有明确保留理由。
- [ ] `src → desktop`、Domain/Application → implementation、Renderer → Node/infrastructure、worker/adapter → store writer 均为 0。
- [ ] 测试无旧/新重复、无无理由 skip、无超能力 test double、无仅为旧实现保留 wrapper。
- [ ] 无未使用依赖、重复工具链、无 owner scripts 或 tracked generated output。
- [ ] production package 不含测试、fixture、secret、原始诊断或旧 source。
- [ ] 模块规模/职责审查由 CI 保护，并允许少量有证据的深模块例外而非机械行数拆分。

## 必跑验证

- architecture、capability inventory/reachability、legacy absence、test discovery、package contents/sensitive scan。
- lint、三套 typecheck、format check、完整 root/Auth suites、Renderer/preload build、production directory/package smoke、`git diff --check`。

## 交接与停止条件

- 记录逐项删除表、静态 0 引用、测试 replace 映射、依赖变化、模块例外和 CI check names。
- 若任一旧 writer/compatibility path 仍有真实 caller，停止并退回负责 ticket；不得在本 ticket 添加 wrapper。
- 未经明确授权不升级普通依赖大版本、不自动提交。

