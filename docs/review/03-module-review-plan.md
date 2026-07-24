# 下一阶段模块深度审查计划

> 目标：把本阶段的 31 个“已映射、待深审”模块转化为可执行审查批次。  
> 本文只安排审查顺序和证据目标，不提出最终优化方案，也不授权修改代码。

## 1. 排序原则

1. 先审会造成秘密泄露、重复投稿/扣费、不可恢复数据或认证不可用的路径。
2. 先固定权威状态机/身份，再审依赖它的 submission、worker、attention 和 UI。
3. 先审生产实际 seam，再判断旧 hook/runtime/test 应如何解释；不要以当前红测试反推生产必然错误。
4. 外部系统结论必须区分代码事实、生产配置和现场行为；必要时列为待验证，不模拟成功事实。
5. 每个模块输出独立 findings、覆盖范围、已读文件、未覆盖路径和测试证据；不得把“测试通过”等同于“模块深审完成”。

## 2. 审查波次

### 波次 0：补齐现场事实与可执行门禁

| 任务 | 模块 | 目的 | 可并行 |
|---|---|---|---|
| 确认 media 生产 URL/TLS、通用 jobs 是否允许 media | M13、M27 | 决定 R2/R3 的真实生产影响 | 与 auth 现场核对并行 |
| 确认 GitHub 仓库根、CI/CD/签名发布事实 | M30、M31 | 建立后续审查的可信回归门禁事实 | 是 |
| 确认 J4125 Tunnel、v1 DB、backup/RPO/RTO | M28、M29 | 区分机制风险与当前部署风险 | 是 |
| 建立 failing-test 清单 | M31 | 至少包含当前 controller seam 2 个失败和漏跑 `.mjs` | 是 |

这一步只收集信息和运行只读验证，不修复。

### 波次 1：发布事实与付费媒体安全（最高优先）

顺序依赖：

```text
M22 Publication identity/state/ledger
  → M20 Submission export/batch/action
  → M13 Core jobs + M27 Paid media
  → M24 Platform task/worker
  → M23 Attention/management read models
```

#### 1A. M22 Publication 领域与账本

审查维度：文章/目标聚合键、状态转换、reservation、attempt、lock 崩溃恢复、原子写、reconcile、内容变更、并发多窗口。先产出权威状态与不变量表，供后续模块引用。

#### 1B. M20 投稿导出与 batch/action

审查维度：资格快照、sidecar/fingerprint、预览→执行 TOCTOU、重复占位、cancel/retry/cleanup、部分失败、batch 与 ledger 一致性。

#### 1C. M13 + M27 通用 jobs 与付费媒体

审查维度：HTTP/TLS、API Key、resource target、通用入口绕过 ledger、费用/重复投稿、remote success/local failure、订单同步、分页/容量。M27 的网络安全可与 M13 的状态接线并行，但汇总结论必须以 M22 不变量为准。

#### 1D. M24 平台 worker

审查维度：主/子进程协议、heartbeat/watchdog、pause/stop/kill 时序、remote-started 边界、uncertain、进程退出、临时 secret 清理、runId 过期。

#### 1E. M23 Attention/management/invalidation

在 publication/submission 状态语义固定后，审查派生优先级、幂等动作计划、snapshot revision、缓存失效、读写所有权。

### 波次 2：数据破坏与内容生命周期

顺序依赖：

```text
M18 Article aggregate
  → M19 Trash/removal transaction
  → M21 Generation→submission handoff
```

- **M18**：双文件写入、文章身份/版本、审核/就绪语义、并发编辑、来源快照、迁移兼容。
- **M19**：preview token、TOCTOU、事务 cursor、跨 store 补偿、恢复/永久删除、symlink/path、重复执行。
- **M21**：batch revision、文章/目标身份、部分交接、幂等与旧快照。

M14（资料/研究/模板）可以与 M18 并行，但其身份和来源结论需要在 M18 汇总。

### 波次 3：生成、采集与 AI 数据外发

可并行两条轨道：

| 轨道 | 模块 | 先后关系 | 重点 |
|---|---|---|---|
| 生成 | M14 → M15 → M17 | 内容源/模板 → AI → batch | prompt 数据最小化、timeout/retry、并发幂等、暂停/取消、配置指纹 |
| 采集 | M12 → M16 | runtime → Doubao | 浏览器登录、DOM 解析、队列状态、停止/恢复、profile/诊断隐私 |

横向核对：外部 AI/豆包收到哪些客户材料；日志/错误是否携带 prompt、API Key、Cookie、文件路径。

### 波次 4：普通平台与河畔 adapters

- **M25 头条/列举**：可并行审查两个 adapter，共用 M12 runtime 与 browser-session-lifecycle 结论；重点是 DOM 选择器、账号/会话、远端确认、uncertain、关闭/恢复。
- **M26 河畔**：单独审查 Node→Python payload、Cookie/临时文件、vendor path、HTML/Markdown/图片、HTTP timeout/重试和远端状态判定。
- 这些模块最终与 M24 worker、M22 ledger 做一次端到端状态核对。

### 波次 5：Renderer 与 IPC seam

先后关系：

```text
M05 Bridge contracts
  → M07 Content UI + M08 Platform UI + M09 Media UI（可并行）
  → M06 App/Gates
  → M10 Settings/confirmation
```

- M05 先核对 preload/IPC/bridge 三份命名、DTO、错误码和事件；确认 `publish-log`、invalidation 重复订阅和过宽 content bridge。
- M07/M08 重点重建“生产 controller/hook/seam”事实，解释红色架构测试；审查 request identity、client switch、刷新竞态和确认状态。
- M09 重点审查资源分页、请求取消、内存/IPC clone、余额/订单敏感信息。
- M06 重点审查 Gate 生命周期、lazy view、全局订阅与卸载。
- M10 重点审查秘密不回显、配置 test/save 语义、存储清理与确认可访问性。

### 波次 6：认证、部署与灾备

可并行两条轨道，但最后必须联合演练：

| 轨道 | 模块 | 重点 |
|---|---|---|
| 客户端/领域 | M02、M28 | token rotation/replay、设备名额、锁定/限速、代理来源、时钟、错误分类、认证恢复状态 |
| 存储/运维 | M29、M30 | v1→v2 migration、backup destination、restore 不创建空库、WAL/磁盘/只读、CLI wrapper、container/签名/CI |

最后以一个只读灾备检查表验证：备份源与目标身份、校验前存在性、恢复到隔离路径、schema/数据量、服务启动、RPO/RTO 证据。是否实际执行破坏性演练需要单独授权。

### 波次 7：平台基础、日志、测试和架构收口

- **M03/M04/M11/M12**：复核路径分层、`src→desktop` 反向依赖、服务 lifecycle、同步 I/O/子进程、清理错误。
- **M01**：Electron 导航/CSP/permission、退出/重启/工作区切换并发。
- **M30/M31**：构建可复现、runtime/签名、CI 根路径、Node 22/24 矩阵、默认 test glob、红测/漏测、external/container/DR 覆盖。
- 对所有已深审模块回填 `coverage-matrix.md`，只有证据完整时才能把“深度审查”改为“已完成”。

## 3. 可并行分组

| 并行组 | 模块 | 合并点 |
|---|---|---|
| P1 | M27 media 网络安全；M29 auth DR；M30 CI/CD | 严重外部/运维风险清单 |
| P2 | M14 内容源；M18 文章聚合 | 文章来源与身份模型 |
| P3 | M15 AI；M16 Doubao | 外部数据披露与超时/重试专题 |
| P4 | M25 toutiao/lieju；M26 hepan | M24 worker + M22 ledger 端到端核对 |
| P5 | M07 content UI；M08 platform UI；M09 media UI | M05 bridge 契约、M23 invalidation |
| P6 | M02/M28 auth semantics；M29 persistence/ops | 登录/刷新/恢复联合情景 |

同一文件或同一权威状态机不要由两个并行审查者同时给出互相独立的最终结论；由一个 owner 合并证据。

## 4. 必须顺序审查的依赖

1. M22 → M20 → M13/M24 → M23：状态语义由 ledger 向外传播。
2. M18 → M19：删除安全依赖文章身份与存储不变量。
3. M14/M15 → M17 → M21：生成来源、生成任务、交接依次建立。
4. M12 → M16/M25/M26：先理解 runtime/凭据/子进程边界。
5. M05 → M07/M08/M09：先固定 bridge/IPC 契约再评价 UI。
6. M28 → M29 的 schema/事务核对，以及 M29 → M30 的容器/运维执行面。

## 5. 横向专题安排

| 专题 | 覆盖模块 | 输出要求 |
|---|---|---|
| 安全与秘密 | M01–M05、M12、M15–M16、M25–M30 | 信任边界、秘密驻留/传输/日志、输入校验、ACL/TLS、威胁情景 |
| 并发与幂等 | M03–M04、M13、M17–M24、M28–M29 | 状态机、锁/租约、重复命令、崩溃点、恢复不变量 |
| 数据一致性与删除 | M14、M18–M23、M27、M29 | 权威所有者、事务/补偿、迁移、备份、永久删除证据 |
| 性能与容量 | M06–M09、M11–M13、M16–M18、M24、M27–M28 | 真实容量假设、同步阻塞、分页、IPC clone、DB health cost |
| 外部系统可靠性 | M13、M15–M16、M24–M29 | timeout/retry/uncertain、限速、断网、远端成功本地失败 |
| 类型与契约 | M05–M10、M20–M24、M28 | DTO/schema、error code、strict 覆盖、版本兼容 |
| 测试与可观测 | 全部，重点 M23–M31 | 模块→测试映射、漏跑/红测、日志/metrics、故障注入、运行矩阵 |

## 6. 每个模块的完成门槛

一个模块只有同时满足以下条件，才可把覆盖矩阵的“深度审查状态”改为“已完成”：

- 已阅读该模块全部生产文件及直接契约/配置；列明未读的生成/第三方文件。
- 已确认入口、上游、下游、数据所有者、信任边界和失败状态。
- 已检查安全、正确性、错误处理、并发/幂等、性能、可测试性和可观测性中适用的维度。
- 每个 finding 含路径、符号/行号、影响、风险和置信度；推测明确标记。
- 已记录相关测试实际是否被默认命令/CI执行，不能只记录“存在测试文件”。
- 已回填 coverage matrix 和剩余信息缺口。

## 7. 推荐立即开始的审查包

第一包建议按以下顺序执行：

1. M22 Publication ledger/state/locks。
2. M20 Submission export/batch/action。
3. 并行审查 M13 通用 jobs 与 M27 media 网络/target 接线。
4. M24 worker 与 M23 attention/invalidation。

同时可独立启动 M29 auth migration/backup/restore，因为它不依赖桌面 publication 结论，且已有高风险证据。
