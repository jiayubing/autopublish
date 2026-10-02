> 本文件保留已有未提交审计证据；下文状态、协议名称与测试结果按记录时点解释，不作为当前调度。剩余事项统一见 [work](work.md)，开发与有限复审规则见 [development](development.md)。

# 2026-10-02 审计修复

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
