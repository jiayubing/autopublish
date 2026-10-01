# 连续知识库生成接回 F 盘

状态：LOCAL VERIFIED，已接回 F 盘并完成本地验收。2026-09-30 用户明确要求替换 F 盘旧知识库研究方式，使用实验已验证的连续生成模式。范围只含知识生成、直接消费者和开发启动构建；不提交、切分支、迁移客户数据或调用真实模型，不推进 CP-5。

最新状态：随后用户报告知识库通用报错及K等待中断，已完成下文“桌面报错修复”和“K成稿超时修复”。当前代码与最终验证绑定在 `F-TIMEOUT-EVIDENCE.json`；前两轮 `F-CODE-SNAPSHOT.json`、`F-ERRORFIX-EVIDENCE.json` 保留为历史证据。

## 来源与整合决策

- 来源：C 盘 `codex/doubao-research-automation` dirty 工作树的 D1 最终快照；共同 HEAD 为 `8afd672346d0c93783635726f9e8f24ea0471b2f`。源码逐文件检查 SHA-256 后接入，不以 HEAD 冒充未提交代码证据。
- 目标：`F:/官媒投稿-refactor`，保留 `codex/geo-knowledge-base` 分支及暂存状态。转入新链路前备份受影响的 F 盘源码和原 dirty diff；备份仅供恢复，不作运行 owner。
- 使用一次 R1–R5 + K，不联网 K、最多12次请求/3次搜索，不自动格式修复/重试。正式 Knowledge V2 store 仍是唯一 writer；九板块正文绑定同一 revision。
- 九板块稿从最终 K 得到；15章节确认视图是同一正式知识的辅助投影，分别标清。F 盘旧九板块拼装视图和旧 Notebook 在线研究退役，不保留第二生成入口。
- 保留 F 盘既有 `third_party` 来源归因要求；既有文章上下文修改保留。600—1000字只作目标，短稿/长稿完整交付；无效模型稿标未验证且不覆盖正式知识。
- DOC 文本提取及写稿配置一起接入；不覆盖本机配置/凭据或客户资料。真实 E5 质量仍未通过，本地绿灯不改变该状态。

## 验证及交接

最终命令、结果、边界和源码哈希见以下记录。F 盘开发入口 `npm run desktop` 读取 `media-workbench/dist`；本次已从源码重建 renderer/preload，可用于新模式。

## 已实施范围与 Review

- 依据 C盘D1最终快照哈希转入62个不同文件；新增生产 `continuous-knowledge-{run,contract,evidence,synthesis,canonical}`，同步 application/store/schema/merge、service/IPC/preload、bridge/types、知识库view/hook、提示词设置及DOC材料提取。相关测试和合成fixture一并转入，不复制客户run、凭据、配置、node_modules或构建产物。
- 旧生产 `geo-knowledge-evidence.js`、`geo-knowledge-synthesis.js` 及仅服务旧 Notebook 的测试已退役，原内容保存在 `f-before-transfer`。旧在线 `createGeoKnowledgeResearch` 不再存在于生产模块；历史旧研究测试明确引用scratch档案，桌面不引用scratch。
- F盘独有的文章消费者第三方归因规则保留；15章节确认投影恢复实验已验证合同，同时保留第三方归因。补充公开行为回归验证来源归因、fact-only筛选和真实IPC确认模型。九板块最终稿使用新K结果，不从旧确认拼装替代。
- 用户原dirty diff及所有替换前受影响文件已备份；不相关的改动和历史scratch目录保留。`F-TRANSFER-BASELINE.json` 记录逐文件转入前后hash和退役路径。
- 安装新增离线DOC依赖运行 `npm install --ignore-scripts --no-audit --no-fund`，新增7个依赖包；npm只改变lock缩进，确认JSON结构与来源完全相同后恢复来源格式，无依赖版本漂移。

主agent Primary Review范围为两边差异、唯一writer、来源语义、确认视图/IPC、文章消费者及开发构建入口。发现恢复确认投影会丢失F盘第三方归因（CROSS_COMPONENT_INTERACTION），在同一owner恢复该规则并加回归。Bounded Re-review只查该来源规则、直接消费方、旧入口退出及关联回归。无新增第二生成路径或第二正式知识库。

首次完整集成1390/1391，唯一失败是新增来源回归夹具及公开返回形状不匹配（PROCESS_EVIDENCE_GAP）；修正profile投影并按实际公开context读取，确认研究来源不进入fact-only产品字段。未修改产品规则或削弱有效断言。最终定向25/25通过；首次集成日志保留在 `F-integration.log`，不作完成依据。

### 已运行的命令

从 `F:/官媒投稿-refactor/auto—publish` 执行：

| 命令 / 验证 | 结果 | 证据 |
| --- | --- | --- |
| `node --test tests/desktop-continuous-knowledge.test.js tests/geo-knowledge-flow.test.js tests/geo-knowledge-ipc.test.js tests/geo-confirmation-model.test.js tests/geo-generation-context.test.js` | 25/25，0skip | `F-directed-final.log` |
| `npm test` | 646/646，0skip，runner CLOSED | `F-core.log` |
| `npm run test:integration`（最终回归修正后） | 1391/1391，0skip，runner CLOSED | `F-integration-final.log` |
| `npm run typecheck:main`、`npm run typecheck:bridge`、`npm run lint` | 全部exit0 | 本轮终端结果 |
| `npm run build:renderer`（含renderer typecheck）、`npm run build:preload` | 全部exit0 | 本轮终端结果；F盘本地dist/preload已重建 |
| `node ../.scratch/doubao-research-automation/run-synthetic.cjs` | 38/38，0skip | `F-synthetic.log` |
| F盘 `node_modules/electron` 运行 `dev-d1-smoke.cjs` | PASS，Electron43.1.1；8次假请求/1次搜索，短稿完整保存及重启读取成功，默认提示词由F盘源码读取 | `F-electron-smoke.json` |
| ESLint直接回归测试；从仓库根显式ESLint转入/留证/烟雾脚本；`git diff --check` | exit0 | 本轮终端结果 |

Electron验证通过Node spawnSync executable+argv，shell:false、windowsHide:true，ELECTRON_RUN_AS_NODE=1；内容库为临时合成目录，transport为fake，未触碰真实内容库或配置。旧F盘开发窗口必须退出并重新启动才会加载新主进程、界面和preload。构建仅有既有大chunk警告。

## 最终完成（2026-09-30）

最终集成1391/1391通过，0skip且runner CLOSED；包含实际renderer交互，覆盖无正式知识库时的未验证稿、一次生成到九板块预览/导出、空态/失败/运行禁用、切客户晚到响应、人工编辑、原客户确认投影及GEO采集/文章消费者。最后一次关键测试修改后执行最终集成，之后仅更新文档与哈希留证，没有再改生产源码或关键测试。

最终源码、关键测试、F盘dist脚本和preload哈希绑定在[F-CODE-SNAPSHOT.json](F-CODE-SNAPSHOT.json)。分支仍为 `codex/geo-knowledge-base`，HEAD `8afd672346d0c93783635726f9e8f24ea0471b2f`；暂存区为空，无commit/push，未改C盘来源工作树。原F盘受影响旧实现有本地备份，客户内容/凭据/配置未改写，未做真实数据迁移。

现在关闭旧开发窗口，按原F盘开发方式重新启动即可使用最新链路：`F:/官媒投稿-refactor/auto—publish` 执行 `npm run desktop`。不用切换到C盘，也不需要第二次成稿操作。已安装客户端及发布安装包不在此次范围，没有构建F盘安装包。

本次新增真实provider请求0；E5真实稿件质量仍NOT PASSED，本地合成验收不保证模型达到600—1000字或自然语言事实完全正确。不确定请求不会自动重试，崩溃遗留运行锁仍需人工检查。已知blocking findings关闭，停止扩大范围。

## 桌面报错修复（2026-09-30）

用户截图为客户知识库通用操作失败。只读取相关客户的本地运行结果，未读取凭据、打印客户正文、发送模型请求或修改客户文件。两个已有运行分别记录 R1 不确定请求与 K 校验失败；原始记录保留，未自动重试。

### 根因与改动

- `INTRODUCED_BY_CHANGE`：连续研究的进度回调包含内部 `mode`，application 把它展开到公开状态，而 IPC 使用精确状态合同。修复唯一 application 状态 owner，只投影阶段、运行状态及计数，不扩大 IPC 合同。新增真实 service → authenticated IPC → preload 回归，在全部8次假请求中读取进度及知识库，覆盖 R1分析/搜索/补充至K。
- `EXPOSED_PREEXISTING`：normalizer 把关联显示名称直接散列为 ID；目标对象 ID 实际来自 identity，二者不同时合法名称也会变成悬空关联。现在在对应候选数组中按确切 name 或 identity 解析到唯一目标 ID；未知、歧义或无目标仍拒绝。新增名称/identity两种引用及未知/歧义回归。
- `EXPOSED_PREEXISTING`：主题问题数量的本地门槛与模型 schema 不一致，本次响应每主题2、2、2、1个真实问题导致正文整体校验失败。连续模式允许1—5个有效问题，写稿仍优先3—5个，不能自造问题补齐；历史离线整理合同保持原规则。新增1/2个问题出稿和空/未知引用拒绝测试，不增加模型调用。
- 首次读取、轮询及操作失败均显示稳定安全错误代码；移除“连续两次模型响应”误导文案，明确完整模型稿可预览导出。新增首次加载失败显示代码及刷新恢复 UI 回归。
- 新模型 canonical 关联失败转换为 `GEO_SCHEMA_INVALID`，不冒充已有知识文件损坏。最终提示词明确关联必须实际出现在本次产品/场景数组，且名称或 identity 逐字匹配；不丢弃未知关系并静默提升为正式知识。

改动生产范围：`geo-knowledge-application.js`、`geo-knowledge-merge.js`、`continuous-knowledge-synthesis.js`、`continuous-knowledge-canonical.js`、知识库IPC合同及renderer hook；四个直接回归测试文件同步更新。当前增量合同补充问题数量与对象关联语义。未改变 schema、数据库、业务事实 writer 或自动重试规则。

### 本次已保存的模型稿

使用修复后的公开纯校验器只读复核已有8次请求/1次搜索的最终响应：正文校验 PASS，四个主题的问题数量为2/2/2/1。canonical 仍含本次数组中不存在的关联，结果为 `GEO_SCHEMA_INVALID`，未写入正式知识。通过真实 service → IPC → preload 读取 PASS；正式存储为missing，K失败状态保真，未验证完整模型稿3500字符可读取。原稿未改写或重新生成，不能把该结果描述为正式知识库已生成成功。

开发窗口退出并重新启动 F 盘 `npm run desktop` 后，点击“刷新”，进入“九板块知识稿”即可查看并导出原有未验证草稿。已保存运行的 K 失败状态保留；重新生成是新的用户操作，不由系统自动触发。

### 最终验证

| 实际命令/验证 | 结果 | 日志 |
| --- | --- | --- |
| `node --test` 七个直接知识库/IPC/正文/renderer测试文件 | 102/102，0skip | `F-errorfix-directed-final.log` |
| `npm test`（最后生产提示词修改之后） | 650/650，0skip，CLOSED | `F-errorfix-core-final.log` |
| `npm run test:integration`（独立复跑） | 1394/1394，0skip，CLOSED | `F-errorfix-integration-final.log` |
| `npm run typecheck:main`、`npm run typecheck:bridge`、`npm run lint` | 全部exit0 | `F-errorfix-{main,bridge,lint}.log` |
| `npm run build:renderer`、`npm run build:preload` | 全部exit0，含renderer typecheck；仅既有chunk警告 | `F-errorfix-renderer-build.log`、`F-errorfix-preload.log` |
| Electron43.1.1直接运行F盘service合成烟雾 | PASS，8次假请求/1次搜索，短稿保存及重启读取成功 | `F-errorfix-electron-smoke.json` |
| `check-f-saved-response.cjs` 只读复核已有模型响应与实际桌面读取 | PASS；未验证原稿可读；无客户写入/网络请求 | `F-errorfix-saved-response.json` |
| 显式ESLint检查两个诊断/证据脚本；`git diff --check` | exit0 | 终端及`F-errorfix-diff-check.log` |

首次定向测试58/60，两项新测试夹具误用了不存在的features结构字段，修正为capabilities，未改生产语义。首次集成1389/1394；手动renderer构建与集成测试共享dist，造成批次导航5项HTTP加载失败。停止同时构建后，导航定向6/6通过（`F-errorfix-navigation-recheck.log`）；随后完整独立集成1394/1394通过。失败日志均保留，不作完成依据。最终集成之后未再修改生产源码或关键测试。

Primary Review检查进度owner/IPC合同、normalizer唯一目标ID、失败不写入及草稿保留、问题引用和直接UI调用方。Bounded Re-review仅复查这些修复及回归；无blocking finding。当前provider响应中的无效关联保持失败事实，属于安全拒绝的已知外部输入，不伪造成正式知识。

最终代码、测试、构建和日志哈希见 `F-ERRORFIX-EVIDENCE.json`；Git仍为 `codex/geo-knowledge-base` / `8afd672346d0c93783635726f9e8f24ea0471b2f`，暂存区为空，无commit/push。保持原dirty改动，未改C盘工作树，未制作安装包。新增真实provider请求0、客户内容/配置写入0；真实E5质量依旧NOT PASSED。完成本次报错修复，停止扩展范围。

## K成稿超时修复（2026-09-30）

用户截图为“该客户”K阶段结果不确定。只读核查该运行：R1–R5已有9份响应记录，第10次K请求开始与不确定结果记录间隔120010毫秒，没有K响应文件、模型稿或遗留活动运行锁。前一轮有完整模型草稿的客户与本次客户不同，不能声称本次也有稿可恢复。原始客户数据和运行事实未改写。

根因归类 `CROSS_COMPONENT_INTERACTION`：现有transport对所有请求统一使用120秒上限，而连续模式K同次生成完整正文与结构化知识，仍套用研究阶段的短上限。由continuous run显式为K传入600秒等待上限；普通研究、搜索和连接测试维持120秒默认。transport校验上限参数为1—600000毫秒整数，超时覆盖请求与响应体读取，保留用户取消。未增加额外请求、重试、续跑或格式修复。

新增安全代码 `GEO_REQUEST_TIMEOUT`，贯穿transport → run ledger → application/state → store读取 → authenticated IPC/preload → renderer；请求已发出的超时仍持久化为uncertain，不当作明确远端失败。K运行提示最长等待10分钟；新超时失败及刷新后的状态明确显示等待超时与不自动重试。旧运行保留原有 `GEO_REQUEST_UNCERTAIN`，不改写历史原因或自动恢复。

生产改动范围：`doubao-geo-client.js`、`continuous-knowledge-run.js`、知识库IPC合同和`GeoKnowledgeView.tsx`。直接回归范围：`geo-connection-test.test.js`、`desktop-continuous-knowledge.test.js`、`renderer-geo-knowledge.test.js`。README和当前增量合同同步记录阶段等待边界。

### 验证与收口

- 修改前运行新增deadline回归：3项中2项失败，复现请求不能采用阶段等待上限且缺少上限验证；日志 `F-timeout-repro.log`。修复后定向五个文件56/56，0skip（`F-timeout-directed.log`）。
- 定向验证请求与响应体超时、延长等待可接受较慢响应、非法期限在dispatch前拒绝、用户取消、最终K传入600秒、一次超时不重试、公开IPC错误及状态、重启保留不确定结果、没有收到稿件时不造草稿、UI运行禁用/超时/刷新。
- `npm test` 651/651，0skip，CLOSED（`F-timeout-core.log`）；`npm run test:integration` 1398/1398，0skip，CLOSED（`F-timeout-integration.log`）。完整集成期间未同时执行renderer构建。
- main/bridge typecheck、ESLint、renderer构建（含renderer typecheck）、preload构建全部exit0，日志 `F-timeout-{main,bridge,lint,renderer-build,preload}.log`。界面构建仅既有chunk警告。
- Electron43.1.1合成烟雾PASS，8次假请求/1次搜索，短稿保存及重启读取成功（`F-timeout-electron-smoke.json`）。真实provider请求新增0；不宣称延长上限已经通过真实模型验收。
- 只读本次运行的安全诊断记录见 `F-timeout-diagnosis.json`，只记录阶段/时长/结果/文件是否存在，不含客户正文、配置或凭据。

Primary Review检查请求参数边界、取消与超时优先级、正文读取deadline、K等待owner、预算/不重试、错误合同、持久状态及UI。Bounded Re-review仅检查同一修复和直接回归；blocking findings关闭。最后生产源码/关键测试变化之后执行上述最终门禁，之后只补文档及哈希证据。

最终文件与日志绑定 `F-TIMEOUT-EVIDENCE.json`。仍为F盘 `codex/geo-knowledge-base` dirty工作树，HEAD未变，暂存区为空，无commit/push；未修改C盘来源、客户内容或本机配置。E5真实质量仍NOT PASSED。

关闭旧F盘开发窗口，再从 `F:/官媒投稿-refactor/auto—publish` 执行 `npm run desktop` 后，新成稿请求采用600秒上限。旧不确定运行不自动恢复；用户手动重新生成才会开始新的运行。此次没有收到最终稿，不能通过本地修复恢复不存在的模型响应。

## 旧研究测试收口（2026-10-01）

本次只清理正式测试对退役实现的依赖，不修改生产生成器、客户数据或 Git 分支。

- `customer-continuous-knowledge.test.js` 改为直接导入生产 `continuous-knowledge-run`；显式传入系统临时产物目录并在测试结束后清理，避免持续向 scratch 写入运行产物。
- `geo-knowledge-research.test.js` 保留当前生产 JSON 解析、合并行为验证，并验证连续模式12次预算与不确定请求计数。旧两轮 planner/repair/adapter 测试退役。
- `geo-knowledge.test.js`、`geo-coding-plan.test.js` 移除旧生成器与旧提示词拼装依赖，保留持久化、并发、凭据、端点和 transport 安全验证。旧“无引用立即终止全部研究”用例不适用于连续模式；当前模式允许无可采纳搜索证据并继续材料分析，证据拒绝与最终来源边界由生产连续模式测试覆盖。
- 两个只服务实验七阶段/独立成稿的测试退出正式测试发现。所有六个文件的修改前内容保存在 `retired-test-snapshots-2026-10-01/*.snapshot`，仅供历史取证。
- 搜索确认正式 tests/scripts 不再引用上述 scratch 实现。生产生成链路仍只有 R1–R5 + K。

Primary Review 检查实际 imports、保留的生产行为覆盖及临时目录清理。迁移 Coding Plan 历史用例时先遇到材料夹具不满足新合同，再确认旧无引用终止规则已退役；未为旧断言修改新产品行为。Bounded Re-review 限定这些测试和直接生成合同。

Git 检查：当前 `codex/geo-knowledge-base`，HEAD `8afd672346d0c93783635726f9e8f24ea0471b2f`；相对本地 upstream 记录 ahead 2 / behind 0（未 fetch）。暂存区为空、无冲突、无进行中的 merge/rebase/cherry-pick/revert。两个 worktree 登记指向不存在路径，仅执行 prune dry-run，未删除登记。已有46个 tracked 修改及大量未跟踪实验产物保留；没有 commit/push/reset/切分支。

验证：定向五文件65/65；`npm test` 651/651，0skip，CLOSED；四个修改测试文件 ESLint exit0；`git diff --check` exit0。核心日志 `F-cleanup-core.log`。本次未改生产源码/UI，不重建安装包、不做真实模型验收。

最终集成：`npm run test:integration` 1325/1325，0skip，CLOSED，日志 `F-cleanup-integration.log`。较历史1398减少73项，来自退役两轮研究、七阶段实验及独立成稿测试，不是跳过失败用例；当前生产连续模式27项全部保留并切到生产模块。修改文件哈希见 `F-cleanup-files.json`。全部验证后未改生产源码或关键测试，无blocking finding；本次完成。


## 清理与提交收口（2026-10-01）

用户本次明确授权删除可清理产物并提交。提交 `d0c0b608` 独立保存离线 DOC 资料读取；提交 `17b3d60` 保存 R1–R5 + K 连续知识库与正式测试收口。未 push，未切分支，未推进 CP-5。

按合成材料精确匹配及测试 fixture 身份确认后，删除709个自动化测试运行目录；7个未完全分类的历史运行目录保留。先验证绝对路径均位于本仓库实验目录内且无 reparse point，再用 PowerShell 原生删除。初次带 Force 的批量删除被自动审批拒绝；重新只读验证后，不带 Force 的删除成功。两个不存在路径的 worktree 登记通过 git worktree prune 清除，现有工作树未修改。

真实诊断、原始模型响应、恢复备份和旧实验源码只在本地保留，加入精确范围的忽略规则；没有提交客户材料、凭据或备份压缩包。无调用方的 v1.3 计划移入本地替换前备份。之前提到的实验脚本、哈希档案和详细日志是本地历史证据，不随本次提交发布。当前可移植证据为 F-COMMIT-EVIDENCE.json。

最终验证：核心651/651、集成1325/1325，均0skip且CLOSED；本轮 lint、main/bridge typecheck、renderer构建（含renderer typecheck）、preload构建均exit0；git diff --check通过。生产与测试代码在验证后未再修改，保存提交blob与工作文件SHA-256对应关系。未执行真实模型、发布或安装包验收。
