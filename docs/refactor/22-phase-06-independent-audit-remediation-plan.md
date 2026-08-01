# Phase 06 最终独立审计整改计划（三）

> **2026-08-01 checkpoint（最新执行标记）：** 在 Ticket 1→4 整改基础上，证据 helper 追加 callback `return`/`finally` 控制流最小收紧；动态提前 return 与同步必抛 callback 后 cleanup 均 fail-closed，normal `finally { return; }` 吞异常对照保持可达。symbol evidence `148/148`；production matrix `33/33`（109 capability、21 lifecycle、5 event）；inventory/bridge fail-closed `16/16`；完整 `npm test` `1453/1453`，0 fail/skip；main/renderer/bridge typecheck、定向 lint/Prettier 与 `git diff --check` 通过。`P1-CONVERGENCE-01=整改复验 GREEN，等待最终独立只读审计`；Phase 03/04/06=`IN_PROGRESS`，Phase 07=`NOT_STARTED`。本次提交使用 checkpoint tag `phase-06-audit-remediation-green`；后续计划从此处继续，最终独立审计前不得标记 Phase 06 `COMPLETE`。

> 日期：2026-07-31 Asia/Shanghai  
> 启动状态：`P1-CONVERGENCE-01=RED`；Phase 03/04/06=`IN_PROGRESS`；Phase 07=`NOT_STARTED`。  
> 目标：修复 2026-07-31 Phase 06 独立只读审计确认的三类证据引擎假阳性和一项 Renderer StrictMode 生命周期缺陷，并完成新的独立复验准备。  
> 当前基线：`codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`；工作树含既有未提交整改，staged 为空。完整 `npm test` 为 225 文件、1419/1419，通过 lint、main/renderer/bridge typecheck、format check 与 `git diff --check`，但四个独立反例均能绕过当前门禁。

> **2026-07-31 执行结果（当前权威）：** Ticket 0 已冻结现场，Ticket 1→4 均按“唯一公开 `verifyCapabilityEvidence()` 或真实 coordinator lifecycle seam 先 RED、再最小 GREEN”串行完成；没有 reset/checkout/clean/stage/commit/push/PR。最终 `git status --short --untracked-files=all` 为 `M=117`、`D=14`、`??=21`（152 条 WIP 状态），staged=0；分支/HEAD 仍为 `codex/refactor-program` / `3992736d01413d83504253c7d905c21fcfe3183c`。
>
> 五个证据启动 RED 的精确反例与原因：`single production evidence core rejects a returned snapshot object whose result is discarded by the production entry`、`single production evidence core rejects a snapshot field written only to a local non-escaping object`（均因 `lifecycle snapshot field has no reachable production consumer`）；`single production evidence core rejects a shadowed Object.freeze identity transform`（因 `lifecycle query result does not reach the recorded snapshot field`）；`single production evidence core rejects a snapshot read after a return-finally`、`single production evidence core rejects a snapshot read after a throw-finally`（均因 `lifecycle snapshot field has no reachable production consumer`）。普通 `try/finally` 对照保持可达。Ticket 4 的真实 lifecycle RED 为 `workspace coordinator replays a StrictMode effect without losing its transport`：第一次 cleanup 终止 `dispose()` 后第二次 setup 无法重新订阅/注册；GREEN 为可重入、幂等 `stop()`，Provider cleanup 改用 `stop()`，终态 `dispose()` 仍 fail-closed。
>
> 最小 GREEN 边界：evidence helper 用 TypeChecker canonical lib identity 放行标准 `Object.freeze`，沿可达值流和 observable sink 闭合 snapshot，统一静态控制流处理 abrupt `finally`；Coordinator 仅分离可重启 transport stop 与 terminal dispose。未新增第二验证器、文本/source fallback、production-only bypass，也未修改 IPC contract、业务服务或 Phase 03/04 业务语义。
>
> 专项与全量：symbol evidence `121/121`；production matrix `33/33`（`109/109` capability，其中 43 query、61 command、5 event；`21/21` lifecycle；`5/5` event）；Coordinator `7/7`；caller inventory `3/3`；bridge fail-closed `9/9`。重新格式化后完整 `npm test` 为 225 文件、132 suites、`1426/1426`、0 fail/skip（332478.883 ms）。Auth `16/16`、links `180/180`、packaging `33/33`、Lint、main/renderer/bridge typecheck、宽 `format:check` 和本轮定向 Prettier 均通过；Renderer build 转换 `2157` modules，标准 `pack:smoke` 与 alpha verifier 通过。
>
> Renderer/制品复验：ASAR/source parity `10/10`（Phase 03 remote-order、Phase 06 capability/legacy physical parity），真实 bundled preload（含直接从 `app.asar` 加载）`3/3`，Electron Renderer focus `1/1`，`git diff --check` 通过。最终制品为 Renderer `media-workbench/dist/assets/index-DmAGTIWM.js` `758842` bytes/SHA-256 `048D72A0856D0F50B0A0FB241467B799EC17D0B7010AAEFFE904B54122B15641`；preload `build/preload/preload.cjs` `222731` bytes/SHA-256 `0A8642AB024AD5061E8ACC71C42DB566C62DC8E9D443277C45F2EE0C41B177F4`；ASAR `7214697` bytes/SHA-256 `709A7AF4E555076F4FF695331E1B3985C5A5EF419DF2BAA8054CCF401FC8AFEA`；exe `225485824` bytes/SHA-256 `983EDAC6B0CC86DC6DD884B217AE471655E5A3943ED3FA13EFDC34953DA051D3`；bundled Node `92534088` bytes/SHA-256 `9A4EB5F1C29C6A2E93852EAD46B999E284A6A5CA8BAB4D4E241D587D025A52DE`。
>
> 所有验证均使用合成/临时 fixture；未访问真实 workspace、内容库、Auth 数据库、账号、供应商或外部/付费系统，真实投稿、同步、扣费、付费 submit 均为 `0`。`P1-CONVERGENCE-01` 仅记录为“整改复验 GREEN，等待最终独立只读审计”；Phase 03/04/06 继续 `IN_PROGRESS`，Phase 07 继续 `NOT_STARTED`。本任务到此停止，等待再次独立只读审计。

## 1. 审计结论

本轮不得关闭 Phase 06，也不得把 `P1-CONVERGENCE-01`恢复为`VERIFIED`。当前唯一公开 `verifyCapabilityEvidence()` seam 仍会接受以下断链证据：

1. Renderer owner 返回包含 snapshot 字段的对象，但生产入口直接丢弃该返回值；
2. snapshot 字段只写入随后丢弃的局部对象属性；
3. 局部 shadow `Object.freeze()`擦除 query 结果，却被当成标准库 identity transform；
4. snapshot 字段读取位于终止型 `try/finally`之后的静态死代码；
5. `WorkspaceCoordinatorProvider`位于 React `StrictMode`内，但 effect cleanup 调用终态 `dispose()`，开发模式第二次 setup 无法重新启动或注册 scope。

前三类证据问题均直接影响 109 项 production capability matrix 和 21 项 lifecycle 结论的可信度，按 P1 处理。StrictMode 缺陷影响 Renderer 开发运行期和任何 effect 重放环境，按 P2 处理。

## 2. 范围与约束

### 2.1 允许修改

- `auto—publish/tests/helpers/typescript-symbol-evidence.js`；
- `auto—publish/tests/phase-06-symbol-identity-evidence.test.js`；
- 必要的 Phase 06 production matrix/fixture 测试，但不得建立第二验证器；
- `auto—publish/media-workbench/src/features/workspace/workspace-coordinator.js`；
- `auto—publish/media-workbench/src/features/workspace/workspace-coordinator-context.tsx`；
- Workspace coordinator/Renderer StrictMode 相关测试；
- 完成后必须写回的 Phase 06、交接、进度账本及本计划执行结果。

### 2.2 禁止事项

- 不恢复 parse-only、文本 receiver、terminal-name、source-string 或全 Program 同名扫描兜底；
- 不新增仅供 production matrix 绕过公共 seam 的旁路 helper；
- 不降低 109 项 capability、21 项 lifecycle、5 项 event 的闭合要求；不能闭合的 capability 必须删除真实 production 链并如实更新 inventory；
- 不借本轮修改 Phase 03 订单语义、OperationalStore schema、Publisher、ContentStore 或外部平台 adapter；
- 不访问真实 workspace、内容库、Auth 数据库、账号、供应商或付费服务；真实投稿、同步、扣费和付费 submit 必须为 0；
- 不 reset、checkout、clean、覆盖既有 WIP；未经用户另行授权不 stage、commit、push 或创建 PR。

## 3. Ticket 0：冻结现场

开始前记录：

```powershell
git branch --show-current
git rev-parse HEAD
git status --short --untracked-files=all
git diff --stat
git diff --cached --stat
```

确认 staged 为空，记录当前 109 项 inventory（43 query、61 command、5 event）及 21/5 lifecycle/event 基线。后续每个 Ticket 必须串行执行 RED→最小 GREEN，不能一次加入全部反例后整体修复。

## 4. Ticket 1（P1）：闭合 Renderer observable sink

### 4.1 永久 RED

在 `phase-06-symbol-identity-evidence.test.js` 中增加两个独立 mutation，均直接调用与 production matrix 相同的 `verifyCapabilityEvidence()`：

```ts
export function View() {
  feature.refresh();
  const snapshot = feature.getSnapshot();
  return { ignored: snapshot.orders };
}
// production entry: View(); // 返回值被丢弃
```

```ts
export function View() {
  feature.refresh();
  const snapshot = feature.getSnapshot();
  const local = {};
  local.ignored = snapshot.orders;
  return null;
}
```

两个反例在修复前必须稳定复现 `result.ok === true`，修复后必须 `false`，并断言原因包含 `lifecycle snapshot field has no reachable production consumer` 或新的等价精确原因。

### 4.2 最小 GREEN

收紧 `lifecycleStateHasConsumer()` / `reachesObservableSink()`：

- `ReturnStatement`不是天然 observable sink；只有返回值被真实调用方消费、进入已渲染 JSX/React 返回链或闭合到其他已证明 sink 时才能通过；
- 属性赋值不是天然逃逸；必须证明 receiver 是可观察状态、已返回对象、真实 JSX/React state，或继续沿 receiver 的逃逸链闭合；
- 写入局部非逃逸对象、入口丢弃返回对象、覆盖后无读取均 fail-closed；
- 不得以 owner 名称看起来像组件、文件扩展名是 `.tsx` 或任意 JSX 存在作为充分条件；必须使用已有 entry/callsite/JSX rendered-instance 证明。

完成后复验全部 21 项 production lifecycle；如真实 production consumer 无法闭合，只允许最小显式 wiring 修复，不能放宽证据核心。

## 5. Ticket 2（P1）：闭合标准库 identity transform

### 5.1 永久 RED

新增独立 mutation：

```ts
export function createFeature(deps) {
  const Object = { freeze(_value) { return []; } };
  let snapshot = { orders: [] };
  async function refresh() {
    snapshot = { orders: Object.freeze(await deps.loadOrders()) };
  }
  return { refresh, getSnapshot: () => snapshot };
}
```

修复前必须复现 `ok === true`，修复后必须因 query 结果没有到达 snapshot 字段而失败。

### 5.2 最小 GREEN

- `callPreservesArgument()`接受 `Object.freeze`前必须通过 TypeChecker canonical symbol/declaration identity 确认其来自标准 TypeScript lib；
- 局部变量、参数、namespace、对象属性或其他模块导出的同名 `Object.freeze`全部失败；
- memory Program 若没有标准库声明，不能按文本猜测为 builtin；fixture 应提供可验证声明，或让该路径 fail-closed；
- 顺带审查本函数内其他按文本放行的 transform。只有能构造现实假阳性的项目才纳入本轮，避免无边界重写。

## 6. Ticket 3（P1）：闭合终止型 try/catch/finally 控制流

### 6.1 永久 RED

至少增加以下相互独立的不可达反例：

```ts
try { return null; } finally { return null; }
return snapshot.orders;
```

```ts
try { throw new Error("stop"); } finally { return null; }
return snapshot.orders;
```

并增加一个可达对照，证明普通 `try/finally`不会被误判：

```ts
try { doWork(); } finally { cleanup(); }
return snapshot.orders;
```

### 6.2 最小 GREEN

扩展统一静态控制流判断，而不是在 lifecycle verifier 中硬编码：

- abrupt `finally`使整个 try statement 后续不可达；
- normal `finally`保留 try/catch 的完成语义；
- `return`、`throw`、无逃逸无限循环以及双方都 abrupt 的确定分支继续闭合；
- 无法静态证明时保守视为可能可达，不能错误删除 production 路径；
- 新逻辑必须被 producer、consumer、preload disposer、feature disposer 等所有使用 `isStaticallyUnreachableBranch()` 的证据共同复用。

复验已有 `if`、switch、loop、empty iterable、post-return 反例，防止控制流修复产生回归。

## 7. Ticket 4（P2）：使 Workspace coordinator 可安全重启

### 7.1 永久 RED

新增 coordinator 生命周期测试，模拟 React StrictMode effect 重放：

```text
setup/start → scope register → scope cleanup → effect cleanup
→ second setup/start → second scope register → receive invalidation
```

RED 必须证明当前实现第一次 cleanup 调用 `dispose()` 后：

- 第二次 `start()`不再建立 transport subscription；或
- 第二次 `register()`抛出 `Workspace coordinator is disposed`。

测试必须核对订阅/取消订阅次数、第二轮 event 消费和最终清理，不接受只扫描源码字符串。

### 7.2 最小 GREEN

推荐边界：

- coordinator 增加可重入、幂等的 `stop()`：只取消 transport、清空 transport disposer并令 `started=false`，不设置 terminal `disposed`；
- `WorkspaceCoordinatorProvider` effect cleanup 调用 `stop()`，使 `setup→cleanup→setup`可重新订阅；
- `dispose()`继续作为终态 API，并内部复用 `stop()`后清理 registrations、snapshot listeners、runtime identity；
- 重复 `start()`、重复 `stop()`和 start-after-stop 均幂等；dispose-after-stop 安全；dispose 后 register/start 继续 fail-closed；
- diagnostic subscription 仍在每轮 effect setup/cleanup 成对创建和释放，不得重复报告或泄漏 listener。

如选择重建 coordinator 而非增加 `stop()`，必须证明 Context value 与所有 child hooks 在同一 commit 内一致，不产生旧实例注册；默认优先使用 `stop()`方案。

## 8. Ticket 5：专项收敛复验

依次运行：

```powershell
node --test tests/phase-06-symbol-identity-evidence.test.js
node --test tests/phase-06-production-ipc-fixture-matrix.test.js
node --test tests/phase-06-workspace-coordinator.test.mjs
node --test tests/phase-06-production-caller-inventory.test.js
node --test tests/phase-06-production-bridge-fail-closed.test.js
```

必须记录：

- 本计划四个证据 mutation 均由启动 RED 转为稳定 GREEN；
- StrictMode lifecycle 由 RED 转为 GREEN；
- 109/109 production capability、21/21 lifecycle、5/5 event 保持通过；
- production matrix 与 mutation corpus 仍 import 同一个 `verifyCapabilityEvidence()`；
- helper 中不新增第二验证器、文本兜底或 production-only bypass。

## 9. Ticket 6：完整门禁

在 `auto—publish` 执行：

```powershell
npm test
npm run test:auth
npm run lint
npm run typecheck:main
npm run typecheck:renderer
npm run typecheck:bridge
npm run format:check
npm run test:links
npm run test:packaging
npm run build:renderer
npm run pack:smoke
git diff --check
```

因为 Ticket 4 修改 Renderer production lifecycle，必须完成 renderer build、标准 pack smoke、最新 ASAR/source parity 和 Electron focus 回归；不能只依赖 TypeScript 静态检查。所有测试使用合成/临时 fixture，外部服务及真实付费调用数必须为 0。

若 `format:check`脚本未覆盖本轮新增/修改测试 helper，应额外对具体文件执行定向 Prettier check，并记录两类结果，不能用窄 glob 宣称所有变更已格式化。

## 10. Ticket 7：文档与状态写回

全部 GREEN 后写回：

- `docs/refactor/09-phase-06-renderer-ipc.md`；
- `docs/refactor/13-progress-ledger.md`；
- `docs/refactor/handoffs/phase-06.md`；
- 本计划顶部执行结果；
- 如共享证据结论影响 Phase 03/04，再同步相应 phase 文档和 handoff，但不得改写其业务结论。

写回必须记录：

1. 五个启动 RED 的精确名称和失败原因；
2. 最小 GREEN 修改边界；
3. 最新 corpus、production matrix、lifecycle/event、完整测试数量；
4. 最新 branch/HEAD/status/staged 状态及制品 hash；
5. 真实数据、外部服务、投稿、同步、扣费、付费调用均为 0；
6. 本整改线程不得自行宣布 Phase 06 `COMPLETE`。

完成整改后，`P1-CONVERGENCE-01`只能记录为“整改复验 GREEN，等待最终独立只读审计”。Phase 03/04/06继续保持`IN_PROGRESS`，Phase 07保持`NOT_STARTED`；只有新的独立只读审计未发现 P0/P1 且所有门禁/制品证据有效，才能讨论恢复最终状态。

## 11. 新任务建议首条指令

可将以下内容直接交给新的 Codex 任务：

> 严格按 `docs/refactor/22-phase-06-independent-audit-remediation-plan.md`执行 Phase 06 整改。先冻结现场，然后按 Ticket 1→4 串行 TDD，每项必须先用唯一公开 `verifyCapabilityEvidence()`或真实 coordinator lifecycle seam 得到 RED，再做最小 GREEN。保留既有 WIP，不 reset/clean/stage/commit，不访问真实数据或外部/付费系统。完成专项、完整门禁、Renderer build/pack/ASAR parity 和文档写回后停止，保持 Phase 03/04/06=`IN_PROGRESS`并等待再次独立只读审计。
