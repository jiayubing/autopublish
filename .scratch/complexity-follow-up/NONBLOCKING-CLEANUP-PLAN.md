# 非阻塞技术债后续处理计划

## 1. 状态与入口

- 状态：COMPLETE；A 格式化、B 小批次命名完成，C/D 经调查保留现状；证据见 §7。
- 来源：[已完成的复杂度收敛计划](../complexity-reduction/COMPLEXITY-REDUCTION-PLAN.md)中的非阻塞保留项。
- 起点：本地 master 的 fcbdb83。原计划已合并；新线程先确认当前 Git，不假定远端已同步。
- 场景：个人使用、每批通常不足 100 篇；不增加并发、分布式架构或新的业务状态。
- 最小阅读：根 README、docs/AI-ENTRY、docs/WORK-INDEX、适用 AGENTS、本文，再读取当前阶段的直接源码/测试。原计划只按下列定位取证，不重读全部历史。
- 顺序：A 格式清理 → B 历史测试命名 → C IPC 分析工具 → D 前端包体积。
- 每阶段独立验证和记录；没有收益的方案可保留，但必须记录调查证据和具体理由，不能用“非阻塞”代替调查。

## 2. A：清理既有格式问题

原证据：旧计划“发布测试修复与本地打包验收”及最终 Closure；19 个文件未通过 format:check。
Owner：各文件所属模块；此阶段只负责格式，不改业务行为。

先在 auto—publish 运行 npm run format:check，以实际输出确认清单，避免处理已由其他任务修好的文件。
历史清单如下，路径相对 auto—publish：

1. scripts/offline-self-test.js
2. desktop/services/runtime-diagnostics-service.js
3. desktop/composition/publication-recovery-composition.js
4. desktop/composition/regular-queue-group-composition.js
5. desktop/composition/workspace-runtime-composition.js
6. src/domain/publication-evidence-contract.js
7. src/domain/publication-failure-read-model.js
8. src/infrastructure/operational-store/internal/operational-store-paid-execution-aggregate.js
9. src/infrastructure/operational-store/internal/operational-store-publication-success.js
10. src/infrastructure/operational-store/internal/operational-store-regular-outcome-aggregate.js
11. src/infrastructure/operational-store/internal/operational-store-schema-v7.js
12. src/platforms/shared/browser-session-lifecycle.js
13. media-workbench/src/bridge/account-profile.ts
14. media-workbench/src/bridge/content.ts
15. media-workbench/src/bridge/generation.ts
16. media-workbench/src/bridge/platform.ts
17. media-workbench/src/bridge/publication.ts
18. media-workbench/src/types/publication.ts
19. tests/phase-01-architecture.test.js

只对确认的文件使用现有 Prettier 配置，不全仓格式化、不改 migration 语义或历史 schema。
验收：format:check、lint、相关 typecheck、git diff --check 通过，diff 只有格式变化。
不为纯格式新增测试；若出现语义变化，撤销本阶段引入的语义变化或另立具体修复范围。

## 3. B：整理仍有历史命名的测试

原证据：旧计划“核心验收命名”与完成条件表。默认 core 已无 phase/ticket 文件名，其他分组仍有历史名字。
Owner：对应业务测试与 scripts/test-suites.json；TEST-INVENTORY.md 是历史快照，不是执行配置。

1. 从当前测试发现结果和分类配置列出候选，记录旧路径、公开行为、新路径、直接消费者。
2. 优先改名会妨碍定位业务的文件；先做有明确收益的小批次，不把历史前缀当删除依据。
3. 同步 package 命令、CI、执行配置及活跃工具引用；旧 observedSourceState、handoff 和归档证据不改写，必要时记录路径映射。
4. 只有断言语义、状态边界和负例均已在保留用例中覆盖，才合并重复测试；不删唯一回归。

验收：test-discovery-contract、改名/合并的定向测试、受影响测试分组和实际命令通过；发现集合无漏项，删除有覆盖映射。
不得为兼容旧文件名建立 wrapper，不以测试文件减少到某个数字为验收条件。

## 4. C：评估并精简 IPC 静态分析工具

原证据：旧计划“已确认的复杂度来源”和“Phase 2 首项重复覆盖收敛”。
Owner：tests/helpers/typescript-symbol-evidence.js。
直接消费者：tests/ipc-symbol-identity-evidence.test.js、tests/phase-06-production-ipc-fixture-matrix.test.js，以及 test:production-ipc-matrix 对应 CI 门禁。
旧基线：分析器约 9400 行；矩阵覆盖 118 项生产能力，约 72 秒。新线程须重测，不把历史数字当当前事实。

1. 列出分析器实际保护的合同及独有负例，区分业务行为、依赖方向、符号连接、公开能力和安全边界。
2. 对照已有运行时合同，明确哪些静态约束仍不可替代；先尝试删除确认重复的分析或数据维护。
3. 对比保留、局部简化、以现有工具替代三种方案，记录复杂度与覆盖差异。选最小有收益方案，不新增另一套分析框架。
4. 只在消费者和必要负例全部迁移后退役旧实现。不能通过扩大豁免、删除未知能力检查或隐藏失败降耗时。

验收：分析器负例、完整 IPC matrix、受影响 integration/release 检查通过；报告修改前后耗时、调用层/维护点变化及能力覆盖差异。
若没有更简单且等价的方案，保留实现并记录证据即可，不要求重写 9400 行。

## 5. D：评估前端包体积

原证据：旧计划最终构建记录，主 JS 811.23 kB、gzip 228.33 kB，存在超过 500 kB 的提示。
Owner：media-workbench 的构建配置、App 及现有页面加载边界。

1. 先运行 build:renderer，定位实际大依赖与首屏必须加载的模块，区分体积提示和实际启动问题。
2. 优先复用现有路由/视图懒加载，处理明确未使用的依赖或大模块；无证据不新增复杂 manualChunks 配置。
3. 比较首屏加载字节、chunk 数量、导航行为；不以提高告警阈值作为修复，不机械要求所有 chunk 小于 500 kB。

验收：renderer typecheck/build 通过；若修改加载边界，验证冷启动、快速切页、空态/错误态与关键交互，运行现有导航收敛测试并核对桌面/移动视口。
需要 unpacked 导航时按应用 README 准备合成产物与开关；不得把缺少前置条件造成的 skip 当通过。
如拆分只转移体积且增加加载复杂度，保留现状并写出测量结果。

## 6. 排除项与收尾

- 不重新开展全仓 fresh audit，不重新执行已完成瘦身计划。
- 保留已有迁移、删除恢复、OperationalStore 事务 owner、客户隔离和不确定结果人工核对；不把它们作为本计划待删除项。
- 不使用真实客户内容、账号、发布、付费、上传或生产迁移；本计划不包含 push/release。
- 每阶段执行 Implementation → Primary Review → 修复阻塞项 → Bounded Re-review，不无限扩大复审。
- 日常只跑相关测试；全部阶段收尾时根据最终变更运行 core/integration、所涉及的 maintenance/release 和构建检查，不在每次小改后重复全量。
- 提交权限按新线程中的用户授权和适用协议判断；不得把本计划误读为授权远端合并、push 或发布。
- 完成记录必须说明：实际改动、保留决策、测量结果、运行命令、未运行项及原因、Git 状态。四项均有处理结论后方可标 COMPLETE。

## 7. 执行记录

### 7.1 2026-09-05 执行结果

- 分支：`codex/nonblocking-cleanup`。
- A：对实际 `format:check` 列出的 19 个文件运行现有 Prettier；另将 HEAD 原内容按现有配置格式化后与工作区逐文件比较（归一化 CRLF），19 个全部一致，确认无业务语义改动。
- A 验证：`npm run format:check`、`npm run lint`、`git diff --check` 通过。
- B：`npm run test:discover` 发现 288 个测试文件；本次仅改名一个分析器测试，映射和候选见下文。没有合并或删除断言，没有兼容 wrapper。
- C：`npm run test:production-ipc-matrix` 5 项通过，118 项生产连接能力闭合，总耗时 73.97 秒。分析器保持不变，故无优化后耗时或覆盖增减可宣称。
- D：`npm run build:renderer` 的 renderer typecheck/build 通过；基线主 JS 811232 bytes、gzip 228325 bytes。内存构建实验及保留决策见下文。
- 最终验证：core 551/551、integration 1024/1024、maintenance 328/328；均无 skip、todo、failure。定向 discovery + 改名分析器测试 167/167。主进程与严格 bridge typecheck 通过，最终 lint 通过。相关发布合同定向 23/23 通过。
- 未运行：完整 release 组与 unpacked 导航/焦点、移动/桌面视口交互验收。本次没有落地加载边界或 UI 行为修改；实际运行相关发布合同，未把未运行的完整发布门禁宣称通过。未做真实外部操作。
- Git：未提交、未 push；保留用户原有 `docs/WORK-INDEX.md` 与计划目录改动。

### 7.2 B 候选与路径映射

| 旧路径（tests/ 下） | 公开行为 / 新路径 | 直接消费者与结论 |
| --- | --- | --- |
| phase-06-symbol-identity-evidence.test.js | IPC 符号连接、查询结果可观察性与订阅清理负例；ipc-symbol-identity-evidence.test.js | scripts/test-suites.json 的 maintenance；已同步，内容与 HEAD 旧文件逐字相同 |
| phase-06-production-ipc-fixture-matrix.test.js | 生产 IPC 能力连接与 schema/error 合同 | package.json 两个脚本、test-suites.json、test-discovery-contract；已有明确领域后缀，本批保留，避免同时改动 release 入口 |
| phase-02-runtime-capacity.test.js | runtime 容量 | maintenance、test:capacity、desktop-core 排除项；已有行为后缀，本批保留 |

搜索 package/scripts/tests/docs/CI 中旧分析器测试路径未发现剩余活跃引用；本计划 C 入口同步更新。历史 inventory/handoff 不改写。分组合同验证发现集合完整分区，maintenance 实际运行包含新路径；核心数量 61、integration 196、maintenance 17、release 14，总计仍为 288。

### 7.3 C 合同与方案比较

实际分析器为 9413 行，消费者只有两个测试模块。`verifyCapabilityEvidence` 沿 entry、consumer、feature/composition、bridge、preload、registrar/application 检查符号和可达性；查询额外检查结果到 snapshot 再到可观察消费，事件额外检查 producer、订阅及 cleanup 路径。这些属于生产连接、公开能力与安全静态边界，不替代业务生命周期测试。

负例实际运行覆盖：同名错误 receiver/shadow、dead JSX/export、错误 preload channel/namespace、丢弃 query 结果、状态覆写、互斥分支、不可达回调、遗漏或不同路径 cleanup。运行时 `desktop-ipc-response` 只证明 envelope/error 包装，matrix 的 schema 负例证明版本/字段/必填/error 安全；均不能证明真实 renderer entry 连接到了正确 owner。因此不能用这些运行时成功用例删除静态连接检查。

| 方案 | 维护与覆盖差异 | 决策 |
| --- | --- | --- |
| 保留 | 一个现有分析器、两个消费者；完整负例和 118 能力保持 | 采用 |
| 局部简化 | 检查了入口可达性、符号绑定、结果流与 cleanup；看似重复的分支分别防止同名伪连接和结果丢弃，负例不等价。去掉未由外部使用的导出只减少表面 API，内部函数仍必需，不能降低分析维护量 | 未找到值得落地的等价删除 |
| 现有工具替代 | tsc 已作为 main/bridge/renderer 门禁；类型正确仍可调用错误的同类型实例、丢弃返回值或漏掉清理。ESLint 也没有当前这条跨模块实例连接合同；为等价替代需再写同类分析规则 | 不建立第二分析框架 |

未改 analyzer/fixture/豁免/未知能力检查；调用层、数据维护点、能力覆盖与耗时基线保持，无性能改进声明。

### 7.4 D 测量与决策

使用现有 Vite API、`build.write=false` 获取 Rollup chunk.modules 的 renderedLength（压缩前统计，不能直接当网络字节）：application 748893、react-dom 561323、react 20311、scheduler 11420、lucide-react 23461；动画相关 framer-motion 101591、motion-dom 290417、motion-utils 7110、motion 607。React DOM 承担入口渲染，App/Sidebar 使用动画；未发现这些大依赖可直接删除。

App 顶层静态引入页面，未有可直接复用的 lazy/import 边界。vite.config.ts 输出 IIFE，HTML 插件去掉 module 属性。通过只在内存 transform 中将 SettingsView 改为 React.lazy 动态导入比较：

| 构建 | 首次下载 JS bytes | gzip bytes | JS chunk 数 | 输出 dynamicImports |
| --- | ---: | ---: | ---: | --- |
| 原始 | 811232 | 228325 | 1 | [] |
| 设置页 lazy 实验 | 811917 | 227968 | 1 | [] |

实验没有形成下载分块，原始 JS 增加 685 bytes，gzip 仅减少 357 bytes；引入异步组件还需要额外 Suspense/错误/导航验证。保留现有 IIFE 构建，不改告警阈值，不落地实验，不声称修复启动性能。先前试验错误地预期 IIFE 动态导入必然报错，实际成功且仍为单 chunk；结论以本表实际输出为准。

### 7.5 有界审查

Primary Review 检查 A diff、B 消费者、C 独有负例及 D 构建实验。发现 PROCESS_EVIDENCE_GAP：初版记录提前标 COMPLETE 并给 B–D 无证据保留结论；已撤回并补充本节调查与实际验证。Bounded Re-review 确认 19 文件格式化等价、改名内容不变、发现集合无遗漏、C/D 无源码修改，blocking findings 关闭。未重新开启全仓审计。

定向发布命令：`node --test tests/production-packaging.test.js tests/packaging-runtime.test.js tests/release-evidence.test.js tests/ci-workflow-contract.test.js`。上述结果绑定当前未提交工作区，不伪称 clean-HEAD 或提交证据。

### 7.6 本地集成

2026-09-05 用户授权合并回本地 master。格式化提交为 `d1ea958`，测试命名提交为 `6ffcef5`（Git 检测为 100% 内容相同的重命名）。§7.1/§7.5 的未提交描述是验证时点的历史状态；提交未再修改生产源码或测试内容。计划和索引单独提交后快进集成，不包含 push 或发布授权。实际合并结果以本地 Git 为准。
