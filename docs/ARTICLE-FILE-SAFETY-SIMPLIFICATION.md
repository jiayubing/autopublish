# ArticleStore 文件安全简化

基线：master `eb4c51923919bb4ee20089ece60ab34c80f9607c`。
分支：`codex/simplify-article-file-safety`。仅 file transaction/lock 及直接调用方、测试。

## 调查与目标

| 链路 | 原步骤（按持久变更阶段计） | 最小目标 |
| --- | --- | --- |
| create/save/edit | temp+fsync → journal → 旧 JSON backup → 安装 → 删除 backup → 删除 journal（6） | temp+fsync → 同目录替换（2） |
| trash | 墓碑 temp → journal → JSON 移动 → 墓碑安装 → 清 journal（5） | 保留：两个文件尚无共同原子提交点 |
| restore | journal → JSON 移回 → 删除墓碑 → 清 journal（4） | 保留：中断时墓碑区分回滚/完成 |
| purge | 建 staging → journal → 暂存 JSON → 墓碑 temp → 备份墓碑 → 安装终态 → 清备份 → 清 staging → 清 journal（9） | 终态墓碑 temp → 原子替换 → 删除 JSON（3） |

入口：content-lifecycle-composition 构建 ArticleStore/ContentStore/coordinator；
生成经 ContentStore.createArticle，编辑经 mutation session.replaceArticle；
trash service → removal intent → mutation session.moveArticleToTrash；
restore/purge 经 coordinator → mutation session → ArticleStore。
权限、批量意图与 OperationalStore 不变。

REQUIRED：路径/junction/普通文件校验、JSON 验证、同目录完整 temp、fsync、
原子 rename、trash/restore 日志及局部恢复、跨进程文章锁。
REDUNDANT：新 JSON 保存的 journal/backup/rollback；purge 新 staging/journal/
墓碑 backup（终态墓碑本身足以决定向前清理）。
LEGACY：v1 双文件保存日志、v2 单 JSON 日志、旧 purge staging 只供已有残留恢复。
v2 和 staging 在本轮基线仍产生，不是假想古老格式；无证据允许丢弃用户残留。
不新增 migration。兼容消费者仅在实际残留出现时运行；退出条件为明确停止支持
这些版本中断升级且完成真实 workspace 残留确认，不能以本轮合成 fixture 代替。

并发：desktop/main.js 没有 requestSingleInstanceLock；workspace composition
没有 workspace 级排他打开。各进程独立构造 content lifecycle，文件操作同步，
未发现 article writer worker。Renderer 请求在同一 main 串行执行同步 mutation，
但另一个 Electron/Node 进程仍可写同一目录。保留 canonical lock directory、
预写 owner 后 rename 发布、PID 存活检查、token、stale quarantine、release rename。
现有 3 次有限竞争重试不是 lease/TTL/backoff；不虚构可删除的锁状态。

Windows 依据：[libuv fs__rename](https://github.com/libuv/libuv/blob/v1.x/src/win/fs.c)
使用 MoveFileExW(MOVEFILE_REPLACE_EXISTING)，不需要先移走目标。
同目录替换禁止 unlink 旧文件后重试；共享冲突/权限失败直接保留旧文件并报错。
故障模型限定进程退出/操作失败，不声称磁盘损坏、断电或任意网络文件系统保证。

## 进度与验证

- [x] 最新基线、新分支、调用链与并发模型
- [x] 实现与真实文件故障矩阵：定向 108/108（提交前）
- [x] Primary review → 修复 → bounded re-review
- [x] 最终本地测试、证据及实现提交；push/PR 在 GitHub 核实（不 merge）

用户原有 pelican-bicycle.html 删除和 work/ 未跟踪目录保留，不提交。

## 范围内审查闭环

Scope：替换 writer、purge 终态和直接读取、现存残留消费者、锁模型证据及故障测试。
不重审 lifecycle/removal 上层架构。唯一内容 writer、锁内序列、路径检查、
旧格式升级、清理错误不覆盖主错误、终态后禁止 restore 为受影响不变量。

- P2 EXPOSED_PREEXISTING：普通保存/终态墓碑先移走 canonical，再安装新文件；
  主动增加空窗和 backup 恢复依赖。owner=file transaction；用原子替换移除此路径。
- P2 PROCESS_EVIDENCE_GAP：原 purge 测试只覆盖 staging、未覆盖终态安装后退出；
  新矩阵证明终态前可恢复，终态后只向前删除，unlink 失败后重开可完成。
- REQUIRED：保留跨进程锁。没有单实例/全 workspace 排他保证，不能降级成进程内锁。
- LEGACY：保留已有 v1/v2 JSON 和 staged purge 残留消费者，升级前后真实文件结果已测。

Bounded review 检查上述变更、直接调用方及对应矩阵：PASS，无未关闭 blocking finding。
save 保留旧 JSON 直到单次 rename 成功；无失败时先 unlink 目标的 fallback。
进程崩溃留下的随机 temp 是非真源，列表忽略，不发布或在重启时晋升；
未加入全目录清扫或恢复 scheduler。孤立 temp 的磁盘回收不属于正确性恢复。
purge 的终态墓碑已含稳定身份与 purgedAt，不建立第二份操作状态。
trash/restore 仍由底层日志恢复；上层 intent 只负责批次余项，不恢复单篇文件。

核心模块保持 article-store / article-file-transaction / article-lock 三个，不新增抽象。
锁状态不变；新写入 journal 类型从 save/trash/restore/purge 四类减少到 trash/restore 两类。
旧格式恢复不计作新写入状态；不伪称所有 journal/backup 代码已删除。

## 最终本地 evidence

实现提交：`e211385a7bb2986caab149cc6b15d741b86bc446`。
环境：Windows / Node v24.16.0；C:（测试 temp）与 F: 均为 NTFS。
命令工作目录 `auto—publish/`；之后仅修改本文档，不改变已验证源码/测试/gate。

| 实际命令 | 结果 |
| --- | --- |
| `node --test tests/article-file-safety.test.js tests/article-store.test.js tests/phase-08-content-lifecycle.test.js tests/article-removal-service.test.js tests/article-mutation-coordinator.test.js tests/workspace-runtime-lifecycle.test.js` | 108/108 PASS（提交前，新增文件随后只经 Prettier 格式化） |
| `npm test` | 59 文件，593/593 PASS，23.977 秒 |
| `npm run test:integration` | 224 文件，1,186/1,186 PASS，184.370 秒 |
| `npm run lint` | PASS |
| `npm run typecheck:main` | PASS |
| `npm run typecheck:renderer` | PASS |
| `npm run typecheck:bridge` | PASS |
| `git diff --check` | PASS |
| `npm run format:check` | FAIL，4 项 baseline 告警，见下 |

format 告警：src/domain/identities.js、tests/authenticated-runtime.test.js、
tests/phase-01-domain-contracts.test.js、tests/phase-08-content-lifecycle.test.js。
逐个执行 `git show origin/master:auto—publish/<file> | npx prettier --check --stdin-filepath <file>`，
四项 baseline 均 exit=1。未顺手格式化这些既有代码；future owner=各文件维护者。
CI toolchain 同一 PowerShell run 连续执行多个 npm 命令，不能将其最终绿色等同于
本机 format 命令通过；本节保留实际失败结果，不修改 CI 范围。

core/integration 均 CLOSED、allFilesReported=true、noSkippedTodo=true。
原生证据在 build/test-results/{core,integration}-timings.json；完整输出在
build/test-results/file-safety-{targeted,core,integration,format}.log（不提交）。
未运行本地产物构建、installer、release 或真实 workspace/账号操作。

复杂度：生产文件合计删除 116 行、增加 17 行，净减 99 行；
article-file-transaction 686 → 585 行（约 -15%），ArticleStore 增加 2 行终态清理。
新 save 从 6 阶段降到 2，purge 从 9 降到 3；trash/restore 及锁状态不变。
保留兼容恢复的代价已明确，不以删除真实残留恢复换取更漂亮的行数。
