# 分阶段优化方案

> 适用基线：`master@e8d817847bab3a9e6020006cab35340f645e527f`。  
> 现有审查没有 `REVIEW-XXX`，本文件保留原 `F-*` 并与 `OPT-*` 双向追踪。

## 1. 总体目标

1. 先建立能真实触发、收集完整测试并约束 production seam 的门禁。
2. 保证外部调用的“未开始、已开始但未知、已确认成功、已确认失败”在崩溃后仍可解释，且不会盲重试或错误归档。
3. 将 publication、run lifecycle、目标身份等复杂规则收敛到具有小 interface 的深 module；caller 不自行拼接状态。
4. 控制媒体服务商明文传输的已知风险，并关闭原始诊断和异常退出临时文件造成的秘密泄漏面。
5. 修复客户、文章、媒体资源、删除确认的身份断裂，并用可观察验收条件约束。
6. 把低风险 UI/容量改进与安全/正确性修复分批，避免扩大高风险变更半径。

## 2. 优先级与状态

| 优先级 | 规划含义 | 数量 |
|---|---|---:|
| P0 | 没有它就不能信任后续变更与发布门禁 | 1 |
| P1 | 安全、远端事实、数据一致性、灾备或破坏性操作风险 | 14 |
| P2 | 明确正确性/容量/恢复收益，且不阻塞 P1 基础 | 8 |
| P3 | 低风险 UX、契约或长期维护改进 | 4 |
| 待决策 | 必须先取得外部/业务架构决定 | 1 |
| 暂缓 | 机制存在但当前收益不足以承担 interface 扩张 | 1 |
| 合计 |  | 29 |

状态使用“可实施 / 需要验证 / 需要决策 / 暂缓”。“需要验证”允许先写 fixture/探针，但未取得外部证据前不得改变 production 成功判定并直接上线。

## 3. 依赖总览

```text
OPT-001 门禁
  ├─ OPT-007/010/011/012（发布、安全、灾备）
  ├─ OPT-002 锁恢复 → OPT-003 远端事实恢复 → OPT-004 run lifecycle
  │                                      └→ OPT-005/006 adapters
  │                                      └→ OPT-013 batch CAS
  └─ OPT-009 媒体远端 ID → OPT-014 媒体资源级重试

OPT-015 请求身份 → OPT-016 媒体草稿回读 / OPT-020 资源分页
OPT-017 客户目录解析 → M16 采集回归
OPT-019 文章唯一查询 → generation handoff 回归
OPT-008 媒体HTTP风险控制（D-001已决策）；OPT-029 需要人工决策；OPT-028 暂缓
```

## 4. 优化工作项

## OPT-001：恢复仓库根 CI 与唯一生产 seam 门禁

- 优先级：P0
- 状态：可实施
- 关联发现：F-H15、F-M01、F-M20、F-M21
- 目标：根workflow具有严格静态契约；默认命令收集 `.js/.mjs`；架构测试只约束 production runtime/controller seam，结果全绿。本项目以canonical本地门禁和本地Git里程碑验收，remote、PR、push、required checks为`NOT_APPLICABLE`。
- 非目标：本项不修业务 defect，不引入 CD、签名证书或发布审批系统。
- 当前问题：workflow 位于嵌套目录且 working directory 错；默认 glob 漏 `.mjs`；两组测试约束影子/弃用 seam。
- 根本原因：测试与 caller 未通过同一个 module interface，仓库布局变更后门禁路径没有同步。
- 代码证据：`auto—publish/.github/workflows/ci.yml:1-40`、`package.json:9`、`tests/architecture-seams.test.js:9-44`、`tests/renderer-workbench-controller-seams.test.js:9-25`；本阶段 `.mjs` 6/6、旧 seam 0/2。
- 涉及模块：M04、M08、M21、M30、M31。
- 预计涉及文件：根 `.github/workflows/ci.yml`（新）；`auto—publish/package.json`；两份 seam 测试；可能删除/隔离旧 runtime 测试 fixture（实施前确认引用）。
- 前置依赖：无。
- 与其他优化项的关系：所有其他项的合并门禁；必须先完成。
- 推荐设计：Git 根 workflow 的每个 step 显式 `working-directory: auto—publish`；测试发现使用 Node 支持的目录/显式双扩展；架构测试直接 import/read production seam。删除测试专用影子 interface，而不是再加第三层适配。
- 实施步骤：1) 在根建立 workflow；2) 修 npm test 收集；3) 以 production runtime/controller 重写 seam 断言；4) 移除或明确标注不再生产的旧 module；5) 保留一份由 `test:discover` 输出、由静态workflow契约验证的本地收集清单；6) 确认 auth Node 22 与主 Node 24 的矩阵。
- 兼容性考虑：npm script 名保持不变；外部脚本继续调用 `npm test`。
- 数据迁移要求：无。
- 安全影响：恢复 audit、安全测试和依赖检查门禁。
- 性能影响：默认测试多收集 1 个 `.mjs`，耗时影响可忽略。
- 测试要求：默认套件、auth、lint、renderer/bridge typecheck、link security、production packaging；增加“workflow 在根、cwd 正确、收集含 mjs”的契约测试。
- 验收标准：静态workflow契约通过；`npm test` 输出包含 `platform-submission-controller.test.mjs`；旧 seam 测试不再失败；不存在测试读取非 production runtime 来证明 production 架构的情况；本地里程碑commit固化证据。
- 发布或启用方式：workflow保留为可移植配置；以canonical本地命令和本地Git提交验收，不配置remote或required checks。
- 回滚方案：回退 workflow/package script/test 变更；保留此前本地命令作为临时人工门禁。
- 潜在回归风险：glob 变化可能收集依赖环境的测试；需显式分类 Electron/外部测试。
- 复杂度：中
- 是否可以并行：否
- 并行限制：同一实施者统一处理 workflow、test glob 和 seam；完成前其他代码项可设计但不应合并。

## OPT-002：为 publication 文件锁增加所有权、租约与安全回收

- 优先级：P1
- 状态：可实施
- 关联发现：F-H04
- 目标：崩溃遗锁可被安全识别和恢复；活跃 writer 的锁绝不被误删。
- 非目标：不把文件 ledger 改为数据库，不改变 publication 状态机。
- 当前问题：锁只含 PID，任意 `EEXIST` 永久拒绝，无恢复 interface。
- 根本原因：锁 implementation 只覆盖正常 `finally`，未把崩溃作为 interface 的错误模式。
- 代码证据：`src/publication/publication-ledger-store.js:431-439,469-482`。
- 涉及模块：M22、M24。
- 预计涉及文件：publication ledger store；workspace startup/recovery 组合点；publication store/故障注入测试。
- 前置依赖：OPT-001。
- 与其他优化项的关系：OPT-003 在此锁语义上持久化 recovery intent；应先于或与其串行实施。
- 推荐设计：锁内容包含随机 owner token、PID、创建时间和 schema；回收 module 在锁年龄超过 lease 且 owner 不存活/不再持有时，使用原子 compare/re-read 后删除；Windows 无法可靠探测 PID 时采用更保守的 lease + 人工 repair。
- 实施步骤：定义 lock record；原子创建并校验 owner；释放时只删自己的 token；加入启动扫描/受控 repair；定义 clock/process-probe internal seam；覆盖过期、活跃、损坏、竞争回收。
- 兼容性考虑：兼容旧纯 PID 锁，按保守“未知旧锁”处理并提供明确诊断；不能静默删除。
- 数据迁移要求：无批量迁移；首次恢复时按旧锁兼容策略处理。
- 安全影响：防止恶意/错误锁内容导致越界删除；锁路径必须由 publication record 派生。
- 性能影响：每次 update 多一次小 JSON/read check；可忽略。
- 测试要求：单元 + 两进程集成 + 强杀模拟；Windows 文件占用场景；静态路径安全。
- 验收标准：强杀 writer 留锁后，lease 满足条件可恢复并推进记录；活跃 writer 并发测试始终拒绝第二 writer；恢复不修改其他记录。
- 发布或启用方式：随 desktop 版本启用；首版记录回收诊断日志。
- 回滚方案：保留读取新锁 record 的旧式互斥 fallback；若误判风险出现，关闭自动回收但保留人工 repair。
- 潜在回归风险：错误 lease 或时钟回拨导致误删活锁。
- 复杂度：中
- 是否可以并行：否
- 并行限制：与 OPT-003 同改 publication store/recovery interface，不并行。

## OPT-003：建立远端事实 durable recovery intent 与 stranded publication 修复

- 优先级：P1
- 状态：可实施
- 关联发现：F-H05、F-H07
- 目标：远端已开始或 outcome 已知但 ledger 未落盘时，崩溃后仍有唯一可解释的持久事实；`submitting` 不再永久不可见。
- 非目标：不自动猜测外部是否成功；不把未知结果强制变成 failed。
- 当前问题：watchdog/退出可留 `submitting`；已知 outcome 写失败仍可归档；attention 不展示且 reconcile 不接受。
- 根本原因：ledger、worker result、batch、archive 间没有拥有跨资源提交意图的深 module。
- 代码证据：`platform-workbench-service.js:708-750,763-785`、`article-attention-query.js:223-248`、`publication-ledger.js:259-269`。
- 涉及模块：M20、M22、M23、M24、M27。
- 预计涉及文件：publication 新 recovery store/module；platform workbench、worker/main lifecycle、attention query/resolver、workspace startup；submission/archive tests。
- 前置依赖：OPT-001、OPT-002；与 OPT-004 协同设计。
- 与其他优化项的关系：OPT-004 提供可靠 run interruption 事件；OPT-005/006/009 提供正确 adapter/remote ID outcome；OPT-013保证 batch 不丢恢复结果。
- 推荐设计：定义 `PublicationRecovery` module 的小 interface（例如 `remoteStarted`、`outcomePending`、`commitOutcome`、`listActionable`）；implementation 原子持久化 attempt、phase、known outcome/remote ID，不让 caller 自行决定归档。启动时将无终态的 intent/陈旧 submitting 派生为 `uncertain` 或“outcome 待落账”，通过 attention 显示人工核对。
- 实施步骤：固定状态/不变量表；写 recovery schema；在远端调用前后写 intent；ledger 成功后提交 intent；ledger 失败时禁止归档并持久化 known outcome；启动扫描；扩展 attention/reconcile；再接 batch/archive。
- 兼容性考虑：现有无 intent 的 `submitting` 按年龄/运行快照保守标为需核对，不自动重试；旧记录不重写历史 attempt。
- 数据迁移要求：启动期兼容扫描，必要时生成 recovery record；不得批量将 submitting 判失败。
- 安全影响：recovery DTO 不保存正文、Cookie、API key 或绝对路径。
- 性能影响：每个远端 attempt 增加少量原子文件写；可接受，需测批次吞吐。
- 测试要求：远端前、远端后、ledger 写前、ledger 写后、archive 前各故障点；进程强杀/重启集成；attention 与 reconcile；敏感字段静态检查。
- 验收标准：每个故障点重启后状态只能是安全终态或明确需核对；任何未知结果不可重新 reserve；known published 但 ledger 写失败时队列不归档且 UI 可见。
- 发布或启用方式：先 shadow 扫描并只报告旧 stranded；新 attempt 强制写 intent；确认后启用启动转换。
- 回滚方案：保留 recovery 文件和旧 ledger，不删除；关闭自动转换后仍可人工核对。
- 潜在回归风险：状态双写次序错误制造新的事实源；必须以 ledger + intent 明确优先级。
- 复杂度：大
- 是否可以并行：否
- 并行限制：publication/recovery interface 由单一 owner；adapter fixture 可并行准备但不得同时改提交顺序。

## OPT-004：将平台 task run 改为不可变 context 并修正 watchdog/stop 生命周期

- 优先级：P1
- 状态：可实施
- 关联发现：F-H06；关联 F-H05
- 目标：一个 run 的 child、runId、watchdog、abort、cleanup 和消息只归属该 run；远端未结束前禁止第二 run。
- 非目标：不改变 renderer 的业务选择策略，不在本项重写 adapter。
- 当前问题：共享 mutable 字段被新 run 覆盖，stop 过早清 busy，旧 callback 可写新 run。
- 根本原因：run lifecycle 没有封装成有单一 owner 的 module，callback 读取全局当前值而非捕获 context。
- 代码证据：`desktop-task-service.js:38-43,153-223,243-260,296-309`。
- 涉及模块：M08、M24、M26。
- 预计涉及文件：desktop task module、platform state store、platform IPC/controller、worker protocol tests。
- 前置依赖：OPT-001；与 OPT-003 的 interruption intent interface 先对齐。
- 与其他优化项的关系：解决 F-H05 的产生路径之一；为 OPT-011 的临时秘密清理提供 owner。
- 推荐设计：`PlatformRun` module 持有 immutable runId/child/timers/cleanup；消息必须携带并匹配 runId；状态为 starting/running/stopping/terminal，只有 terminal 才释放 start gate。watchdog 感知 `remote-started`，超时通过 OPT-003 先持久化未知事实再终止。
- 实施步骤：提取 run context；改 callback 捕获 context；加入明确 stopping；stop/pause 幂等；旧 finally 只清自身；消息协议校验；再接 renderer busy；覆盖双 run/旧消息/cleanup。
- 兼容性考虑：保留现有 IPC method 与 runId DTO；phase 新值需 renderer 兼容未知/`stopping`。
- 数据迁移要求：无。
- 安全影响：临时 Cookie cleanup 不再被旧 run 错误清理/遗忘。
- 性能影响：无显著影响；避免重复 child。
- 测试要求：并发/故障集成、fake child、真实短子进程强杀；renderer controller；runId stale message。
- 验收标准：remote-started 后 stop 期间第二 start 明确拒绝；旧 child 任意 state/result 不改变新 snapshot；每个 cleanup 恰好一次；watchdog 后 publication 可见为需核对。
- 发布或启用方式：随 desktop 版本；先以事件日志观察 run transition。
- 回滚方案：回退新 module，但不得回退 OPT-003 已写 recovery schema；保留 reader 兼容。
- 潜在回归风险：stop 变慢或 UI 误认为未响应；需展示 stopping。
- 复杂度：大
- 是否可以并行：否
- 并行限制：与 OPT-003 同时设计、顺序提交；不要与 OPT-022 同时改 controller 文件。

## OPT-005：将河畔 POST 后传输异常保守持久化为 uncertain

- 优先级：P1
- 状态：可实施
- 关联发现：F-H09
- 目标：请求可能到达远端后的 timeout/connection/read/protocol 异常不可盲重试，并能进入核对流程。
- 非目标：不实现远端自动删除或假定标题唯一，不改 Python 依赖版本。
- 当前问题：Python 与 Node 合作把 POST 后 RequestException 映射为 failed。
- 根本原因：adapter interface 只返回错误码，没有携带“远端调用阶段”。
- 代码证据：`hepan_publish.py:303-321,725-730`、`hepan/adapter.js:229-244`。
- 涉及模块：M22、M24、M26。
- 预计涉及文件：Python outcome schema、Node adapter、publication/attention 接线、Hepan contract tests。
- 前置依赖：OPT-001；推荐接在 OPT-003 interface 后。
- 与其他优化项的关系：OPT-004 解决同步阻塞 watchdog；OPT-006 处理浏览器平台证据。
- 推荐设计：Python 输出 `stage`/`requestMayHaveBeenSent`；Node adapter 只把本地前置/明确 HTTP rejection 判 failed，POST 后模糊异常判 uncertain；核对动作优先使用远端文章 ID/标题+时间窗口，无法证明则保持 uncertain。
- 实施步骤：列出前置与 POST 后异常矩阵；扩展安全 JSON outcome；改 Node mapping；接 ledger/recovery；更新错误行为测试；用 fake server 模拟接收后断连/超时。
- 兼容性考虑：旧 Python 无 stage 时，Node 在 `HEPAN_REMOTE_REQUEST_FAILED` 上保守按 uncertain；可能增加人工核对量但避免重复发布。
- 数据迁移要求：无；既有 failed 历史不自动重写。
- 安全影响：错误 DTO 不回显 Cookie/正文。
- 性能影响：无；核对可能增加一次远端查询。
- 测试要求：Python 单元、Node adapter、ledger 集成、断连 fake server；禁止真实投稿。
- 验收标准：远端收到请求后断连时 ledger 为 uncertain、attention 有核对动作、新 reserve 被拒；明确前置校验失败仍为 failed。
- 发布或启用方式：先随 recovery 能力发布；没有核对能力时仍 fail closed。
- 回滚方案：保留 uncertain 记录；回退 adapter 时不得把它改 failed。
- 潜在回归风险：过度保守导致人工处理增多。
- 复杂度：中
- 是否可以并行：是
- 并行限制：可与 OPT-007 并行；与 OPT-003 接线文件由后者 owner 合并。

## OPT-006：为头条/列举建立文章级远端成功证据

- 优先级：P1
- 状态：需要验证
- 关联发现：F-H08、F-M16
- 目标：只有与当前提交文章绑定的远端 ID、详情 URL、同一行/节点或明确响应才能生成 published。
- 非目标：不保证第三方 DOM 永久稳定，不使用生产账号直接自动投稿验证。
- 当前问题：头条跨行拼接标题/状态，列举接受任意通用 success 文案。
- 根本原因：adapter success interface 没有“证据来源与文章绑定”字段，测试只注入 outcome。
- 代码证据：`toutiao/adapter.js:255-284,342-354`、`lieju/adapter.js:146-179,247-259`；无直接 adapter fixture tests。
- 涉及模块：M22、M24、M25。
- 预计涉及文件：两个 adapter、共享 evidence normalizer（若两者确有共同 interface）、脱敏 DOM fixtures/adapter tests。
- 前置依赖：OPT-001；需测试账号或脱敏现场 fixture；与 OPT-003 outcome interface 对齐。
- 与其他优化项的关系：OPT-029 决定账号是否进入 target；二者不应在同次修改混合。
- 推荐设计：每个 adapter 返回 `{status,evidence:{kind,remoteId,remoteUrl,titleBound,observedAt}}`；共享 interface 只定义证据不变量，平台 DOM 保持各自 implementation。无文章级证据一律 uncertain。
- 实施步骤：获取批准的脱敏成功/失败/同名/无关 toast fixtures；列成功证据优先级；写负向测试；改头条同一 row/详情解析；改列举 response/详情解析；现场测试账号只做受控验证；接 ledger remoteId。
- 兼容性考虑：弱信号从 published 变 uncertain，可能减少自动归档；这是有意 fail closed。
- 数据迁移要求：不自动重判历史 published；可选人工审计弱证据历史需另授权。
- 安全影响：fixture 必须脱敏账号/正文/Cookie；不把 DOM 原文写日志。
- 性能影响：可能增加详情核对请求，需设置 timeout/上限。
- 测试要求：adapter 单元/fixture、worker 集成、真实非生产账号手工验证、同名/跨行/无关 toast 负向测试。
- 验收标准：构造跨行标题+状态或无关 success 文案时返回 uncertain；受控成功提交返回带 remote ID/URL 的 published；缺证据不归档。
- 发布或启用方式：先 feature flag/shadow 记录新证据与旧判定差异；现场确认后启用 fail-closed。
- 回滚方案：关闭自动发布证据判定并全部退到 uncertain，不恢复弱谓词。
- 潜在回归风险：第三方页面变化导致 published 率下降。
- 复杂度：大
- 是否可以并行：是
- 并行限制：头条与列举 fixture/implementation可并行；共享 evidence interface 由单一 owner，未获外部证据前不发布。

## OPT-007：修正 production ASAR 河畔脚本路径并执行真实制品 smoke

- 优先级：P1
- 状态：可实施
- 关联发现：F-H10
- 目标：production `app.asar.unpacked` 中的 Python 脚本可被外部 Python 解析、校验和执行。
- 非目标：不处理签名证书采购，不向河畔发真实请求。
- 当前问题：script resolver 返回 app.asar 虚拟路径，打包测试只匹配 YAML 文本。
- 根本原因：打包资源 location 复杂性泄漏给 adapter caller，resolver module 不完整。
- 代码证据：`hepan/runtime-paths.js:16-37`、`electron-builder.production.yml:8-12`、`production-packaging.test.js:16-19`。
- 涉及模块：M26、M30。
- 预计涉及文件：runtime resolver、settings/publish adapter 接线、production packaging test/script。
- 前置依赖：OPT-001。
- 与其他优化项的关系：可与 OPT-005 并行；属于批次 1 发布阻断。
- 推荐设计：runtime-paths module 统一返回经 `lstat` 验证的普通文件；packaged mode 优先 `process.resourcesPath/app.asar.unpacked/...`，开发/alpha 使用源码路径；settings 与 worker 通过同一 interface。
- 实施步骤：实现候选解析；拒绝不存在/symlink；让全部调用方复用；`electron-builder --dir` 生成 production 目录；从最终目录执行 Python payload self-test；CI 保存 smoke 结果。
- 兼容性考虑：asar:false alpha/开发路径保持；旧资源布局可保守候选兼容一个版本。
- 数据迁移要求：无。
- 安全影响：只执行预期普通文件，避免路径替换。
- 性能影响：启动/自检一次 `lstat`。
- 测试要求：resolver 单元、打包目录集成、Windows production smoke、签名外可执行验证。
- 验收标准：最终 `app.asar.unpacked` 脚本存在且 Python self-test 退出 0；传入 `app.asar/...py` 的路径测试明确失败；开发/alpha 不回归。
- 发布或启用方式：先 CI `--dir` smoke，再正式签名包。
- 回滚方案：回退 resolver/制品，但暂停 production 河畔发布；不回到已知不可执行包。
- 潜在回归风险：electron-builder 版本/资源布局差异。
- 复杂度：中
- 是否可以并行：是
- 并行限制：可与 auth DR、安全工件并行；与 OPT-005 同文件改动需串行合并。

## OPT-008：控制媒体服务商HTTP传输风险

- 优先级：P1
- 状态：可实施（D-001已于2026-07-25由用户决策）
- 关联发现：F-H11
- 目标：不再隐式启用公网HTTP；服务商HTTP endpoint只有在操作者明确配置并确认未加密风险后才能携带API key和正文调用，且状态持续可见；服务商提供HTTPS后可直接迁移。
- 非目标：本项目不替外部服务商部署证书，不声称显式确认能消除窃听/篡改风险，不把HTTP例外扩展到AI、Auth或其他provider。
- 当前问题：服务商目前只提供HTTP；原默认公网HTTP又绕过显式确认并携带敏感multipart，而本阶段一刀切HTTPS会使真实媒体功能完全不可用。
- 根本原因：外部传输能力受限，同时历史连接地址被当作“批准默认”绕过安全interface。
- 代码证据：`media-client.js:8,85-103,136-149`、`media-settings-adapter.js:47-57`。
- 涉及模块：M10、M27、外部媒体服务。
- 预计涉及文件：media config/settings/client、UI迁移提示、配置测试；外部 TLS/反代配置不在仓库。
- 前置依赖：用户已确认服务商当前只提供HTTP并接受受控例外；OPT-001。
- 与其他优化项的关系：应在任何媒体功能正式发布前完成；与 OPT-009/014 不冲突。
- 推荐设计：默认endpoint为空；HTTPS直接允许；HTTP要求保存配置或环境变量显式`allowInsecure`，settings与`MediaClient`双边校验，UI持续显示“不加密连接”；媒体请求不自动跟随重定向，禁止HTTPS静默降级为HTTP。服务商未来提供HTTPS时清除该确认。
- 实施步骤：删除隐式HTTP默认；恢复并收紧显式确认契约；底层client二次校验并禁用自动重定向；补设置/UI/环境变量/直接caller/redirect测试；记录残余风险与未来HTTPS迁移门。
- 兼容性考虑：已有明确HTTP配置必须同时具有确认标志；缺endpoint或缺确认的旧配置被阻断并给出可操作提示；HTTPS配置不受影响。
- 数据迁移要求：配置迁移只标记/拒绝旧 endpoint，不复制 API key 到明文。
- 安全影响：消除无感知明文发送，但已确认HTTP仍暴露API key、正文和响应被窃听/篡改的残余风险；风险必须在UI与运行手册中保留。
- 性能影响：无明显变化；未来切换HTTPS时再测TLS握手与连接复用。
- 测试要求：配置单元、环境变量、UI错误映射、client防御性校验、HTTP未确认不调用fetch、HTTP确认与HTTPS调用、redirect manual与禁止静默降级。
- 验收标准：默认无endpoint；HTTP未确认时在发送body前拒绝；确认后状态为“不加密连接”且可调用合成server；HTTPS无需确认；不存在固定HTTP地址的隐式豁免；3xx不会把multipart转发到新地址。
- 发布或启用方式：用户手工输入服务商endpoint并勾选风险确认，或同时配置`XQW_BASE_URL`与`XQW_ALLOW_INSECURE=1`；未来由服务商HTTPS替换endpoint并关闭确认。
- 回滚方案：关闭媒体功能或清除配置；不得恢复隐式HTTP默认或绕过确认。
- 潜在回归风险：配置迁移遗漏确认标志会阻断媒体；误把确认标志传递遗漏会导致底层client拒绝；HTTP本身仍有外部安全风险。
- 复杂度：小
- 是否可以并行：是
- 并行限制：与其他媒体项共享settings/client时串行；外部服务商HTTPS升级不由本项目线程自动执行。

## OPT-009：把媒体 order ID 与 submitted outcome 同步持久化

- 优先级：P1
- 状态：可实施
- 关联发现：F-H12
- 目标：远端返回订单号后，即使订单 JSONL 写失败，ledger/recovery 仍可定位并重建订单关联。
- 非目标：不把订单 JSONL 变成 publication 权威，不改变计费协议。
- 当前问题：ledger submitted 不含 order ID，JSONL append 失败只在一次返回 DTO。
- 根本原因：远端 identity 解析发生在 ledger commit 后，两个 store 没有恢复 intent。
- 代码证据：`media-workbench-service.js:419-468`、`submission-order-store.js:39-59`。
- 涉及模块：M22、M23、M27。
- 预计涉及文件：media workbench、publication outcome fields/recovery、order service/store、attention、测试。
- 前置依赖：OPT-001；与 OPT-003 recovery interface 对齐。
- 与其他优化项的关系：OPT-014 使用 resource target 重试；本项只保证订单 identity。
- 推荐设计：先解析响应 orderNid/URL，再以 `remoteId/remoteUrl` 与 submitted outcome 一次提交 ledger；JSONL append 失败创建 durable recovery/attention，可从 ledger 重建只读订单视图。
- 实施步骤：响应 schema 验证；扩展 outcome；写 ledger；写订单 projection；失败记录 recovery；启动/手工重建；覆盖 disk full。
- 兼容性考虑：旧 submitted 无 remoteId 保持可读并显示“关联缺失”；不伪造 order ID。
- 数据迁移要求：可从现有 JSONL 反向补齐 ledger 的 migration 必须单独 dry-run；本项不自动执行。
- 安全影响：ledger 只存远端 ID/URL，不存 API key/正文。
- 性能影响：写序调整，无显著影响。
- 测试要求：单元/集成、order append ENOSPC、ledger write fail、重启重建、重复 projection 幂等。
- 验收标准：API 返回 `ORDER-9` 后模拟 JSONL 失败，ledger/recovery 中仍能查询 `ORDER-9`，UI显示需修复且不允许重复投稿；恢复后只生成一条订单 projection。
- 发布或启用方式：随 recovery module 启用；先兼容读旧记录。
- 回滚方案：保留新增 remoteId 字段；回退 projection builder 不删除 ledger 事实。
- 潜在回归风险：错误解析 order ID 固化错误关联；需严格 schema。
- 复杂度：中
- 是否可以并行：是
- 并行限制：媒体实现可与 OPT-005/006 并行；publication outcome 文件由 OPT-003 owner 合并。

## OPT-010：使 auth 备份与 restore-check 验证真实目标且零副作用

- 优先级：P1
- 状态：可实施
- 关联发现：F-H13、F-H14
- 目标：备份成功只在 destination 可独立打开、完整、schema/关键数据合理时报告；restore-check 对缺失/错误路径 fail closed 且不创建文件。
- 非目标：不定义组织 RPO/RTO、不覆盖生产数据库、不自动恢复服务。
- 当前问题：backup 校验源库；restore-check constructor 会创建/migrate空库。
- 根本原因：读写 repository adapter 被错误复用于只读验证 seam。
- 代码证据：`auth-server/scripts/backup.js:4-16`、`restore-check.js:4-12`、`sqlite-auth-repository.js:13-16,65-119,226-234`。
- 涉及模块：M29、M30。
- 预计涉及文件：auth backup/restore scripts；新增只读 verifier module/adapter；auth tests/运维文档。
- 前置依赖：OPT-001；真实演练需人工提供隔离路径和备份策略。
- 与其他优化项的关系：可与 desktop 修复并行；属于发布/运维门禁。
- 推荐设计：独立 `AuthBackupVerifier` interface 只接受已存在普通文件，复制到隔离临时目录，以 read-only SQLite 打开，校验 integrity/schema/关键表/计数并输出来源与目标 identity；backup 关闭/flush 后验证 destination。
- 实施步骤：文件存在/类型/realpath 校验；实现只读打开不 migration；backup 后校验 destination；restore-check 隔离副本；输出 schema/count；增加坏/空/缺失/WAL测试；人工恢复演练。
- 兼容性考虑：旧脚本参数保持；缺失路径从“创建空库”改为错误，是有意破坏性修正。
- 数据迁移要求：无；真实 v1 数据迁移另行 dry-run 验证。
- 安全影响：隔离目录权限、备份敏感数据、输出不含密码/token hash明细。
- 性能影响：destination integrity scan 增加备份时间；应记录时长。
- 测试要求：单元/CLI集成、缺失路径不创建、损坏/截断/空库失败、合法备份通过、WAL一致性；人工隔离恢复。
- 验收标准：不存在路径执行后仍不存在且退出非零；篡改 destination 时 backup 命令失败；合法备份在隔离目录启动 repository并保留预期关键计数。
- 发布或启用方式：先在非生产备份副本验证，再替换生产运维命令。
- 回滚方案：保留原备份文件与旧脚本副本但禁止其作为“已验证”证据；验证器失败不删除 destination。
- 潜在回归风险：SQLite read-only/WAL 处理错误导致合法备份误拒绝。
- 复杂度：中
- 是否可以并行：是
- 并行限制：backup 与 verifier implementation 由同一 owner；真实恢复演练必须人工授权。

## OPT-011：最小化并治理诊断截图与河畔临时秘密工件

- 优先级：P1
- 状态：可实施
- 关联发现：F-H03、F-M18
- 目标：失败诊断不保存非必要页面内容；Cookie/正文临时文件在强杀后可安全发现并清理，目录权限可验证。
- 非目标：不删除用户明确需要的结构化诊断，不把 Cookie 写入日志或恢复 journal。
- 当前问题：豆包整页原始截图落盘；Hepan 明文 Cookie/payload 仅靠进程 `finally` 删除且吞 cleanup 错误。
- 根本原因：敏感工件生命周期不是 runtime module 的 interface，只是分散的临时文件 helper。
- 代码证据：`doubao-browser-adapter.js:273-302`、`core/playwright.js:266-271`、`hepan-settings-adapter.js:233-273`、`hepan/adapter.js:114-140,245-247`。
- 涉及模块：M12、M16、M24、M26。
- 预计涉及文件：Doubao diagnostic capture/runtime；Hepan settings/adapter；storage/runtime startup cleanup；安全测试。
- 前置依赖：OPT-001；强杀 owner 与 OPT-004 对齐。
- 与其他优化项的关系：OPT-004 保证正常 cleanup 所有权；本项覆盖异常退出残留。
- 推荐设计：优先取消 PNG，仅保存白名单结构摘要；若必须图像，先在页面内遮罩并裁剪允许区域，再做 fixture 像素测试。建立 `SensitiveArtifact` module，使用严格目录/文件名、普通文件、owner token、年龄和 ACL，提供 create/cleanup/recover interface；可行时以 stdin/pipe 代替落盘。
- 实施步骤：确认诊断最小需求；实现遮罩/无图模式；建立私有目录 ACL 自检；迁移 Cookie/payload；启动扫描严格匹配残留；cleanup 错误形成安全诊断；强杀子进程测试。
- 兼容性考虑：旧诊断 PNG 不自动删除，向用户提供受控清理；新版本读取旧日志不受影响。
- 数据迁移要求：可选的一次性旧残留扫描只报告/确认后清理；不得扫描内容库其他文件。
- 安全影响：直接减少页面、Cookie、正文落盘与备份泄漏。
- 性能影响：像素处理可能增加失败路径耗时；无图模式反而降低开销。
- 测试要求：安全/像素 fixture、路径/ACL、强杀、cleanup failure、启动清理边界、敏感字符串扫描。
- 验收标准：fixture 中的账号/问题/答案像素不出现在输出；强杀后重启仅清理合法过期工件；日志/DTO/恢复记录不含 Cookie、正文或绝对敏感路径。
- 发布或启用方式：先默认无图；如业务确认需要图像，再启用已验证的安全裁剪。
- 回滚方案：退回结构化摘要而非原始截图；临时工件 module 可关闭自动清理但不能恢复宽路径删除。
- 潜在回归风险：诊断信息不足；错误残留匹配可能误删非本模块文件。
- 复杂度：大
- 是否可以并行：是
- 并行限制：Doubao 与 Hepan implementation 可并行；共享 artifact interface 和启动清理由单一 owner。

## OPT-012：永久删除确认绑定 tombstone 版本与短 TTL

- 优先级：P1
- 状态：可实施
- 关联发现：F-M12
- 目标：执行对象必须与用户看到并确认的回收站版本完全一致；旧 token 不可删除新版本。
- 非目标：不改变普通回收/恢复语义，不增加永久删除自动化。
- 当前问题：token 仅绑定 client/article ID，无 `deletedAt`/fingerprint/TTL。
- 根本原因：确认 interface 绑定逻辑 identity，却未绑定不可变对象版本。
- 代码证据：`article-trash-service.js:118-140`、`article-store.js:578-599,633-667`。
- 涉及模块：M07、M18、M19。
- 预计涉及文件：article trash module、IPC DTO、renderer confirmation、trash tests。
- 前置依赖：OPT-001。
- 与其他优化项的关系：OPT-021 处理 prepare 错误反馈；本项处理后端不可绕过安全。
- 推荐设计：token record 包含随机 token、client/article、tombstone fingerprint（至少 deletedAt/status/version）、issuedAt/expiresAt；execute 原子重读比较，restore/re-trash/成功删除清理同文章 tokens。
- 实施步骤：定义 fingerprint/TTL；prepare 保存；execute 重验；restore/trash invalidation；错误码/renderer提示；并发与 fake clock 测试。
- 兼容性考虑：旧 token 在升级后失效并要求重新确认。
- 数据迁移要求：无；token 仅内存。
- 安全影响：防止不可恢复操作 TOCTOU。
- 性能影响：执行前一次 tombstone read。
- 测试要求：单元、prepare→restore→retrash、TTL、双窗口、重复 token、IPC/renderer。
- 验收标准：旧 token 对新 `deletedAt` 返回明确 stale/expired，正文仍存在；同版本有效 token 只能成功一次。
- 发布或启用方式：直接启用 fail closed。
- 回滚方案：保留新 token schema；若 UI 兼容问题只延长 TTL，不移除版本绑定。
- 潜在回归风险：时钟异常或 token 过短导致用户重复确认。
- 复杂度：小
- 是否可以并行：是
- 并行限制：可与 OPT-018 并行，但同改 article trash module 时串行提交。

## OPT-013：为 submission batch 增加跨进程 CAS/排他更新

- 优先级：P1
- 状态：可实施
- 关联发现：F-M13
- 目标：main 与 worker 并发更新同 batch 的不同 item/localArchive 时均不丢失；冲突可检测、重读和重试。
- 非目标：不把 batch 提升为远端事实权威，不迁移到通用数据库。
- 当前问题：所有 mutation 都是整 JSON get→rename，无 revision/lock。
- 根本原因：原子替换只保证文件不半写，没有提供 multi-writer interface。
- 代码证据：`submission-batch-store.js:80-91,139-197`；main/worker 均构造 store。
- 涉及模块：M20、M23、M24。
- 预计涉及文件：batch store/schema、worker/main callers、reconcile/action tests。
- 前置依赖：OPT-001；锁原语参考 OPT-002但不能复用 publication 路径。
- 与其他优化项的关系：OPT-003 写 recovery 后，本项防止 batch projection 丢更新。
- 推荐设计：batch 增加单调 revision；mutation interface 接受 expected revision/目标 item identity，在跨进程锁内重读、只合并指定字段并原子写；冲突有上限重试。caller 不再传整 batch 保存。
- 实施步骤：schema v2/revision；实现 locked mutate；迁移 update/reconcile/rebind/archive；并发两个 store 复现；fault injection；DTO 保留 revision。
- 兼容性考虑：读取旧 batch 视为 revision 0；首次写升级，不改变 item status 语义。
- 数据迁移要求：惰性 schema 升级；备份原文件/失败不写半版本。
- 安全影响：锁与临时文件路径必须在 batch 目录，拒绝 symlink。
- 性能影响：每 mutation 多一次重读/锁，批次规模需 benchmark。
- 测试要求：双进程并发、不同 item、同 item冲突、localArchive、崩溃遗锁、schema兼容、回归。
- 验收标准：100 次并发交错后所有独立更新均保留；同 item 不兼容更新返回稳定冲突而非静默覆盖；重启可继续读。
- 发布或启用方式：先兼容读旧 schema，写时升级；记录冲突指标/日志。
- 回滚方案：新 reader 可导出 v1 projection；不直接用旧代码写已升级 batch，必要时暂停任务并回滚应用。
- 潜在回归风险：锁顺序与 publication 锁组合造成死锁；规定不嵌套或固定顺序。
- 复杂度：大
- 是否可以并行：否
- 并行限制：与 OPT-003 同改 batch/归档接线，不并行；由单一 owner 定义 mutation interface。

## OPT-014：保持媒体 resource target 贯穿 attention 与重试

- 优先级：P1
- 状态：可实施
- 关联发现：F-M14
- 目标：failed media 重试始终绑定原 `targetKey/mediaResourceId/publicationId/latestAttempt`，不会降级为 untracked platform queue。
- 非目标：不允许自动盲重试 uncertain，不改变首次媒体提交预检。
- 当前问题：attention/retry DTO 只保留 `platformId=media`，generic export 吞 resource-required。
- 根本原因：通用 platform interface 无法表达 resource target，却仍宣称 media 可通过它重试。
- 代码证据：`article-attention-query.js:153-182,223-248`、`submission-preparation.js:86-110`、`submission-export-service.js:21-44`。
- 涉及模块：M20、M23、M27。
- 预计涉及文件：attention DTO/policy/resolver、submission retry、media coordinator/bridge/tests。
- 前置依赖：OPT-001；推荐在 OPT-009 完成 remote ID 持久化后。
- 与其他优化项的关系：OPT-009 处理 order identity；本项处理 target identity。
- 推荐设计：attention item 暴露安全的 typed target；resolver 对 media 委托资源级 media submission port，不调用 generic queue export。若没有可验证资源/原 attempt，则只允许查看，不显示 retry。
- 实施步骤：定义 target DTO；query/policy 填充；resolver 路由；media coordinator 重验 article/draft/resource/price/publication；reserve 新 attempt；端到端 failed→attention→retry。
- 兼容性考虑：旧 attention client 忽略新增字段；media generic retry 行为改为明确 unsupported，避免假成功。
- 数据迁移要求：无；从 ledger 已有 targetKey 读取。
- 安全影响：DTO 不含价格秘密/API key/正文；重试需重新确认费用。
- 性能影响：每次预检增加资源/ledger读取。
- 测试要求：单元、集成、资源已下架/价格变化、stale attempt、重复点击、uncertain拒绝、安全 DTO。
- 验收标准：failed `media-resource:R` 重试创建同一 aggregate 的新 attempt 且目标仍为 R；缺失 R 时按钮不可用；不产生 untracked media queue pair。
- 发布或启用方式：先禁用旧 generic media retry，再启用新路径。
- 回滚方案：关闭 media retry并保留查看/人工核对，不回到 untracked 路径。
- 潜在回归风险：资源信息变化导致更多需人工重新选择；必须明确而非静默替换。
- 复杂度：中
- 是否可以并行：是
- 并行限制：attention DTO 可与 media coordinator 分工；最终接口由单一 owner，和 OPT-003 的 attention 改动串行合并。

## OPT-015：统一 renderer 请求身份并阻止过期响应写状态

- 优先级：P1
- 状态：可实施
- 关联发现：F-H01、F-M03
- 目标：client-scoped 生成响应和媒体 initial/invalidation refresh 只有最新、仍挂载且 scope匹配的请求能写状态。
- 非目标：不取消已在主进程成功生成/提交的业务操作；只控制 renderer 应用响应。
- 当前问题：单篇生成比较旧闭包 client；App 初始媒体加载不参与 refresh request sequence。
- 根本原因：请求 identity 由各 caller 临时实现，初始与刷新不是同一 interface。
- 代码证据：`ArticleGenerationView.tsx:175-185`、`ContentWorkbench.tsx:152-175`、`App.tsx:83-106,262-277`。
- 涉及模块：M06、M07、M09。
- 预计涉及文件：renderer request identity hook/module、ArticleGenerationView/ContentWorkbench、App、lifecycle tests。
- 前置依赖：OPT-001。
- 与其他优化项的关系：完成后再实施 OPT-016/020，避免同一 App state 并发修改。
- 推荐设计：一个小 interface 提供 `begin(scopeKey)→token`、`isCurrent(token)`、`invalidate(scope)`、`dispose`；初始和刷新共享序列。生成结果仍持久存在，但过期 UI response 丢弃并触发当前客户安全刷新。
- 实施步骤：定义 scope（clientId/mediaWorkbench）；迁移 initial/refresh/generate；client switch invalidate；unmount dispose；写 deferred promise 交错测试；检查错误也不写错 scope。
- 兼容性考虑：不改 IPC DTO；慢请求返回后可能不显示结果，当前客户刷新可重新发现已保存文章。
- 数据迁移要求：无。
- 安全影响：防止跨客户 UI 数据混入。
- 性能影响：可选 Abort 减少请求；token 检查可忽略。
- 测试要求：renderer 单元/集成、A→B切换、initial→invalidation交错、unmount、错误交错。
- 验收标准：A 请求晚于切换 B 返回时 B state 无 A article；新 refresh 先完成后旧 initial 不能覆盖；控制台无未处理 Promise。
- 发布或启用方式：直接启用；用现有 invalidation 触发回归。
- 回滚方案：按 view 回退但保留 request identity module；客户隔离路径不得回退到旧闭包比较。
- 潜在回归风险：错误 token invalidation 造成结果不显示；需覆盖正常单请求。
- 复杂度：中
- 是否可以并行：否
- 并行限制：ArticleGenerationView 与 App implementation 可并行，但共享 module/interface 先定；与 OPT-016/020 同文件改动串行。

## OPT-016：媒体编辑器完整回读草稿并只保存真实修改

- 优先级：P2
- 状态：可实施
- 关联发现：F-H02
- 目标：打开/关闭稿件不会清除已保存 remark/ignoreImages；保存失败对用户可见。
- 非目标：不重做媒体编辑器，不改变资源选择/预检业务规则。
- 当前问题：effect 清零字段，close 无条件写默认值，错误只 console。
- 根本原因：Article DTO 已含 draft，但 editor implementation 没有按 interface 初始化/dirty tracking。
- 代码证据：`ArticleEditor.tsx:43-51,67-101`、`media-workbench-service.js:230-254`。
- 涉及模块：M09、M27。
- 预计涉及文件：ArticleEditor、App draft handler/types、renderer tests。
- 前置依赖：OPT-001、OPT-015。
- 与其他优化项的关系：与 OPT-020 同属媒体 UI，但文件不同可部分并行。
- 推荐设计：state 从 `activeArticle` 完整初始化；维护 dirty；close 仅在 dirty 时保存，失败阻止关闭并显示错误；切换 article 先完成/确认当前 dirty。
- 实施步骤：初始化 title/remark/ignoreImages；dirty diff；错误 UI；关闭/切换行为；draft roundtrip tests。
- 兼容性考虑：旧 draft 缺字段用空/false；不改变 store schema。
- 数据迁移要求：无；已被覆盖的旧数据无法自动恢复。
- 安全影响：无新增敏感字段。
- 性能影响：减少无效写。
- 测试要求：renderer interaction、service roundtrip、关闭失败、切换 article、旧 schema。
- 验收标准：已有 `remark=x, ignoreImages=true` 打开直接关闭后重读保持不变；修改后只写一次；写失败时编辑器仍打开且显示错误。
- 发布或启用方式：直接启用。
- 回滚方案：保留完整初始化，若 dirty tracking 有问题可暂时总是保存当前真实字段。
- 潜在回归风险：props 更新覆盖用户未保存输入；用 article identity guard。
- 复杂度：小
- 是否可以并行：是
- 并行限制：不与 OPT-015 同时修改 App state 接线。

## OPT-017：以共享 resolver 解析逻辑客户 ID 到物理目录

- 优先级：P2
- 状态：可实施
- 关联发现：F-M09
- 目标：问题/豆包链与资料链共享 `Client.id→real directory` 不变量，目录名可与 ID 不同且路径安全不降低。
- 非目标：不重命名现有客户目录，不改变 research 自有分区。
- 当前问题：question store 直接拼 `clients/<clientId>`。
- 根本原因：客户目录解析复杂性泄漏到多个 store，question store 绕过已有 resolver。
- 代码证据：`client-knowledge.js:248-289`、`question-store.js:61-76,135-137`、`doubao-collection-service.js:30,56-66`。
- 涉及模块：M14、M16。
- 预计涉及文件：client resolver/knowledge、question store factory、Doubao composition、集成测试。
- 前置依赖：OPT-001。
- 与其他优化项的关系：独立，可与 OPT-018/019 并行。
- 推荐设计：共享 resolver module 的 interface 输入逻辑 ID，返回经过 realpath/regular directory 校验的目录；question/material caller 注入同一 resolver，而不是复制路径规则。
- 实施步骤：提取/暴露 resolver；注入 question store；保留 symlink/segment防护；目录名≠ID集成；重复 metadata ID 冲突处理。
- 兼容性考虑：目录名等于 ID 的现有 workspace 行为不变；重复 logical ID应明确拒绝。
- 数据迁移要求：无目录迁移。
- 安全影响：集中 realpath/越界检查，不能为兼容退回直接 join。
- 性能影响：list/resolve 可能扫描客户目录；可安全缓存并随 contentSources invalidation 失效。
- 测试要求：单元/集成、不同目录名、重复 ID、symlink、损坏 metadata、Doubao IPC。
- 验收标准：`folder-name/client.json{id:logical-id}` 可列/建/改/采集问题；越界/symlink仍拒绝；重复 ID返回稳定冲突。
- 发布或启用方式：直接启用兼容 resolver。
- 回滚方案：回退注入但不得迁移/重命名目录；若故障暂停问题操作并保留数据。
- 潜在回归风险：大客户数下重复扫描；需缓存边界。
- 复杂度：中
- 是否可以并行：是
- 并行限制：resolver interface 单一 owner；M16测试可并行。

## OPT-018：为删除事务实现有界、可取消的自动恢复调度

- 优先级：P2
- 状态：可实施
- 关联发现：F-M11
- 目标：transient failure 无需重启可在 bounded backoff 后继续；达到上限转可见 repair，dispose 后不再运行。
- 非目标：不自动越过 identity/fingerprint冲突，不无限重试。
- 当前问题：只有一次启动 recover，没有 timer/backoff/上限。
- 根本原因：transaction store 有 durable cursor，但缺少拥有调度生命周期的 module。
- 代码证据：`article-removal-service.js:290-378,436-443`、`workspace-runtime.js:75`。
- 涉及模块：M04、M19、M23。
- 预计涉及文件：removal recovery scheduler、新 service composition/dispose、attention/invalidation、fake-clock tests。
- 前置依赖：OPT-001；与 OPT-012 同文件变更串行。
- 与其他优化项的关系：不依赖 publication recovery，但应遵循同样的可见 repair 语义。
- 推荐设计：scheduler module 读取 pending transactions，指数退避+抖动+最大次数，执行前锁内重读；成功/needs_repair/上限时停止；interface 仅 `start/wake/dispose/snapshot`。
- 实施步骤：定义 retry policy；实现可注入 clock/timer；workspace own/dispose；mutation 唤醒；失败分类；attention/日志；fake clock和重启测试。
- 兼容性考虑：现有 `retryCount` 继续使用；旧 pending 在启动纳入调度。
- 数据迁移要求：无；可补 `nextRetryAt` 字段并兼容缺失。
- 安全影响：不能自动执行 needs_repair 或 stale plan。
- 性能影响：小；全局单调度队列，避免每事务 timer。
- 测试要求：fake clock、多次 transient、上限、dispose、并发 wake、重启、显式人工 retry。
- 验收标准：前两次 transient 后第三次成功无需重启；超过上限进入 attention 可见状态；dispose 后没有 I/O；同事务不并发执行。
- 发布或启用方式：先较长 backoff/低上限并记录诊断，再调优。
- 回滚方案：关闭 scheduler，保留显式 retry/启动恢复和 transaction 数据。
- 潜在回归风险：错误分类触发重复 destructive action；依赖 cursor 幂等并重验。
- 复杂度：中
- 是否可以并行：是
- 并行限制：scheduler 与 OPT-012 可分别设计，但 article trash/removal 接线串行合并。

## OPT-019：在 ArticleStore interface 提供 generationTaskId 唯一查询

- 优先级：P2
- 状态：可实施
- 关联发现：F-M15
- 目标：handoff 使用真实 production store 判定 0/1/多篇，重复来源明确阻断。
- 非目标：不自动删除重复文章，不把 task ID 改成 article主键。
- 当前问题：唯一 finder 只存在测试 double，生产 fallback 直接取 task.articleId。
- 根本原因：测试跨过真实 module interface，生产 seam 缺少身份查询能力。
- 代码证据：`generation-submission-handoff-service.js:51-70`、`article-store.js:689`。
- 涉及模块：M18、M21。
- 预计涉及文件：ArticleStore、handoff、真实 store 集成测试；可选索引文件另评估。
- 前置依赖：OPT-001。
- 与其他优化项的关系：独立，可与 OPT-017/018 并行。
- 推荐设计：ArticleStore interface 暴露 `findByGenerationTaskId(clientId, taskId)` 的明确结果（missing/unique/conflict），handoff 禁止 fallback 绕过唯一性；先扫描实现，容量证据需要时再加内部索引。
- 实施步骤：定义返回/错误；实现安全扫描；handoff 接入；删除能力超出 production 的 test double；真实 store duplicate/missing测试；容量 benchmark。
- 兼容性考虑：正常唯一数据无变化；已有重复数据变为 conflict，需要人工选择/修复。
- 数据迁移要求：无自动迁移；若引入索引，必须可从文章重建。
- 安全影响：无。
- 性能影响：每 handoff 扫客户文章；批量应一次建立 map，避免每 task N 次扫描。
- 测试要求：单元/真实 store 集成、50/500任务、重复/损坏、symlink、handoff DTO。
- 验收标准：同 task 两篇文章时 preview conflictCount 增加且不入队；唯一时正常；500 task 查询次数不按 task×文章平方增长。
- 发布或启用方式：直接启用 fail closed；冲突显示人工处理。
- 回滚方案：关闭 handoff 自动提交而非恢复 fallback。
- 潜在回归风险：历史异常数据使 handoff 新增阻断。
- 复杂度：中
- 是否可以并行：是
- 并行限制：ArticleStore interface 单一 owner；handoff/UI测试可并行。

## OPT-020：建立有终止、去重和上限的媒体资源分页链

- 优先级：P2
- 状态：可实施
- 关联发现：F-M07
- 目标：异常分页不会请求/累积 600 个重复页；renderer 只按需获取资源。
- 非目标：不承诺具体性能 SLO，未获数据前不引入复杂虚拟化框架。
- 当前问题：仅空页停止、无 ID去重、pageSize 99999跨 IPC。
- 根本原因：远端分页异常被全量 cache implementation 暴露给顶层 App。
- 代码证据：`media-resource-service.js:64-96,203-220`、`App.tsx:83-92,122-128`。
- 涉及模块：M06、M09、M27。
- 预计涉及文件：media resource module/client、IPC DTO、App/ResourceLibrary、tests。
- 前置依赖：OPT-001、OPT-015。
- 与其他优化项的关系：与 OPT-016 可并行但 App 接线串行。
- 推荐设计：resource module 根据可信 total/hasNext/短页终止；ID 去重、重复页 fingerprint、最大资源/页上限；renderer 保存分页查询状态而非全量数组，搜索通过 module interface。
- 实施步骤：确认供应方分页字段；实现多终止条件/去重；设置保守上限；缩小 IPC pageSize；迁移 ResourceLibrary；重复页/超限测试；容量测量。
- 兼容性考虑：若 API 无 total，短页+重复页检测 fallback；资源顺序保持首见顺序。
- 数据迁移要求：刷新时重建 cache并去重；旧 cache仍可分页读。
- 安全影响：减少异常服务耗尽本机资源的 DoS 面。
- 性能影响：显著降低请求、clone和内存；需记录 1k/10k资源。
- 测试要求：单元/集成、重复页、忽略 page、短页、total、上限、renderer 翻页/搜索、性能。
- 验收标准：重复同页最多两次后停止并报告；cache无重复 ID；IPC 单响应不超过配置 pageSize；查询次数由 600 上限降为实际页数/安全阈值。
- 发布或启用方式：先保持旧 cache reader，切换刷新/renderer；观察超限诊断。
- 回滚方案：退回分页 UI仍保留服务端去重/上限，不恢复 99999。
- 潜在回归风险：错误终止条件漏资源；使用 total/短页组合和手工刷新提示。
- 复杂度：中
- 是否可以并行：是
- 并行限制：服务分页与 renderer可并行；App.tsx 与 OPT-015串行。

## OPT-021：把永久删除预检纳入 renderer 错误生命周期

- 优先级：P2
- 状态：可实施
- 关联发现：F-M05
- 目标：prepare/execute 任一步失败都显示可操作错误且无未处理 Promise。
- 非目标：不改变后端永久删除授权；版本安全由 OPT-012负责。
- 当前问题：prepare await 在 try/catch 外，按钮以 `void` 调用。
- 根本原因：UI command interface 没有覆盖“准备确认”阶段。
- 代码证据：`GeneratedArticlesView.tsx:485-506`。
- 涉及模块：M07、M19。
- 预计涉及文件：GeneratedArticlesView/controller、renderer tests。
- 前置依赖：OPT-001；建议在 OPT-012 后接错误码。
- 与其他优化项的关系：与 OPT-012互补，不替代后端校验。
- 推荐设计：controller 拥有 prepare→show confirmation→execute 全生命周期，使用同一 client request identity、busy/error/finally。
- 实施步骤：移动 prepare 入 try；设置/清 busy；client switch 丢弃响应；映射 stale/expired；测试 reject/切换/重复点击。
- 兼容性考虑：无 IPC破坏；只改善错误反馈。
- 数据迁移要求：无。
- 安全影响：减少用户因无反馈重复执行 destructive action。
- 性能影响：无。
- 测试要求：renderer interaction、Promise rejection、client switch、确认 token过期。
- 验收标准：prepare reject 时页面 alert 显示原因、无 unhandled rejection、没有弹确认；成功流程正常。
- 发布或启用方式：直接启用。
- 回滚方案：回退 controller重构但保留外层 catch。
- 潜在回归风险：busy未收敛；用 finally测试。
- 复杂度：小
- 是否可以并行：是
- 并行限制：与 OPT-012改同流程时顺序合并。

## OPT-022：拆分平台命令序列号与 submit busy 生命周期

- 优先级：P2
- 状态：可实施
- 关联发现：F-M06
- 目标：submit/pause交错后 busy 必然收敛，且 stale响应不能覆盖新命令结果。
- 非目标：不替代主进程 run lifecycle（OPT-004）。
- 当前问题：pause递增共享 requestId使 submit finally失去清理权。
- 根本原因：一个计数器同时承担响应新旧判断和资源生命周期所有权。
- 代码证据：`platform-submission-controller.js:28-33,55-81`。
- 涉及模块：M08。
- 预计涉及文件：controller、PlatformWorkbench、`.mjs`行为测试。
- 前置依赖：OPT-001；主进程 phase 与 OPT-004对齐。
- 与其他优化项的关系：在 OPT-004之后实施，避免前后端状态语义再次漂移。
- 推荐设计：每类 command有独立 token；submit operation保留自己的 finalize owner；busy从 active operations/主进程 snapshot派生，不由无关 command窃取。
- 实施步骤：定义 command state；迁移 submit/pause/stop；添加 pending submit→pause→resolve/reject；检查 terminal refresh；更新 view禁用条件。
- 兼容性考虑：外部 controller methods保持。
- 数据迁移要求：无。
- 安全影响：避免重复点击放大任务竞态。
- 性能影响：无。
- 测试要求：`.mjs`单元、renderer集成、stale response、dispose、与主进程 snapshot。
- 验收标准：所有交错最终 submitting/pausing/stopping均 false或由真实 active snapshot解释；按钮无需重挂载恢复。
- 发布或启用方式：直接启用。
- 回滚方案：保留独立 finalize最小修正，回退其余 state重构。
- 潜在回归风险：双来源 busy冲突。
- 复杂度：小
- 是否可以并行：否
- 并行限制：不与 OPT-004同时修改 controller接线。

## OPT-023：保证浏览器自检状态在成功/失败后收敛

- 优先级：P3
- 状态：可实施
- 关联发现：F-M08
- 目标：自检完成后 checking 必为 false，错误/诊断分别显示。
- 非目标：不修改 runtime自检实现。
- 当前问题：成功分支没有清 checking。
- 根本原因：缺少 finally。
- 代码证据：`SettingsView.tsx:37-43`。
- 涉及模块：M10、M12。
- 预计涉及文件：SettingsView、renderer settings test。
- 前置依赖：OPT-001。
- 与其他优化项的关系：独立。
- 推荐设计：command使用 try/catch/finally；load不应覆盖 command checking。
- 实施步骤：finally清理；区分load错误；添加成功/失败/卸载测试。
- 兼容性考虑：无。
- 数据迁移要求：无。
- 安全影响：无。
- 性能影响：无。
- 测试要求：renderer单元/交互。
- 验收标准：成功或失败后按钮恢复可点，成功诊断刷新，失败有 alert。
- 发布或启用方式：直接启用。
- 回滚方案：单文件回退但保留 finally。
- 潜在回归风险：load并发产生闪烁。
- 复杂度：小
- 是否可以并行：是
- 并行限制：可与其他P3并行，避免同改SettingsView。

## OPT-024：将所有 destructive confirmation 收敛到统一模态宿主

- 优先级：P3
- 状态：可实施
- 关联发现：F-M04
- 目标：内容/平台确认统一由 ConfirmationHost 管理焦点、Escape、文案和自动化测试。
- 非目标：不改变后端 confirmed/token校验，不借机重做样式。
- 当前问题：多个生产入口直接调用 native confirm。
- 根本原因：确认 interface 已存在但未成为 caller 唯一 seam。
- 代码证据：`QuestionCollectionView.tsx`、`BatchGenerationView.tsx`、`GenerationBatchDetail.tsx`、`ArticleAttentionPanel.tsx`、`PlatformWorkbench.tsx:111-119` 的 confirm调用。
- 涉及模块：M07、M08、M10。
- 预计涉及文件：上述views、confirmation module/tests。
- 前置依赖：OPT-001；平台 view建议在 OPT-022后。
- 与其他优化项的关系：不与 OPT-012的后端版本绑定混合。
- 推荐设计：唯一 `confirm(options): Promise<boolean>` interface；caller只提供语义文案/tone，宿主拥有portal/focus/Escape。
- 实施步骤：列出所有调用；逐入口迁移；移除native调用；焦点返回/并发确认队列；Electron交互测试。
- 兼容性考虑：确认文案/默认取消保持；Escape必须取消。
- 数据迁移要求：无。
- 安全影响：统一高风险动作呈现，后端仍做最终校验。
- 性能影响：无。
- 测试要求：静态无native confirm、focus/Tab/Escape、每个destructive入口。
- 验收标准：全renderer搜索无业务 `window.confirm/confirm(`；确认打开时焦点受控，取消不发命令，确认只发一次。
- 发布或启用方式：分view迁移但同批验收。
- 回滚方案：回退单入口时使用受控modal，不恢复native confirm。
- 潜在回归风险：同时发起多个确认的队列语义。
- 复杂度：中
- 是否可以并行：是
- 并行限制：不同views可并行；confirmation interface单一 owner。

## OPT-025：按 createdAt 稳定排序文章历史

- 优先级：P3
- 状态：可实施
- 关联发现：F-M10
- 目标：编辑/审核旧文章不改变创建历史顺序；同时间有稳定tie-breaker。
- 非目标：不改变搜索/阶段筛选，不重写时间戳。
- 当前问题：store优先updatedAt，测试固定错误规则。
- 根本原因：implementation/test与明确业务interface漂移。
- 代码证据：`article-store.js:408-419`、`tests/article-store.test.js`现有排序用例。
- 涉及模块：M18、M07。
- 预计涉及文件：ArticleStore、测试、可能文档（实施阶段按权限）。
- 前置依赖：OPT-001。
- 与其他优化项的关系：独立；可与 OPT-019协调同一store变更。
- 推荐设计：normalized createdAt倒序，ID稳定tie-breaker；缺失createdAt的legacy记录采用明确fallback并诊断。
- 实施步骤：确认legacy策略；改comparator；更新错误测试；增加编辑/审核不重排；同时间/无时间测试。
- 兼容性考虑：用户可见顺序改变为既定规范；legacy fallback需稳定。
- 数据迁移要求：不写回时间；无createdAt数据保持只读fallback。
- 安全影响：无。
- 性能影响：无显著影响。
- 测试要求：unit/renderer grouping回归。
- 验收标准：编辑旧文后列表位置不变；createdAt倒序且重复调用稳定。
- 发布或启用方式：直接启用并发布说明。
- 回滚方案：可临时提供“最近更新”另一个视图，但默认不回到错误规则。
- 潜在回归风险：习惯旧顺序用户感知变化。
- 复杂度：小
- 是否可以并行：是
- 并行限制：与 OPT-019同改ArticleStore时串行合并。

## OPT-026：将 auth 来源限速状态改为有界 TTL/LRU

- 优先级：P2
- 状态：可实施
- 关联发现：F-M19
- 目标：任意 loginName 流量下内存 key数量有硬上限，过期 key主动清除，同时保留账号与来源防护。
- 非目标：不单凭应用内Map解决多实例/边缘DDoS，不改变密码算法。
- 当前问题：Map key攻击者可控且成功登录才删当前key。
- 根本原因：限速状态implementation没有容量作为interface不变量。
- 代码证据：`auth-domain.js:197-211,344-350`。
- 涉及模块：M28、部署边缘。
- 预计涉及文件：auth domain/limiter module、server配置、tests/运维文档。
- 前置依赖：OPT-001。
- 与其他优化项的关系：与 OPT-010可并行；多实例方案需要未来架构决策。
- 推荐设计：有界 TTL/LRU limiter，以source聚合全局桶+loginName细桶；周期/请求摊销清理；并发scrypt limiter保持；真实来源头只在可信proxy配置下使用。
- 实施步骤：定义maxKeys/window；实现可注入clock；迁移domain；加入source级上限；压力测试不同loginName；暴露安全计数；核对Cloudflare边缘策略。
- 兼容性考虑：合法用户错误密码语义不变；可能更早触发来源级429。
- 数据迁移要求：无，内存状态重启清空。
- 安全影响：降低内存/CPU耗尽；不能信任任意转发头。
- 性能影响：固定内存，清理开销需O(1)摊销。
- 测试要求：unit、fake clock、100k不同loginName压力、并发、proxy来源、安全测试。
- 验收标准：压力后key数不超过配置上限、heap稳定；窗口过期后合法登录恢复；单来源攻击被限速。
- 发布或启用方式：先观测阈值，再启用来源级拒绝；边缘限速同步配置。
- 回滚方案：调高阈值/关闭来源附加桶，不恢复无界Map。
- 潜在回归风险：NAT下多个用户共享来源导致误限。
- 复杂度：中
- 是否可以并行：是
- 并行限制：auth代码独立，可与desktop项并行；proxy现场配置需人工。

## OPT-027：把订单“清空记录”改为非破坏性且真实的语义

- 优先级：P3
- 状态：可实施
- 关联发现：F-L01
- 目标：按钮文案与行为一致，不暗示持久删除审计记录。
- 非目标：不在没有保留策略/审计决策时实现永久删除订单。
- 当前问题：按钮写“清空记录”，实际只清当前React state。
- 根本原因：UI action命名没有反映状态所有权。
- 代码证据：`OrdersView.tsx:95-102`、`App.tsx:245-248`。
- 涉及模块：M09、M27。
- 预计涉及文件：OrdersView/App、renderer test。
- 前置依赖：OPT-001。
- 与其他优化项的关系：独立。
- 推荐设计：改为“隐藏本次列表/重置筛选”并明确刷新恢复；更推荐移除按钮，保留筛选。若未来要删除，另做带保留策略和确认的work item。
- 实施步骤：选择安全文案；移除误导Trash图标/行为；测试刷新语义；帮助文本说明审计记录所有者。
- 兼容性考虑：不删除数据，最安全。
- 数据迁移要求：无。
- 安全影响：保留订单审计。
- 性能影响：无。
- 测试要求：renderer interaction/刷新。
- 验收标准：界面不再声称持久清空；任何操作后刷新行为与文案一致。
- 发布或启用方式：直接启用。
- 回滚方案：移除该操作而非恢复误导文案。
- 潜在回归风险：用户失去临时清屏能力，可用筛选替代。
- 复杂度：小
- 是否可以并行：是
- 并行限制：可与其他P3并行。

## OPT-028：决定 publish-log 的产品 interface（暂缓）

- 优先级：暂缓
- 状态：暂缓
- 关联发现：F-M02
- 目标：在明确实时日志需求后，要么删除死sender，要么提供最小、类型化、安全的消费interface。
- 非目标：当前不新增宽泛renderer日志流，不把原始error/path无过滤暴露给UI。
- 当前问题：sender无consumer，但文件日志仍可诊断，未有UI日志契约。
- 根本原因：历史观测意图未形成产品决策。
- 代码证据：`workspace-runtime.js:89`、`platform-ipc.js:229`、`preload.js:1-202`无对应能力。
- 涉及模块：M05、M08、M11、M24。
- 预计涉及文件：待决策；可能只删除sender，或新增typed event/renderer panel。
- 前置依赖：决定用户是否需要实时日志、保留/脱敏标准。
- 与其他优化项的关系：OPT-003必须独立提供durable attention，不能依赖本项日志。
- 推荐设计：故障恢复用结构化attention；日志仅作诊断。无明确UI需求则删除sender；有需求则小DTO、级别/代码/时间，不含正文/秘密/绝对路径。
- 实施步骤：收集需求；威胁模型；选删除或typed event；契约测试；负载/脱敏验证。
- 兼容性考虑：当前无consumer，删除sender无用户可见破坏。
- 数据迁移要求：无。
- 安全影响：避免随意扩大renderer信息面。
- 性能影响：事件流可能增加clone/渲染负担。
- 测试要求：若实施，事件契约/脱敏/高频背压；若删除，静态无死channel。
- 验收标准：只能在决策后定义；不得以“事件能收到”代替用户价值和脱敏验收。
- 发布或启用方式：默认继续暂缓。
- 回滚方案：文件日志保持。
- 潜在回归风险：过宽日志泄漏内部信息。
- 复杂度：小/中（取决于决策）
- 是否可以并行：是
- 并行限制：不阻塞其他项；不得混入OPT-003作为恢复机制。

## OPT-029：确定平台账号模型并决定是否扩展 publication target

- 优先级：待决策
- 状态：需要决策
- 关联发现：F-M17
- 目标：队列预期账号与执行账号规则明确；换号时不会无提示投到错误账号。
- 非目标：未决策前不擅自引入多账号UI、迁移所有publication key或复制browser profile。
- 当前问题：session/login只证明“某账号已登录”，target仅平台粒度。
- 根本原因：业务 ubiquitous language 未定义平台账号是否是发布目标identity的一部分。
- 代码证据：`toutiao/adapter.js:63-140`、`lieju/adapter.js:41-80`、`publication-targets.js:3-67`。
- 涉及模块：M20、M22、M25、renderer设置。
- 预计涉及文件：取决于决策；adapter账号探测、profile配置、target schema/ledger migration、queue sidecar/UI/tests。
- 前置依赖：产品决定单账号约束或正式多账号能力；平台能否稳定读取账号ID的现场证据。
- 与其他优化项的关系：与 OPT-006分开；先保证文章级成功证据，再迁移target身份。
- 推荐设计：若只支持单账号：设置保存expected account fingerprint，执行前不匹配即阻断并要求重新确认。若支持多账号：账号ID进入targetKey/profile/queue sidecar，提供兼容期和显式migration。
- 实施步骤：业务决策；采集脱敏账号标识；设计两种interface比较；选择方案；写migration dry-run；实现队列/执行重验；换号测试。
- 兼容性考虑：多账号方案会改变去重域，是破坏性schema变化；旧platform target需映射到“legacy unknown account”且禁止自动重试。
- 数据迁移要求：多账号方案需要publication/sidecar/profile migration与回滚映射；单账号方案只需配置fingerprint。
- 安全影响：防止错误账号发布；账号ID必须脱敏且不记录Cookie。
- 性能影响：每次执行前一次账号探测。
- 测试要求：adapter fixture、账号切换E2E、migration、旧队列兼容、安全DTO。
- 验收标准：换号后旧队列明确阻断；记录可证明目标账号identity；旧记录不会被错误合并到新账号。
- 发布或启用方式：单账号阻断可先行；多账号需双读兼容期和分阶段迁移。
- 回滚方案：停止新队列、保留旧/新target映射；不得把不同账号记录重新合并。
- 潜在回归风险：平台无法稳定暴露账号ID；迁移错误破坏去重。
- 复杂度：中（单账号）/大（多账号）
- 是否可以并行：否
- 并行限制：决策前仅允许现场只读探测/fixture；target schema由单一owner。

## 5. 实施批次

### 批次 0：可信门禁

- 包含：OPT-001。
- 为什么：没有可发现且一致的门禁，后续任何修复的验证不可被合并流程信任。
- 前置条件：Git 基线无代码漂移；根workflow可作为可移植配置被静态验证。
- 执行顺序：workflow/cwd → test收集 → production seam tests → canonical本地门禁 → 本地里程碑commit。
- 可以并行：不建议。
- 不允许并行：不得多人分别定义旧/新seam。
- 批次级测试：默认 test/auth/lint/typecheck/build/link/packaging；静态workflow契约。
- 批次完成标准：canonical本地门禁全绿、收集清单包含 `.mjs`、无影子seam红测并有本地里程碑commit；file symlink能力不足时保持BLOCKED。
- 失败时停止条件：适用本地门禁失败、默认套件仍红或无法确定production seam时，停止后续合并。
- 回滚策略：回退配置；临时保留人工门禁，重新修正后再进入批次1。

### 批次 1：发布阻断、安全与灾备隔离

- 包含：OPT-007、OPT-008、OPT-010、OPT-011、OPT-012。
- 为什么：这些项可在不改变远端事实核心状态机前关闭制品不可用、灾备假阳性、秘密落盘和删除TOCTOU。
- 前置条件：批次0完成；敏感fixture/隔离备份路径获授权；OPT-008按已接受的媒体HTTP例外实施。
- 执行顺序：007/010/011可并行；008与其他媒体settings/client修改串行 → 012 → production/DR/security联合验收。
- 可以并行：007、010、011、012由不同文件owner并行。
- 不允许并行：OPT-007与OPT-005同改Hepan adapter时不并行；OPT-011的artifact interface单一owner。
- 批次级测试：production `--dir` smoke、auth坏/缺失备份、强杀残留、截图脱敏、删除token版本。
- 批次完成标准：河畔脚本在最终目录执行；restore-check零副作用；敏感残留/截图验收通过；旧token不能删新版本。
- 失败时停止条件：任何测试接触真实生产数据、清理范围无法严格证明、HTTP无需确认即可发送或HTTPS会静默降级时停止。
- 回滚策略：保留备份/旧记录，关闭相关功能；不恢复隐式公网HTTP、原始截图或宽路径清理。

### 批次 2：远端事实与进程生命周期基础

- 包含：OPT-002、OPT-003、OPT-004、OPT-013。
- 为什么：四项共同建立锁、recovery intent、run owner和batch projection的一致协议，是最高风险且互相依赖的核心。
- 前置条件：批次0完成；状态/锁/恢复ADR或等价设计评审通过；故障注入环境可用。
- 执行顺序：OPT-002 → OPT-003 interface/schema → OPT-004接入interruption → OPT-013 batch CAS → 联合fault injection。
- 可以并行：仅可并行准备测试fixture/故障矩阵。
- 不允许并行：四项会触碰publication、worker、batch核心文件，默认串行。
- 批次级测试：两进程并发、锁遗留、远端各故障点强杀、旧消息、重启、attention/reconcile、batch lost update。
- 批次完成标准：未知远端结果永不盲重试；known outcome未落账不归档；旧worker不污染新run；batch更新不丢。
- 失败时停止条件：出现无法解释的状态组合、自动把unknown判failed/published、误回收活锁或恢复不可回滚时立即停止。
- 回滚策略：保留recovery数据、关闭自动转换/新任务，使用兼容reader人工核对；不得删除intent。

### 批次 3：Adapter 与媒体目标语义

- 包含：OPT-005、OPT-006、OPT-009、OPT-014。
- 为什么：在核心远端事实interface稳定后修平台特有证据、订单identity和资源级重试。
- 前置条件：批次2完成；OPT-006有批准fixture/测试账号；OPT-009明确媒体响应schema。
- 执行顺序：OPT-005与OPT-009并行 → OPT-006验证/实现 → OPT-014接资源级retry → E2E。
- 可以并行：Hepan、浏览器fixture、媒体order三个adapter轨道。
- 不允许并行：共享publication outcome/evidence interface和attention DTO由单一owner合并。
- 批次级测试：fake remote断连、DOM负向fixture、order ENOSPC、media failed→attention→同资源retry。
- 批次完成标准：弱页面信号不published；Hepan模糊失败uncertain；order ID可恢复；media retry不再untracked。
- 失败时停止条件：必须真实付费/生产投稿才能继续、fixture未脱敏、目标identity不确定时停止production启用。
- 回滚策略：adapter退为uncertain/禁用retry，保留ledger/recovery，不恢复弱成功判断。

### 批次 4：内容身份与事务恢复

- 包含：OPT-017、OPT-018、OPT-019。
- 为什么：三项改善本地内容/生成/删除一致性，彼此文件交叉有限，可在发布核心稳定后实施。
- 前置条件：批次0完成；批次2的文件锁/恢复原则可复用但不强依赖上线。
- 执行顺序：017/019并行 → 018 → 内容/删除联合回归。
- 可以并行：客户resolver与article唯一查询。
- 不允许并行：同改ArticleStore/trash接线的任务串行。
- 批次级测试：逻辑ID≠目录、duplicate generationTaskId、fake-clock backoff、needs_repair、500任务容量。
- 批次完成标准：合法客户采集可用；重复task阻断；transient删除无需重启恢复且有上限。
- 失败时停止条件：路径安全退化、重复文章被自动删除、恢复重复执行destructive action时停止。
- 回滚策略：禁用handoff/自动scheduler，保留数据与显式repair；resolver不重命名目录。

### 批次 5：Renderer 正确性与容量

- 包含：OPT-015、OPT-016、OPT-020、OPT-021、OPT-022。
- 为什么：先统一请求identity，再修草稿、分页和命令生命周期，减少同一App/controller冲突。
- 前置条件：批次0完成；OPT-022等待OPT-004 phase稳定。
- 执行顺序：015 → 016/020/021并行 → 022 → renderer E2E。
- 可以并行：016、020、021在identity interface稳定后。
- 不允许并行：015与020同改App；004与022同改平台command接线。
- 批次级测试：deferred promise交错、客户切换、草稿roundtrip、重复分页、delete prepare reject、submit/pause交错。
- 批次完成标准：无过期响应覆盖、无草稿清零、资源有界、所有busy收敛、无unhandled rejection。
- 失败时停止条件：出现跨客户state、稿件保存失败仍关闭、资源漏页无诊断或按钮永久busy时停止。
- 回滚策略：逐view回退，保留安全request guard和服务端分页上限。

### 批次 6：普通 UX、可用性与待决策事项

- 包含：OPT-023、OPT-024、OPT-025、OPT-026、OPT-027；OPT-028暂缓；OPT-029待决策。
- 为什么：低风险交互与长期可用性不应混入核心安全/事实修复；账号schema必须独立决策。
- 前置条件：前述相关核心项完成；OPT-029取得产品决定和外部账号标识证据。
- 执行顺序：026可独立；023/024/025/027并行；029另开兼容迁移；028仅决策后排期。
- 可以并行：不同renderer view与auth limiter。
- 不允许并行：029的target schema不能与其他publication迁移并行；024 confirmation interface单一owner。
- 批次级测试：focus/Escape、排序、订单语义、100k limiter压力、账号切换/migration（若实施）。
- 批次完成标准：P3可观察验收全部满足；limiter有硬上限；待决策项要么实施完成，要么保持明确阻塞而非默认假设。
- 失败时停止条件：账号迁移无法双读回滚、proxy来源不可信或确认宿主有焦点陷阱时停止相关子项。
- 回滚策略：P3按子项回退；limiter调阈值不恢复无界；账号迁移停止新写并保留映射。

## 6. 全局并行策略

- 同一核心文件、publication/batch schema、公共 DTO 或共享状态默认不并行。
- 真正可并行的是外部 adapter fixture、auth DR、renderer不同view和安全工件不同implementation；最终interface仍由一个owner合并。
- 测试与production caller必须穿过同一seam；不为并行开发暴露额外公共port。
- OPT-008按D-001已接受的媒体HTTP例外实施；OPT-029在决策前只允许只读现场核对和fixture准备，不得猜测账号模型。

## 7. 全局发布与回滚策略

1. 先门禁、再兼容reader、再新write、最后启用自动恢复/严格阻断。
2. 新持久schema（lock、recovery intent、batch revision、可能account target）必须先双读，写入后旧版本不得继续修改同workspace。
3. 未知远端结果的回滚原则是“保留、阻断、人工核对”，绝不能回滚为failed并自动重试。
4. 安全项回滚不得恢复隐式公网HTTP或绕过显式确认，也不得恢复原始页面截图或无边界临时文件清理。
5. 每批次以独立版本/feature flag启用；失败时停止新任务，保留ledger、intent、batch、order和备份证据，再回退可执行文件。
