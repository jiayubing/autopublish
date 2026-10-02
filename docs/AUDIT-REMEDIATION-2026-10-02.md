> 本文件保留已有未提交审计证据；下文状态、协议名称与测试结果按记录时点解释，不作为当前调度。剩余事项统一见 [work](work.md)，开发与有限复审规则见 [development](development.md)。

# 2026-10-02 审计修复

> 后续补充报告 `autopublish-audit-remediation-plan.md` 的对账与本轮验证见文末“补充计划对账”。前文保持历史证据，不代表本轮重新执行了安装包或真实外部验收。

当前状态：A01–A08 代码修复、有限复审及本地验证完成；旧版无 owner 锁保留人工核对边界，不是发布放行。用户授权按 `autopublish-audit-zh.md` 开始修复。
基线 HEAD：c17a0f48；工作区已有性能优化改动，保留，不归入本次修复证据。

## 范围与顺序

依次闭合 A01/A04 鉴权入口与事务、A02 知识生成锁恢复、A03 客户生成不确定结果、A05 批次取消、A06 付费预检租约、A07 问题导航、A08 CI 失败传播。
仅使用合成数据、隔离文件/SQLite、假 transport 与本机测试；不执行真实调用、发布、付费、生产迁移、push 或部署。

## 验证与收敛

每个 finding 补公开行为回归，先运行定向测试，再运行受影响工具链及集成门禁。
Primary Audit 采用用户提供的报告；复审遵守 `.scratch/article-lifecycle-and-submission/AUDIT-PROTOCOL.md`，仅覆盖八项修复及直接不变量。
依赖与 CI 后续修复见下节；真实质量、签名发布和远端 CI 证据不以本地测试代替。

## 进度与证据

- 已核对报告版本、入口文档、局部规则与 dirty 工作区。

| Finding | 原因与修复 owner | 本地回归 |
| --- | --- | --- |
| A01 / EXPOSED_PREEXISTING | auth HTTP 入口捕获 URL 解析错误，返回 AUTH_INPUT_INVALID/400；最终异步异常保护避免请求处理拒绝退出进程 | 独立子进程发送 `//[` 后继续成功请求存活端点 |
| A02 / INTRODUCED_BY_CHANGE | continuous knowledge 锁记录 PID 与随机 owner 身份；只回收能证明进程已退出的 owner；只有成功移除该精确 owner 的竞争者可移除目录；保留旧 run 文件 | 子进程请求中退出，新 run 成功；活跃 owner 不被抢占；原 run 文件保留 |
| A03 / EXPOSED_PREEXISTING | 客户生成复用 V2 不确定结果分类；uncertain 不自动重发、不进入失败重试；任务、作业、计数、IPC、类型与页面同步 | timeout/network/server/request-failed 各调用一次且无 sleep；重试命令不重发；页面显示费用提示和不确定状态 |
| A04 / EXPOSED_PREEXISTING | 登录事务返回 failureCode，提交失败事实后在事务外抛异常 | 临时 SQLite 连续失败达到阈值，重开后计数、失败审计、账号锁定均保留 |
| A05 / CROSS_COMPONENT_INTERACTION | batch store 只在任务全部成功/取消时完成；保留 uncertain；页面按 uncertain 计数显示核对入口，活动运行期间不开放新批次 | uncertain + pending → 暂停 → 取消 → 重开，仍为 uncertain + cancelled；旧 completed 摘要不隐藏核对入口 |
| A06 / EXPOSED_PREEXISTING | 付费编排器每 10 秒续租 30 秒 claim，预检结束再次确认；续租失败停止发送并暂停、释放自有 claim；finally 清理 timer | 真实临时 SQLite/可控时钟：40 秒预检成功、31 秒过期、续租失败、停止交错；失败零远端调用；终止后无续租 |
| A07 / INTRODUCED_BY_CHANGE | ContentWorkbench 保留问题及客户身份，传入既有新批次向导；切换客户或离开向导清理导航意图 | 两个 ready 问题、旧批次存在时，选择第二个问题只预选该问题并进入 wizard |
| A08 / PROCESS_EVIDENCE_GAP | Windows toolchain 每条 npm 命令之后立即检查 LASTEXITCODE | CI 架构合同验证六条命令均有失败退出检查 |

### 有限复审

- 只检查上述 owner、直接调用方、IPC/UI 及新增状态组合；没有另开全仓审计。
- A03 公开 DTO 新增 uncertain，复审扩展到生产 IPC registry fixture、renderer types、结果等待入口与页面进度。
- A04 事务失败返回值沿用已有密码修改路径的模式，审计写入失败仍回滚；不改变 schema。
- A02 清理失败不得覆盖原始目录创建错误，已修正并重新验证。恢复入口拒绝符号链接/junction 锁目录，防止移除外部 owner 文件；以真实 junction 合成回归验证，外部文件保留。
- 保留未知/活跃锁与旧不确定请求；不通过重发模型请求恢复旧作业。

### 已运行的验证

环境：Windows PowerShell、Node v24.16.0、npm 11.13.0。结果绑定本次 dirty 工作区，不称为 clean HEAD 或远端 CI 证据。

| 命令 | 结果 |
| --- | --- |
| `npm test` | 最终代码 667/667，零失败/跳过 |
| `node --test tests/*.test.js`（auth-server） | 66/66，零失败/跳过 |
| `node --test tests/renderer-geo-knowledge.test.js` | 11/11，包含 A03/A05/A07 浏览器回归 |
| `node --test tests/customer-continuous-knowledge.test.js tests/article-lifecycle-ticket-13.test.js tests/ci-workflow-contract.test.js` | 最后局部修正后 55/55 |
| `npm run test:integration` | 两轮均 1338/1338，零失败/跳过；最后一轮期间新增的锁链接拒绝防护随后以核心 667 项及锁定向 31 项验证 |
| `npm run lint` | 最终代码通过 |
| `npm run typecheck:main` / `typecheck:renderer` / `typecheck:bridge` | 通过；renderer build 再次包含 renderer typecheck |
| `npm run format:check` | 修正本次 CI 测试格式后通过 |
| `npm run build:renderer` / `build:preload` | 通过；renderer 保留现有 bundle-size 警告 |

中间验证如实保留：首次新 store 测试使用错误的方法名，改为公开 createOrGetV2；浏览器首次使用不匹配的页面选择器、错误假设的 aria 属性，改用真实向导流程和可见处理计数。最终有效断言未降低。
最终 sourceState 清单：`auto—publish/build/audit-remediation-source-state.json`，绑定基线 c17a0f48ec51611d9f5bb1a0e4d224983a657af6 与 36 个变更代码/测试/CI 文件（含保留的用户改动），SHA256 为 `8248a99dab4be92bf2f16116c3eb81fa38b0b605bb9ede34d454967b9e292f7a`。文档不计入该清单。`git diff --check` 通过。

完整日志位于应用目录忽略路径 `build/audit-remediation-*.log`，未提交构建产物或日志。

## 剩余边界与后续 owner

- A02：旧版无 owner 的空锁、权限无法探测的 owner、PID 复用后的活跃进程均保守拒绝回收；需要在确认全部旧进程退出后由内容库运维核对。未检查或删除真实客户锁目录。新格式写 owner 前、或回收时移除 owner 后发生系统崩溃也可能留下未知空锁，此时同样停止猜测。
- 客户生成跨重启恢复的缺口已在下述收尾阶段实现；真实供应商结果仍不能由本地记录推断，不确定任务禁止自动重发。
- 签名安装包、升级、OS 密钥库、真实模型质量、真实发布和付费仍由发布及对应外部验收 owner 处理；未运行远端 CI 或真实外部业务操作。
- 原有性能优化 dirty 改动全部保留。本次未 stage、commit、push、创建 PR、合并或部署；测试结果不是发布放行结论。

## 同日后续修复

用户授权继续依赖、CI 与本地打包验证。仅升级 lockfile 范围内兼容版本：根 undici 6.29.0，嵌套 undici 7.30.0；renderer browserslist 4.29.3、nanoid 3.3.19、postcss 8.5.28、baseline-browser-mapping 2.11.27 及关联数据依赖。根生产依赖 `npm audit --omit=dev --json` 与 renderer 完整 `npm audit --json` 均返回零告警。应用使用 cheerio.load，没有直接调用受影响的 undici API；未据此宣称存在已利用漏洞。

CI 增加 PR Electron focus 门禁、push 解包程序导航门禁、renderer 依赖审计；客户选择 hydration 测试回归普通 desktop-core。测试 evidence 现在拒绝 skipped/todo 或零计数伪绿，五个 CLI 行为回归覆盖通过、失败、跳过、todo 和 Node 文件级 smoke。

打包导航首次暴露旧 fixture 缺少 canStart，按现行合同补齐。随后 20 轮导航均收敛，但 30ms 连续切六页场景可能在 OrdersPage lazy mount 前离开；此场景同步次数合同改为 0–1，仍禁止重复同步与其他写操作，其他已进入订单页场景仍严格要求一次。修复后两项解包测试全部通过，涵盖 20 轮导航及平台登录按钮到隔离 IPC 的调用；没有真实登录。

本地验证：renderer/preload 构建、lint、main/renderer/bridge typecheck、format 均通过；核心 667/667；集成 1343/1343，零失败/跳过/todo；CI/evidence/hydration 定向 12/12；Node 22.23.3 鉴权 66/66；Electron focus 1/1、开发冷启动导航 1/1。诊断目录包输出在 `auto—publish/build/evidence/audit-followup-package`，完整离线 package smoke 通过（main/preload/renderer、Playwright、迁移 CLI、schema 与存储边界）。这是未签名诊断包，不是可发布安装包。日志位于 `auto—publish/build/audit-followup-*.log`。

额外运行已被 desktop-core 排除的 `phase-06-production-ipc-fixture-matrix.test.js`，6 项中 4 项失败：旧 fixture 集合仍含 createAndStartBatch，缺少现行 V2 capabilities，导致 registry 查找为空。此次新增 canStart 的运行时 fixture 验证通过；旧全量矩阵覆盖缺口登记给 IPC 合同测试 owner，未以删除断言或过滤能力掩盖。

客户工作区仅按授权读取运行元数据：未发现遗留锁，失败是 K 阶段引用校验错误且远端响应已确认。用户明确暂不检查内容；未读取正文、删除锁、恢复文件、重新生成或修改内容库。

后续最终代码清单：`auto—publish/build/evidence/audit-followup-source-state.json`，43 个代码/测试/配置文件（含保留的用户改动），SHA256 `50ddc3b54095ea4f0e2918a91caa839b9737d61a285d0a47cfcf1406bfcf1c1a`。基线 HEAD 未变，工作区仍 dirty、未暂存或提交；最终 `git diff --check` 通过。后续清单取代前一阶段清单用于本轮证据，不声称远端 CI 或签名发布已完成。

## 持续收尾（用户授权，德瑞排除）

- IPC 全量矩阵移除已退役的 createAndStartBatch/regenerateAttentionItems fixture，补齐三个 V2 入口，保留完整 registry 集合等价断言；6/6 通过。
- 客户生成 feature 在事件到来时废弃此前查询及命令返回值；订阅先于 hydration 建立。查询、start、retry 三种交错均保留已收到的 completed 状态。
- 唯一客户生成 service 保持任务状态 owner；新增文件 store 只负责原子落盘和路径边界，组合层注入。复用进程 owner 锁（改名 content-process-lock），存储前置于远端发送；重启恢复成功文章、保留 uncertain、不自动调度。写失败停止继续发送；持久化只保留安全错误代码及固定提示，不写原始供应商异常。
- 回归覆盖真实子进程 exit、活跃 owner 排斥、未发送项手动重试、不确定项零重发、成功文章与最终任务落盘之间故障。恢复及知识锁组合 50/50 通过。
- IPC 主组合在统一入口要求当前主窗口及主 frame，覆盖鉴权和业务 IPC；非法 sender 在 handler 执行前拒绝。
- Windows 当前用户 OS safeStorage 实际加密/解密合成值通过，cipher 不含明文。未读取真实密钥；本机可用代码签名证书数量为 0，CSC_LINK 未配置。
- 未签名 NSIS 安装包已构建，位于应用 `build/evidence/audit-closure-installer/`。未把未签名安装包称为签名发布；安装/升级需要隔离 Windows 环境，不能覆盖用户现有应用和注册表状态作验收。
- 真实模型与发布/付费验收仍缺指定测试账号、测试内容及额度上限；已向用户询问所需信息。德瑞的内容及工作区不参与这些验收。
- 最终 desktop-core 2089/2089，零失败/跳过/todo；鉴权 66/66、IPC 全矩阵 6/6、最终打包合同 29/29，通过 lint/main/bridge typecheck、renderer/preload 构建与 format。打包内容检查暴露嵌套 `.playwright-cli` 运行记录漏排除，修复 alpha glob 后重建，`verify-alpha-package` 通过；此前失败包已由重建替换，未上传或交付。打包导航 2/2（20 轮导航及隔离登录 IPC）通过，包重建只修改排除规则。
- 审计改动按鉴权、生成、付费预检、IPC sender、依赖、CI、打包分成独立提交，位于 `codex/audit-closure-20261002`，产品代码提交末端 `0322c03e`。用户原性能优化仍保留为未提交改动，不混入审计提交。远端 PR/CI 按本次持续授权推进，结果以实际 run 为准。

## 补充计划对账（2026-10-02）

本轮用户要求按 Downloads 中 `autopublish-audit-remediation-plan.md` 修复，并提示报告可能落后。对账基线为分支 `codex/audit-closure-20261002`、HEAD `e1e93ef287d9cab958b05af97c8a373178541a7e`；报告审计基线为 `c17a0f48ec51611d9f5bb1a0e4d224983a657af6`。已有性能优化的 12 个 tracked dirty 文件及相关 untracked 文件保持原样；本轮未 stage、commit、push、开 PR、部署或执行真实业务操作。

### 缺陷状态

| 编号 | 对账结论与本轮验收 |
| --- | --- |
| A01 | 已有修复，重新验证关闭：独立子进程接受畸形 URL 后继续响应正常请求；鉴权全套通过。 |
| A02 | 已有修复，补足竞争回收验收后关闭：两个真实子进程竞争已退出 owner 的锁，只有一个进入假模型请求；旧 run 的全部文件内容保留。原有崩溃恢复、活跃 owner 排斥、junction 拒绝测试通过。无身份/不可确认的旧锁继续保守拒绝。 |
| A03 | 已有修复，重新验证关闭：timeout/network/server/request-failed 不自动重发，uncertain 禁止失败重试，跨重启保留结果；页面保留不确定提示。 |
| A04 | 已有修复，重新验证关闭：临时 SQLite 错误密码计数、锁定、审计在数据库重开后保留。 |
| A05 | 已有修复，重新验证关闭：取消 pending 保留 uncertain 事实及核对入口，落盘重读和既有组合测试通过。 |
| A06 | 已有修复，重新验证关闭：40 秒持续续租、31 秒过期、续租失败、停止交错及 timer 清理均通过；不安全状态下远端调用为零。 |
| A07 | 已有修复，重新验证关闭：旧批次与两个 ready 问题存在时，单问题入口只预选目标问题并进入新向导。 |
| A08 | 已有修复，补足实际失败传播验收后关闭：执行当前 CI 的 PowerShell 命令块，以隔离 npm.cmd 返回 7，确认步骤退出 7 且后续命令未执行；返回 0 时整条链执行完成。取代固定六条命令及 guard 拼写断言。 |
| A09 | 仍存在，本轮修复并验证关闭：主进程与 renderer 共用纯 JSON 端点地址，选项和提示使用同一地址；Coding Plan/标准接口往返切换显示正确文案，未保存配置禁用测试，切换零保存/零生成/零测试请求。旧地址迁移、非法地址拒绝与能力拒绝后不切换/不重试回归通过。 |

### 精简与延期

- G01：当前核心 61 文件、integration 248、maintenance 16、release 14。报告提及的 hydration、Electron focus、packaged navigation 已有明确 CI 归属，CI 合同复验通过。本轮未把 desktop-core 偷换成 core，未重新运行 Electron 或发布包验收。
- G02：`verify` 复用现有 runner 的 core 集合，过滤 focused 组的重复文件。执行次数 **93 → 89**，唯一文件集合仍为 **89**，双向集合差为空。去重的是 `template-generation-contract`、`article-submission-eligibility`、`article-attention-query`、`article-attention-policy` 四个测试文件。命令入口仍为 `npm run verify`，保留三个定向组、core 与 renderer build；没有删测试断言。新增命令回归逐个注入失败，确认立即停止。完整集合证据在应用 `build/audit-plan-coverage.json`。
- G03：本轮只将 A08 的源码形状断言改为实际失败传播验证。其余 renderer 形状约束、capacity 安全用例拆分，以及 auth/links/capacity 的 CI 消重延期给测试基础设施 owner；未删减其现有执行归属。
- G04：普通 push 与发布候选流水线进一步拆分延期给发布工程 owner。本轮未改发布 evidence、安装包触发方式或必要门禁。
- PERF01/PERF02/PERF03：本轮不做性能优化或收益声明；未测量这些建议，不能宣称已完成。既有 dirty 性能工作由规模审计计划维护，避免交叉修改。后续由生成 service/store owner 按报告先测量，再决定优化。
- OPT01–OPT03：本轮未触及对应架构 owner，依报告的可选边界延期；不新增 OperationalStore/RPC/研究工作流抽象。

### 本轮实际验证

环境：Windows PowerShell，Node `v24.16.0`，npm `11.13.0`。结果绑定上述 HEAD 加当前未提交工作区，不是 clean HEAD 或远端 CI 结果。

| 命令（应用目录，另有注明除外） | 结果 |
| --- | --- |
| `node --test --test-name-pattern='GEO endpoint selection' tests/renderer-geo-knowledge.test.js`（修复前） | 1 项失败，Coding Plan 正确提示不可见，复现 A09。 |
| `node --test tests/*.test.js`（auth-server） | 66/66，零失败/跳过。 |
| `node --test tests/geo-coding-plan.test.js tests/renderer-geo-knowledge.test.js tests/customer-continuous-knowledge.test.js tests/client-generation-tasks.test.js tests/generation-batch-store.test.js tests/article-lifecycle-ticket-13.test.js tests/ci-workflow-contract.test.js tests/verify-command.test.js` | 最终定向 118/118，零失败/跳过。 |
| `npm run verify` | 退出 0；三个去重后定向组 24/24、30/30、43/43，core 671/671；renderer tsc 与 Vite build 通过。与其他命令有覆盖重叠，不累加成唯一测试总数。 |
| `npm run lint` / `npm run typecheck:bridge` / `npm run format:check` | 通过。 |
| `git diff --check` | 通过。 |

中间失败保留说明：共享 JSON 首次相对路径多一级导致 build 失败，修正后构建及浏览器回归通过；竞争测试首次把 run 子目录当文件读取导致 EISDIR，改为递归比较真实文件后通过，没有降低竞争/证据保留断言。最终本轮修改的源码与测试 hashes 记录于应用 `build/audit-plan-source-state.json`，日志为 `build/audit-plan-*.log`，均为本地证据，不提交生成物。

有限复审只覆盖 A01–A09 已知修复、共享端点的直接调用方、锁回收竞争、PowerShell 失败传播及 verify 覆盖集合。未引入 schema、状态 owner 或发送边界变化；已知阻塞缺陷本地关闭。

本轮未运行完整 integration、maintenance/release、main composition typecheck、preload 构建、签名安装/升级或远端 CI：本轮实现变化局限端点元数据、renderer 提示与验证脚本，以核心、相关定向及 renderer build 验证。真实模型权限/收费、登录/投稿/付费、生产迁移、未知旧锁人工核对仍未验收；本轮结果不作为发布放行。

## 继续实施：门禁、生成成本与局部精简（2026-10-02）

用户要求继续修复。本节取代上节“精简与延期”作为 G/PERF/OPT 当前状态；A01–A09 关闭结论保留。基线仍为 `e1e93ef287d9cab958b05af97c8a373178541a7e`，结果绑定该 HEAD 加未提交工作区。

### 已完成改动

- G01：将实际承担广泛桌面回归的命令明确命名为 `test:desktop-regression`，保留原排除集合；新增 `test:submission`、`test:storage` 风险入口。将 writer/migration 锁、真实子进程崩溃恢复、SQLITE_FULL 回滚和过期 claim 接管从容量文件移到 `operational-storage-safety.test.js`，归入 core。500/5000/10000 大样本容量断言保留在容量门禁。
- G02：在此前 verify 去重基础上，CI 删除 auth 全套后的 health/rate-limit 重跑、links 的 11 个重复行为文件及 capacity 的两个重复文件；保留链接静态安全检查。完整候选的根测试加 auth 文件执行从 368 次/353 唯一文件变为 355 次/355 唯一文件；原集合零丢失，新增存储安全和生成成本两个文件。集合证据为 `build/audit-remaining-ci-coverage.json`。
- G03：CI 合同改为 YAML 解析后验证命令、风险归属、重复执行与失败传播；renderer 类型检查由手工符号/文件对照和声明形状改为 AST 导出 owner 唯一性，保留 legacy absence、特权及依赖边界。未删业务验收断言。
- G04：普通 push/PR 保留回归、类型、安全、迁移、鉴权及 Electron focus。容量、容器、打包、解包导航、依赖审计与发布 evidence 由显式 `workflow_dispatch` 的 release 参数触发。安装包独立手动入口要求完整 40 位候选 SHA，checkout 后核对同一 SHA，再回归和构建未签名安装包；不再自动跟随 workflow_run。
- PERF01：batch preview owner 增加内部 prepareV2，一次创建复用一次解析得到的 preview 与冻结 brief；获取 brief 直接读取规范知识文档，避免 UI 状态及历史扫描。UI preview 与创建仍各自读取，幂等重放合同保持；测试覆盖知识更新、重启冻结内容、两个客户并发不串数据。
- PERF02 第一阶段：runner 和 service 先裁去 proseBriefs 再 clone；每个监听者仍获得隔离值。完整冻结 brief 仍由既有 store 原子持久化，没有延迟落盘、全局缓存、新状态 owner 或 schema 变化。
- OPT02：GEO IPC 方法注册从既有合同派生，保留 preload 白名单与输入输出校验；fixture 集合与全部注册 channel 等价。
- OPT03：R1–R5 显式阶段 ID 与名称决定规则，进度总数从真实阶段表派生；保持 R1–R5 + K 顺序、产物和六阶段进度语义。

### 测量与不采用项

同一合成长正文、20 个历史目录样本，前后各五轮取中位数。旧实现通过内存模块加载 HEAD 的四个相关文件重放，没有覆盖工作区。旧实现对新读取预算断言如预期失败，优化后通过。

| 指标 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 单次创建知识读取 | 4 | 1 |
| 单次创建历史扫描 | 4 | 0 |
| 创建耗时 ms | 48.8831 | 11.1834 |
| runner 事件总字节 | 251460 | 4383 |
| JSON 序列化总字符 | 932495 | 760357 |
| JSON 序列化次数 | 40 | 37 |
| 文件写入耗时 ms | 1.1435 | 1.1021 |

原始样本保存在 `build/audit-remaining-performance.json`。这些是本机合成样本，不代表真实客户或供应商耗时。写入成本未见明显变化，因此不采用 PERF02 第二阶段跨文件存储拆分。PERF03 按报告明确边界，不新增无已证实痛点的全库索引、订阅或分布式调度。OPT01 当前 transitionPorts 仍有明确消费者；本轮生成与 IPC 改动不触及这些消费者，不为可选建议扩大到 OperationalStore/composition API 重构。这些是按适用条件评估后的范围结论，不是尚未实施的缺陷修复。

### 最终验证与有限复审

Windows、Node v24.16.0、npm 11.13.0。以下命令退出码均为 0，测试均零失败、零跳过；不同命令覆盖有重叠，不累加宣称唯一总数。

| 命令 | 结果 |
| --- | --- |
| `npm run test:desktop-regression` | 324 文件，2100/2100，runner CLOSED，全部文件已报告 |
| `node --test` 定向运行 operational-storage-safety、geo-knowledge-ipc、generation-preparation-cost、content-generation-batch-service、ci-workflow-contract、test-discovery-contract、phase-08-renderer-contract-layout 七个文件 | 54/54 |
| `node --test tests/*.test.js`（auth-server） | 66/66 |
| `npm run test:migration` | 69/69 |
| `npm run test:capacity` | 6/6 |
| `npm run test:production-ipc-matrix` | 6/6 |
| `npm run test:packaging` | 50/50 |
| `npm run test:diagnostics` | 39/39 |
| `npm run test:media-transport` | 9/9 |
| `RUN_ELECTRON_FOCUS_TESTS=1 node --test tests/renderer-settings-window-focus.electron.test.js`（PowerShell 环境变量赋值） | 1/1 |
| `npm run lint`、`npm run typecheck:main`、`npm run typecheck:bridge`、`npm run format:check` | 通过 |
| `npm run build:renderer`、`npm run build:preload` | 通过；renderer 构建仍有 bundle size 提示 |
| `git diff --check` | 通过 |

有限复审检查冻结快照/重放/并发、事件隔离、持久化边界、完整 CI 文件集合及所有移动安全测试的日常归属，未发现本轮阻塞项。中间成本 fixture 缺少规范必需字段导致失败，补齐合成数据后通过；没有降低生产校验。原性能改动清单中的 13 个代码/测试文件逐项 hash 比较保持不变。

最终代码证据为 `build/audit-remaining-source-state.json`（39 个代码/测试/配置文件，含原有改动），SHA256 `587d7940d550accc3b45badcdbe9d246e7c9103a849809ede466667aa6a0328b`；日志位于 `build/audit-remaining-*.log`。最后测试后仅更新文档，未继续修改生产代码或测试。

本轮没有运行远端 CI、生成最终候选包、解包导航、签名安装/升级、容器部署、真实模型/登录/投稿/付费或生产迁移；相关 CI 归属的合同测试通过不等同实际发布验收。历史包证据不替代本轮最终代码。工作区仍 dirty，原有修改保留，未 stage、commit、push、开 PR 或部署。
