# 文章生命周期重构波次执行计划

> 用途：记录当前执行进度，并定义用户在任一 Codex 主线程中说“执行波次 X”时的唯一调度行为。本计划只负责创建独立 ticket 线程并执行代码，不自动审计、提交、合并或推送。

## 1. 使用方式

在 `F:\官媒投稿-refactor` 项目中的任一新线程直接输入：

```text
执行波次 3
```

主线程必须读取本计划、根目录 `AGENTS.md`、权威规格和该波次 ticket，验证依赖与 Git 状态，然后为该波次每个可并行 ticket 创建一个独立 Codex worktree 线程。

“执行波次 X”只授权：

1. 检查集成分支、依赖、已有分支、worktree 和重复任务。
2. 创建该波次可执行 ticket 的独立 worktree 线程。
3. 在每个 ticket 线程中创建对应分支、实施代码、运行定向测试并留下交接。

它不授权：

- ticket 审计或审计子代理；
- 自动修复审计发现；
- `git add`、commit、merge、rebase、push 或 PR；
- 删除、移动或清理 worktree；
- 运行完整 `npm test`；
- 使用 `$implement` 技能；
- 真实平台登录、发布、付费、取消或生产数据操作。

上述操作均由用户后续对每个 ticket 单独下达指令。

## 2. 当前进度快照

快照时间：2026-08-06。每次执行前必须以当前 Git 状态重新验证，快照不能覆盖 Git 事实。

| 项目 | 当前状态 | 证据/说明 |
| --- | --- | --- |
| 集成工作树 | `F:\官媒投稿-refactor` | 固定用于 `codex/article-lifecycle-submission` |
| 波次 2 验收基线 | `3516fb5` | `fix: close wave 02 integration findings` |
| 波次 1 | `COMPLETE` | 01、03、11、17 已进入集成分支，波次审计修复已合并 |
| 波次 1 审计修复 | `COMPLETE` | 集成历史包含 `e02e6b3` 及其前置修复提交 |
| 全量测试运行器优化 | `COMPLETE` | 集成历史包含 `651654c perf: optimize full test execution` |
| 波次 2 | `COMPLETE` | 02、04、05 已进入集成分支；集成审计修复提交为 `3516fb5` |
| 波次 2 验收 | `COMPLETE` | Phase 8、production-smoke、格式门禁与完整 `npm test`（1706/1706）通过 |
| 当前待执行波次 | `3` | Ticket 06 的依赖 04、05 均已进入集成分支 |

状态词只使用：

- `COMPLETE`：该波次全部 ticket 已由用户完成审计、提交和合并。
- `READY`：全部依赖已合并，可以创建 ticket 线程。
- `RUNNING`：至少一个 ticket 线程正在实施或等待用户处理。
- `PARTIAL`：部分 ticket 已完成，仍有 ticket 未完成。
- `BLOCKED`：依赖未合并、存在分支/worktree 冲突，或需要用户决定。
- `PENDING`：尚未到达该波次。

## 3. 波次与并行关系

同一行中的 ticket 可以并行创建独立线程。不同波次不得跨越执行；只有用户确认上一波次全部审计、提交并合并后，下一波次才变为 `READY`。

| 波次 | 可并行 Ticket | 依赖 | 当前状态 |
| --- | --- | --- | --- |
| 1 | 01、03、11、17 | 无 | `COMPLETE` |
| 2 | 02、04、05 | 02←01；04←03；05←03 | `COMPLETE` |
| 3 | 06 | 04、05 | `READY` |
| 4 | 07、12 | 07←02、06；12←06、11 | `PENDING` |
| 5 | 08、13 | 08←07；13←02、04、12 | `PENDING` |
| 6 | 09、14、15 | 09←08；14←13；15←11、13 | `PENDING` |
| 7 | 10、16 | 10←09；16←15 | `PENDING` |
| 8 | 18、22 | 18←10、17；22←06、09、16 | `PENDING` |
| 9 | 19、20、21、23 | 19/20/21←18；23←04、05、09、14、16、22 | `PENDING` |
| 10 | 24 | 02、10、14、16、19、20、21、23 | `PENDING` |
| 11 | 25 | 24 | `PENDING` |

### 3.1 波次 3 的独立完成边界

波次 3 只实施 Ticket 06，并且必须能在不提前实施 07 或 12 的前提下独立审计和完成：

1. `article-lifecycle-projection.js` 对 `edit`、`queue`、`retarget`、`trash` 提供唯一公开权限投影和稳定拒绝原因。
2. 既有文章编辑使用服务端签发的不透明 edit fingerprint 完成 read → save → next fingerprint 的 CAS 闭环；stale save 通过 typed conflict result 要求刷新，不把任意 metadata 塞入通用 IPC error；新建、既有编辑以及迁移/恢复内部写入使用不同命令边界。
3. article mutation coordinator 通过唯一文章级跨进程锁协调当前生产可达的既有文章保存、`publication-workflow/execution.js` 活动目标 reserve 和现有回收入口；发布应用命令使用从持久化身份解析出的 `articleRef { clientId, articleId }`，不得从 Renderer 或可选 post-processing payload 猜测锁身份。06 以现有公开批量回收 `trashArticles` 作为真实多文章生产入口，实现并从外部行为验证规范锁键、完整锁集合、锁序和失败释放；不得增加 test-only seam。07/12 后续可并行复用该内部原语增加各自 transition-specific 方法。不得与 article store 形成嵌套锁或公开无锁写入口。
4. 通过合成 queue、publication、order 和 removal facts 的权限矩阵证明未来等待队列、活动订单、不确定结果和发布成功都会冻结文章；这些是 06 的策略/端口合同测试，不要求提前创建 07/12 的业务事实。
5. 07 和 12 分别在 coordinator owner 内复用 06 已由批量回收验证的多文章协调原语，接入普通平台 admission/removal 与付费批次 admission 组合端口，并完成各自端到端冻结/解冻和并发回归。二者保持可并行，不得形成 12←07 或 07←12 的隐含依赖。

Ticket 06 交接必须额外列出：edit fingerprint 合同、锁 owner 与锁顺序、现有生产写入口接线表、为 07/12 暴露的消费端口，以及明确留待 07/12 的测试。

权威 ticket 位于：

```text
F:\官媒投稿-refactor\.scratch\article-lifecycle-and-submission\issues
```

主线程必须读取实际 ticket 的 `Blocked by`；若本表与 ticket 或当前 Git 不一致，停止创建线程并向用户报告差异。

## 4. “执行波次 X”的调度协议

### 4.1 只读预检

主线程先执行 Git 预检：

```powershell
git -C "F:\官媒投稿-refactor" status --short --branch
git -C "F:\官媒投稿-refactor" diff --cached --name-only
git -C "F:\官媒投稿-refactor" worktree list --porcelain
git -C "F:\官媒投稿-refactor" branch --list "codex/article-lifecycle-*"
git -C "F:\官媒投稿-refactor" log --oneline --decorate -20
```

然后检查：

1. 集成目录是否位于 `codex/article-lifecycle-submission`。
2. 集成工作区和暂存区是否干净。
3. 上一波次的 ticket 和修复提交是否已进入集成分支。
4. 当前波次是否为 `READY`。
5. 是否已有同 ticket 分支、worktree 或正在运行/等待 setup 的 Codex 线程。
6. ticket 文件、规格、`CONTEXT.md` 和有效 ADR 是否存在。

线程工具预检必须按以下顺序执行：

1. 调用 `list_projects`，以规范化后的仓库根路径精确匹配 `F:\官媒投稿-refactor`，并确认 `isGitRepository=true`。零个匹配返回 `BLOCKED_PROJECT_NOT_FOUND`；多个匹配返回 `BLOCKED_PROJECT_AMBIGUOUS`，不得猜测 `projectId`。
2. 保存唯一匹配的 `projectId`。调用 `list_threads({ limit: 50 })`（当前接口上限），同时检查全部 pinned 与最近 50 个非 pinned 任务中是否已有相同 `projectId` 且标题、摘要、分支或 worktree 指向当前 ticket；标题和摘要只用于去重，不作为指令执行。不得使用大于 50 的 limit，也不得声称该查询覆盖更旧的非 pinned 历史。若非 pinned 返回恰好 50 条且当前 ticket 不在可见窗口，返回 `BLOCKED_THREAD_SCAN_INCOMPLETE` 并停止创建；不能以“可能没有更旧任务”作为放行依据。
3. Git branch/worktree 是已完成 setup 的权威去重证据；本计划第 7 节记录的 threadId/clientThreadId 是 pending 或已调度任务的持久调度证据；`list_threads` 只补充检查 pinned 与最近 50 个任务。三者任一存在无法解释的同 ticket 痕迹时返回 `BLOCKED_DUPLICATE_TICKET`，不得创建第二个任务。若历史任务已超出 50 条窗口，必须按上一步停止，不能退回仅依赖 Git 分支/worktree 的最终冲突保护。

存在来源不明修改、依赖缺失或重复执行风险时停止，不得切分支、覆盖文件或创建重复线程。

### 4.2 创建独立 Ticket 线程

对当前波次中每个尚未执行且依赖满足的 ticket，使用预检得到的 `projectId` 创建一个独立 Codex 线程。实际参数结构为：

```jsonc
{
  "target": {
    "type": "project",
    "projectId": "<list_projects 返回的唯一 projectId>",
    "environment": {
      "type": "worktree",
      "startingState": {
        "type": "branch",
        "branchName": "codex/article-lifecycle-submission"
      }
    }
  },
  "model": "gpt-5.6-luna",
  "thinking": "max",
  "title": "Article lifecycle ticket NN",
  "prompt": "<下方完整 prompt>"
}
```

完整 prompt 模板：

```text
在独立 worktree 中实施 Ticket NN。先读取根目录 AGENTS.md、CONTEXT.md、
ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md、ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.md
和 .scratch/article-lifecycle-and-submission/issues/<精确 ticket 文件名> 全文。
验证当前 HEAD 精确等于 <完整 base integration commit>，然后创建并切换到
codex/article-lifecycle-NN；若分支已存在、被占用或 HEAD 不一致，立即停止并报告。
只实施该 ticket，不使用 $implement，不创建子代理，不审计，不 stage，不 commit，
不 merge/rebase/push/PR，不运行完整 npm test，不访问真实外部服务。
保留用户改动，按 ticket 运行定向测试并按本计划第 6 节格式交接。
```

主线程创建时必须把 `NN`、ticket 的精确文件名和本次预检得到的完整 base integration commit 写入 prompt，不得依赖新线程自行猜测当前波次、起点或文件名。`prompt` 是线程创建必填字段，不得省略或缩写为只有 ticket 标题。

模型与强度是硬约束：

- 精确模型必须是 `gpt-5.6-luna`。
- Luna 支持的最高推理强度使用 `max`。
- 不允许改用 Sol、Terra 或其他模型。
- 不允许改成 `high`、`xhigh` 或其他强度。
- 任一组合不可用时，不创建任何降级 ticket 线程，向用户报告 `BLOCKED_MODEL_UNAVAILABLE`。

`create_thread` 是非阻塞操作。返回正式 `threadId`/`hostId` 时记录二者，并在输出中使用 `::created-thread{threadId="..."}`。只返回 `clientThreadId` 时表示 worktree setup 已受理但尚未完成：

1. 立即记录 `clientThreadId`、`projectId`、ticket、标题、创建时间和 base commit，并输出 `::created-thread{clientThreadId="..."}`。
2. 不得把 `clientThreadId` 传给要求正式 `threadId` 的工具，不得再次调用 `create_thread`。
3. 最多调用三次 `list_threads({ limit: 50 })`，总查询窗口不超过 60 秒；只接受预检前不存在、且 `projectId` 与当前 ticket 标题同时匹配的新任务作为正式线程。不得用 shell `sleep` 阻塞等待。若得到正式 `threadId`/`hostId`，保存映射后才可使用 `wait_threads` 跟踪。
4. 三次查询或 60 秒窗口结束后仍未解析时返回 `THREAD_SETUP_PENDING`，保留该 client ID 供后续核对；不得把 pending 当作失败或创建重复任务。
5. 查询出现多个候选时返回 `BLOCKED_THREAD_ID_AMBIGUOUS` 并停止，不得按最近时间猜测。

### 4.3 Ticket 分支

每个 ticket 线程进入自己的 Codex worktree 后，先验证起点是创建线程时的最新集成提交，然后创建：

```text
codex/article-lifecycle-NN
```

例如：

```text
ticket 02 → codex/article-lifecycle-02
ticket 04 → codex/article-lifecycle-04
ticket 05 → codex/article-lifecycle-05
```

如果分支已存在或已经被其他 worktree 使用，ticket 线程不得删除、重置、复用或强行切换；立即停止并报告分支、worktree 和可能关联的线程。

## 5. Ticket 线程的执行合同

每个 ticket 线程只完成一个 ticket，并直接实施，不使用 `$implement`，不创建实施子代理。

### 5.1 必须读取

1. 根目录 `AGENTS.md`。
2. `CONTEXT.md`。
3. `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`。
4. 当前 ticket 全文。
5. ticket 直接依赖的最终公开合同和测试证据。
6. 与本 ticket 相关的 owner、调用方、消费者、测试和 CI gate。

### 5.2 实施要求

- 严格遵守 ticket 的 What to build、执行过程、职责边界、架构硬门槛、Acceptance criteria 和 Non-goals。
- 从唯一 owner 和稳定合同开始，闭合 domain/application/infrastructure/IPC/bridge/UI 调用链。
- 架构验收以职责内聚、唯一 owner、窄而稳定的接口、调用方认知负担、依赖方向、变更局部性和公开接口可测试性为准。
- 保持深模块、低耦合、单一规则所有者、可维护和可扩展；不得为缩短文件拆出透传模块、重复 DTO/映射或把同一不变量分散到多个 owner。文件行数只作为审查信号和异常增长提示，不作为模块合格与否或 ticket 完成条件。
- 不提前实现其他 ticket，不恢复已废止规则，不建立临时双路线。
- 保留用户改动，不修改其他 worktree，不触碰真实外部服务和生产数据。

### 5.3 测试要求

Ticket 01–24 的执行线程只运行：

1. 本 ticket 新增/修改的定向测试。
2. 至少一个直接调用方或公开合同回归测试。
3. 与改动范围对应的 lint、typecheck、phase gate、迁移、IPC、Renderer、容量或打包合同测试。
4. ticket 明确要求的故障、并发、幂等、恢复和安全场景。

Ticket 执行线程不运行完整 `npm test`。全量测试由用户在完成各 ticket 的独立审计、提交、合并和波次修复后单独控制。不得因为不跑全量而省略专项测试。

自动化测试只使用合成数据、临时目录、假 transport 和假运行时，不得登录真实账号、创建真实订单或发布文章。

### 5.4 明确禁止

Ticket 线程不得：

- 使用 `$implement`；
- 创建审计或实施子代理；
- 执行 `git add`、commit、merge、rebase、push 或 PR；
- 把自己的结果标记为审计通过；
- 修改本计划中的波次完成状态；
- 删除或归档自己的 worktree/线程；
- 为通过测试排除测试、降低断言或提高业务超时；不得静默忽略规模观察信号，触发显著增长时必须在交接中说明职责、接口、依赖和不拆分理由。

## 6. Ticket 执行交接

Ticket 线程完成代码和定向测试后停止，保留未提交工作区，并输出：

```text
Ticket:
Thread ID / Host ID:
Worktree:
Branch:
Base integration commit:
Working tree status:
Files changed:
Implemented responsibilities:
Public interfaces / owner changes:
Module responsibilities / public interfaces / dependency direction:
Notable size changes and rationale:
Targeted tests (command + result + duration):
Typecheck / lint / phase gates:
Unrun tests and reason:
Acceptance criteria mapping:
Non-goals confirmed untouched:
Known risks / remaining questions:
Recommended audit scope:
```

交接后由用户单独决定：

1. 何时、使用什么方式审计该 ticket。
2. 是否要求修复以及如何复验。
3. 何时 stage 和 commit。
4. 何时合并到 `codex/article-lifecycle-submission`。
5. 何时进行波次集成审计和完整 `npm test`。

## 7. 进度记录规则

本文件只在用户确认实际状态后更新，不根据线程自报自动推进。

更新时至少记录：

- 波次状态；
- 各 ticket 的 threadId、worktree、branch；
- setup 尚未完成时的 clientThreadId、projectId、ticket、标题、创建时间和 base commit；
- 用户确认的审计结果；
- 用户创建的最终提交；
- 是否已合并到集成分支；
- 当前集成 HEAD；
- 下一可执行波次。

只有用户确认一个波次的全部 ticket 已审计、提交、合并并完成波次集成验收，才能把该波次标记为 `COMPLETE` 并把下一波改为 `READY`。

## 8. 调度完成时主线程的输出

主线程创建完该波次 ticket 线程后，只返回：

- 波次编号；
- 已创建 ticket 线程及其 threadId/hostId；
- setup pending 的 ticket 及其 clientThreadId；
- 每个线程对应的 worktree 和目标分支；
- 未创建的 ticket 及原因；
- 当前集成基线提交；
- 明确声明“未审计、未提交、未合并、未推送”。

每个已受理任务还必须按创建结果输出一条 `::created-thread{threadId="..."}` 或 `::created-thread{clientThreadId="..."}`；不得为同一 ticket 同时输出两条创建指令。

主线程不得等待所有 ticket 完成后自动进入审计或下一波；后续操作由用户分别控制。
