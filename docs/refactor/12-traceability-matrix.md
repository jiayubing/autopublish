# 重构追踪矩阵

本文把原始finding、优化工作项和重构阶段连接起来。重构阶段改变了部分OPT的implementation路线，例如publication文件锁和batch CAS会由SQLite单writer事务取代，但风险、验收结果和原始编号继续保留。

## 1. OPT到阶段

| OPT | 原目标摘要 | 主阶段 | 协同阶段 | 重构后的主要实现 |
|---|---|---:|---:|---|
| OPT-001 | 根CI与production seam | 0 | 8 | 根门禁、唯一seam、最终清理复验 |
| OPT-002 | publication锁恢复 | 2 | 3 | SQLite main-only writer；切换后删除文件锁 |
| OPT-003 | durable recovery intent | 3 | 4 | PublicationWorkflow + SQLite intent + PlatformRun |
| OPT-004 | run context/watchdog/stop | 4 | 3 | 不可变PlatformRun和版本化worker协议 |
| OPT-005 | Hepan POST模糊异常 | 4 | 3 | 异步publisher、stage语义、uncertain outcome |
| OPT-006 | 头条/列举文章级证据 | 4 | 8 | Publisher contract、脱敏fixture、人工production门 |
| OPT-007 | ASAR Hepan脚本路径 | 4 | 7 | unpacked resolver、制品self-test、release smoke |
| OPT-008 | 媒体传输风险控制 | 4 | 7 | 无隐式endpoint、HTTP显式确认、3xx不跟随、风险状态与未来HTTPS迁移门 |
| OPT-009 | 媒体remote order恢复 | 3 | 2 | Outcome事务内保存remote order evidence |
| OPT-010 | Auth备份/恢复验证 | 7 | 8 | destination验证、只读restore、隔离演练 |
| OPT-011 | 安全诊断/临时秘密 | 4 | 7 | 无原始截图、PlatformRun cleanup、结构化诊断 |
| OPT-012 | trash token版本绑定 | 5 | 6 | fingerprint/version/TTL一次性command token |
| OPT-013 | batch lost update | 2 | 3 | SQLite revision/claim事务取代文件CAS |
| OPT-014 | media resource target retry | 3 | 1 | account/resource-aware target与action DTO |
| OPT-015 | Renderer请求竞态 | 6 | 1 | Feature request identity和scope验证 |
| OPT-016 | 草稿字段清零 | 5 | 6 | Content draft snapshot/dirty lifecycle |
| OPT-017 | ClientId与目录 | 5 | 1 | ContentIdentity resolver |
| OPT-018 | removal自动恢复 | 5 | 3 | bounded scheduler、fingerprint、attention |
| OPT-019 | generationTask唯一查询 | 5 | 1 | Production ContentStore 0/1/many查询 |
| OPT-020 | 媒体分页/容量 | 6 | 4 | 有界查询、去重、重复页诊断、IPC限制 |
| OPT-021 | destructive prepare错误 | 6 | 5 | Typed command、错误收敛、modal host |
| OPT-022 | submit/pause busy | 6 | 4 | 独立command owner + PlatformRun snapshot |
| OPT-023 | Settings自检busy | 6 | — | Feature command finally/snapshot |
| OPT-024 | Native confirm | 6 | — | 独立confirmation host |
| OPT-025 | 默认文章排序 | 5 | 6 | ContentStore createdAt稳定查询 |
| OPT-026 | Auth limiter Map容量 | 7 | — | TTL/LRU硬上限和可信来源桶 |
| OPT-027 | 订单清空语义 | 6 | 7 | 准确projection文案；不新增远端删除 |
| OPT-028 | publish-log产品interface | 7 | 6 | 删除死sender；状态/attention/diagnosticId替代 |
| OPT-029 | 平台账号模型 | 1 | 4 | AccountProfileId进入普通target，换号阻断 |

## 2. Finding到阶段

| Finding | 原处置 | OPT | 主阶段 | 最终关闭证据 |
|---|---|---|---:|---|
| F-H01 | 接受 | OPT-015 | 6 | 客户切换/deferred promise测试无旧响应注入 |
| F-H02 | 调整 | OPT-016 | 5 | draft roundtrip及打开关闭零写入 |
| F-H03 | 接受 | OPT-011 | 4 | 原始截图路径删除和敏感扫描 |
| F-H04 | 接受 | OPT-002 | 2/3 | SQLite单writer；旧文件锁0引用 |
| F-H05 | 接受 | OPT-003、004 | 3/4 | 强杀后intent可见、unknown阻断、run安全终结 |
| F-H06 | 接受 | OPT-004 | 4 | stop/start交错、旧message/finally隔离 |
| F-H07 | 接受 | OPT-003 | 3 | outcome写失败不归档且attention可见 |
| F-H08 | 调整 | OPT-006 | 4 | 头条跨行/同名/无关toast不能published |
| F-H09 | 接受 | OPT-005 | 4 | Hepan接收后断连为uncertain |
| F-H10 | 接受 | OPT-007 | 4/7 | 最终`app.asar.unpacked`脚本self-test |
| F-H11 | 接受 | OPT-008 | 4/7 | HTTP未显式确认时发送body前拒绝；已确认HTTP持续标记未加密风险 |
| F-H12 | 接受 | OPT-009 | 3 | projection失败后remote order ID仍可查询 |
| F-H13 | 接受 | OPT-010 | 7 | 备份destination独立验证 |
| F-H14 | 接受 | OPT-010 | 7 | 缺失restore目标零副作用且失败 |
| F-H15 | 接受 | OPT-001 | 0 | 根workflow静态契约、canonical本地门禁和本地里程碑commit；remote/PR/push/required checks为`NOT_APPLICABLE` |
| F-M01 | 合并 | OPT-001 | 0 | 测试与production runtime同seam |
| F-M02 | 暂缓后决定删除 | OPT-028 | 7 | 死sender/channel 0引用，诊断interface可用 |
| F-M03 | 接受 | OPT-015 | 6 | initial/refresh统一request identity |
| F-M04 | 接受 | OPT-024 | 6 | 业务native confirm静态0命中 |
| F-M05 | 接受 | OPT-021 | 6 | prepare reject可见、无unhandled rejection |
| F-M06 | 接受 | OPT-022 | 6 | submit/pause/stop后busy收敛 |
| F-M07 | 接受 | OPT-020 | 6 | 重复页停止、去重和容量上限 |
| F-M08 | 接受 | OPT-023 | 6 | Settings成功/失败后按钮恢复 |
| F-M09 | 接受 | OPT-017 | 5 | logical ClientId≠目录名全链通过 |
| F-M10 | 接受 | OPT-025 | 5 | 编辑后默认顺序不变且tie稳定 |
| F-M11 | 接受 | OPT-018 | 5 | 无重启恢复、最大次数、needs_repair |
| F-M12 | 接受 | OPT-012 | 5 | 旧token拒绝新tombstone |
| F-M13 | 接受 | OPT-013 | 2/3 | 并发batch claim/update不丢失 |
| F-M14 | 接受 | OPT-014 | 3 | media retry保持resource target和aggregate |
| F-M15 | 接受 | OPT-019 | 5 | 真实ContentStore duplicate查询阻断handoff |
| F-M16 | 调整 | OPT-006 | 4 | 列举通用success不能published |
| F-M17 | 待确认后采用account-aware | OPT-029 | 1/4 | target含AccountProfileId，换号阻断 |
| F-M18 | 接受 | OPT-011 | 4 | 强杀/重启后无Cookie/payload残留 |
| F-M19 | 接受 | OPT-026 | 7 | 100k key压力下Map/heap有界 |
| F-M20 | 合并 | OPT-001 | 0 | 默认命令收集`.mjs` |
| F-M21 | 合并 | OPT-001 | 0 | 旧seam测试删除/替换且全绿 |
| F-L01 | 接受 | OPT-027 | 6 | UI文案与实际projection行为一致 |

## 3. 阶段完成反查

| 阶段 | 必须关闭/转交的OPT |
|---:|---|
| 0 | OPT-001代码、静态workflow契约与本地门禁完成；file symlink能力不足时保持`BLOCKED`，不以托管required checks替代 |
| 1 | OPT-029的领域决策和identity contract完成；其运行验证转阶段4 |
| 2 | OPT-002/013的存储implementation完成但production关闭由阶段3证明 |
| 3 | OPT-002、003、009、013、014完成 |
| 4 | OPT-004、005、006、011、029完成；OPT-007/008部分转阶段7人工/制品门 |
| 5 | OPT-012、016、017、018、019、025完成 |
| 6 | OPT-015、020、021、022、023、024、027完成 |
| 7 | OPT-007、008、010、011、026、028完成或明确`PENDING_HUMAN`仅阻塞release |
| 8 | 全部29个OPT和37个finding完成最终反查，不留未解释状态 |

## 4. 变更后的处置说明

- F-M02原为暂缓；本重构已决定不建设实时原始日志UI，而删除死sender并以结构化状态、attention和diagnosticId替代。
- F-M17原为待确认；本重构按未来扩展目标采用account-aware model，平台账号档案进入target identity。
- OPT-002不再实现复杂文件lock lease；SQLite main-only writer消除该production锁，迁移/CLI另用独占migration lease。
- OPT-013不再在JSON文件上增加CAS；batch revision/claim由SQLite事务承担。
- 原“待决策”或“需要验证”中的真实生产账号、TLS、签名、RPO/RTO仍需人工证据；架构决定不等于外部环境已经验收。

