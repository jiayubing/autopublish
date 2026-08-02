# 04 — 深化内容存储与文章生命周期

**What to build:** 客户、资料、文章、模板、生成 batch、trash 与永久删除继续通过现有 Content application surface 工作，但身份规范化、路径解析、文件事务、删除/恢复计划和 recovery cursor 被封装在各自内聚模块；caller 不再拼路径或掌握临时文件顺序。

**Blocked by:** 02 — 消除 `src → desktop` 反向依赖

**Status:** COMPLETE

## 必读输入

- Ticket 01 的内容 owner/长模块决策和 Ticket 02 的 workspace/path seam。
- ContentIdentity、article/content stores、generation batch store、article removal/recovery 当前 interface。
- Phase 1/5 handoff及 client/article/template/generation/trash/removal tests。
- 内容 migration、path traversal、symlink/junction、disk failure 与 rollback fixtures。

## 开始门禁

1. 确认 Ticket 02 已完成且所有内容 store 使用同一安全路径 seam。
2. 冻结现有 Content IDs、sidecar/Markdown 契约、removal token/fingerprint/TTL 与 error codes。
3. 为 facade 可观察行为和生产 caller 写拆分前 contract test，禁止测试直接依赖拟抽取 helper。

## 执行过程

1. 将 article normalization/serialization、research/material/template snapshot、path policy、atomic file transaction 分成内部职责。
2. 将 trash preview、commit、permanent-delete confirmation、recovery cursor 与 queue residue 处理按状态机职责拆分，保持一个 application lifecycle owner。
3. 按 article read/write、generation batch、trash/removal 三个可独立验证批次迁移真实 caller。
4. 每批覆盖文件写入前后失败、rename/rollback、重复执行、stale token、symlink/path escape 和进程重启。
5. 删除旧 optional finder、caller 路径拼接、启动一次恢复器、兼容字段和实现穿透测试，但只在 production/migration 引用为 0 后删除。
6. 复核接口深度：View/IPC 只发送 identity/command，Content module 隐藏文件名、目录布局和操作顺序。

## 模块边界

- ContentIdentity 只负责逻辑 identity 与安全位置解析，不读写业务内容。
- Store 负责原子内容持久化，不决定 Renderer 文案或 publication 状态。
- Removal application module 负责计划、状态转换与恢复，不直接拥有 OperationalStore writer。
- Migration adapter 仅解释受支持旧格式；unknown/corrupt 输入保持 fail-closed。

## 验收标准

- [ ] client/article/template/generation/trash 的现有用户行为、DTO 和 identity 保持稳定。
- [ ] caller 不包含客户路径拼接、optional unique finder 或文件事务顺序。
- [ ] 删除、恢复和永久删除在 stale token、重复 runner、磁盘/rename 失败后保持幂等且可恢复。
- [ ] path traversal、symlink/junction、普通文件和 workspace 包含关系全部 fail-closed。
- [ ] migration/旧内容兼容只保留有证据的 reader，无旧 production writer。
- [ ] 长实现已按职责拆分，测试主要通过稳定 facade 验证可观察结果。

## 必跑验证

- article/content stores、generation batch、trash/removal/recovery、content migration 和 link-security 全套测试。
- 对应 IPC/Renderer caller 回归、lint、三套 typecheck、完整 root suite、`git diff --check`。

## 交接与停止条件

- 记录 Content 模块图、事务/恢复不变量、删除旧路径、数据 fixture 和失败注入结果。
- 若必须更改 Content application interface 或业务语义才能拆分，停止并重开 Phase 1/5。
- 不访问真实内容库，不执行真实不可恢复删除，不自动提交。
