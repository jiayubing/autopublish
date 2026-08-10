# M05-J8 — Inventory Authoritative Closure 执行计划

> 用途：直接交给 Codex 按阶段执行。
> 原则：**修机制，不追数字；只审新暴露项；达到门槛后立即停止。**

---

## 1. 本轮目标

J8 **只处理 inventory/classifier**。

不要：

- 重新审整个 M05
- 重审 M04 / Ticket 24
- 修改 production behavior
- 重新设计 Renderer / typed IPC / lifecycle / OperationalStore / adapter
- 为了让数字变 0 而继续增加具体 token allowlist

必须解决两个机制问题：

1. 真实 source-reading static tests 仍可能藏在 `RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION`，导致 authoritative static inventory 不完整。
2. tainted source 经 `array/map/concat/join`、对象属性、accumulator/push/regex parse 等数据流后会丢失 source taint，或 property/source-holder 名称仍可能给 arbitrary assertion 授予 static category。

最终目标：

```text
REWRITE_PUBLIC_BEHAVIOR = 0
semantic REWRITE_PUBLIC_BEHAVIOR = 0
```

并且 authoritative inventory 能完整覆盖 retained static guards。

---

## 2. 硬约束

- **不要新建分支。**
- 直接在当前分支、当前最新 HEAD 上执行。
- 每个阶段只读必要文件。
- 原则上：
  ```text
  production behavior diff = 0
  ```
- 不新增 test-only seam。
- 不修改 runner / exclude / discovery / timeout / concurrency 来获得绿色结果。
- 每阶段完成后记录 evidence；建议下一阶段新开线程，避免上下文污染。

---

# 推荐拆成 4 个线程

1. **J8-A — Source-taint 模型与 regression contracts**
2. **J8-B — 真实仓库 inventory reconciliation**
3. **J8-C — Final gates / evidence**
4. **J8-D — Docs-only closure**

不要一个线程从 A 一直做到 D。

---

# J8-A — Source-taint 模型闭合

## 目标

把 source provenance 作为数据流属性传播，而不是继续依赖 source-holder 名字或关键词判断。

只修改：

- `scripts/test-inventory.js`
- `tests/test-inventory-contract.test.js`

原则上不要改真实业务测试。

---

## A1. 必须覆盖的 source-taint 数据流

以下链路必须持续保留 source taint。

### 直接 alias

```js
const source = readProductionSource();
const alias = source;
```

### 字符串派生

```js
source.slice(...)
source.substring(...)
source.substr(...)
source.split(...)
source.replace(...)
source.replaceAll(...)
source.trim(...)
source.toString()
source.length
```

### 集合聚合

```js
const parts = [source];
const joined = parts.join("\n");
```

以及：

```js
files
  .map(readProductionSource)
  .filter(...)
  .concat(...)
  .join("\n");
```

### 对象传播

```js
const box = {
  bridge: source,
};

assert.match(box.bridge, /.../);
```

如实现成本合理，也覆盖：

- object destructuring
- object spread

### 循环 / helper / callback

```js
for (const relative of files) {
  const source = read(relative);
}
```

```js
files.forEach((relative) => {
  const source = read(relative);
});
```

```js
function inspect(relative) {
  return read(relative);
}
```

### recursive scanner

```js
productionRoots.forEach(visit);

function visit(target) {
  ...
  fs.readFileSync(full, "utf8");
}
```

### accumulator

```js
const violations = [];

for (...) {
  const source = read(...);

  for (const match of source.matchAll(...)) {
    violations.push(...);
  }
}

assert.deepEqual(violations, []);
```

### dynamic repo roots

覆盖：

```js
path.join(...)
path.resolve(...)
__dirname
import.meta.dirname
```

---

## A2. Static category 授权原则

source-holder identifier、对象 property key、普通上下文词本身都**不能**授予 static category。

例如下面必须不能仅因为变量叫 `bridge` 而成为 architecture static：

```js
const bridge = readProductionSource();

assert.match(
  bridge,
  /someInternalBusinessThing/
);
```

下面也一样：

```js
const source = readProductionSource();

const box = {
  owner: source,
};

assert.match(
  box.owner,
  /someInternalBusinessThing/
);
```

以下普通词都不能作为 static authorization：

```text
bridge
owner
capability
auth
sandbox
package
artifact
runtime
resource
path
channel
symbol
```

static category 必须来自 assertion **真正检查的 invariant**，例如：

- public capability/import/dependency
- legacy/capability absence
- Electron/security config
- packaging / release / CI
- discovery

不要继续通过增加更多 token whitelist 修补。

---

## A3. 必须新增 regression contracts

至少覆盖：

### source array/join

```js
const parts = [readProductionSource()];
const text = parts.join("\n");

assert.match(
  text,
  /someInternalBusinessThing/
);
```

必须识别为 source assertion。

---

### map/join

```js
const source = files
  .map(readProductionSource)
  .join("\n");

assert.match(source, /someInternalBusinessThing/);
```

必须识别为 source assertion。

---

### object property

```js
const source = readProductionSource();

const box = {
  bridge: source,
};

assert.match(
  box.bridge,
  /someInternalBusinessThing/
);
```

必须：

```text
NOT RETAIN_STATIC_GUARD
```

除非 matcher 本身明确保护合法 static invariant。

---

### recursive source scan

覆盖：

```js
productionRoots.forEach(visit)
```

以及 helper 参数传播。

---

### accumulator

覆盖：

```text
source → regex/matchAll → accumulator.push → final assert
```

必须识别为 source-derived assertion。

---

### 合法 static 不得回归

必须继续正确识别：

- architecture import/dependency absence
- public IPC/preload/bridge capability
- security config
- legacy/capability absence
- CI/workflow
- packaging/discovery

---

### 普通 behavior 不得误判

例如：

```js
const result = feature.run();

assert.equal(
  result.status,
  "done",
);
```

不得成为 source assertion。

---

## J8-A 停止条件

必须全部满足：

- 新 regression contracts PASS
- 合法 static fixtures 仍 PASS
- 普通 runtime behavior 未误判
- 没有开始大面积修改真实业务测试
- 没有修改 production

建议建立 implementation/tooling commit。

---

# J8-B — 真实仓库 Inventory Reconciliation

基于 J8-A 最新 commit 重新生成 authoritative inventory。

**只审：**

1. 新从 `FILE_HEURISTIC_NOT_ASSERTION` 提升为 assertion-level 的 declarations
2. 仍然可疑的 `FILE_HEURISTIC_NOT_ASSERTION`

不要重新审全部 1600+ declarations。

---

## B1. 必须优先核对

至少检查：

- `phase-08-operational-store-internals.test.js`
- `phase-06-workspace-coordinator.test.mjs`
- `phase-06-workspace-bootstrap-typed-ipc.test.js`
- `phase-08-renderer-contract-layout.test.js`
- `architecture-seams.test.js`
- `phase-05-production-seams.test.js`
- `phase-06-typed-ipc-production.test.js`
- `phase-06-capability-specific-inventory.test.js`
- `ci-workflow-contract.test.js`
- dynamic `desktop-packaging` guards

---

## B2. 处理规则

### 合理 static invariant

如果 declaration 保护：

- architecture
- security
- legacy/capability absence
- packaging
- CI
- discovery

则：

```text
RETAIN_STATIC_GUARD
```

并给出清晰 invariant。

---

### 非法 source-shape residual

如果新 detector 暴露：

- private implementation name
- arbitrary source slice
- implementation expression
- source line count
- UI/business positive source assertion

则做最小：

- delete
- split
- rewrite
- replacement

如果已有 behavior coverage，优先删除冗余 source assertion。

不要机械保持测试数量。

---

## B3. 最终人工检查

完成后人工抽查所有 retained static guards。

确认不存在：

```text
source-holder / property name
→ static category authorization
```

也确认真实 source-reading static tests 不再藏在：

```text
RETAIN_BEHAVIOR_FILE_HEURISTIC_NOT_ASSERTION
```

---

## J8-B 停止条件

必须满足：

```text
REWRITE_PUBLIC_BEHAVIOR = 0
semantic REWRITE_PUBLIC_BEHAVIOR = 0
```

并确认：

> authoritative inventory 已覆盖所有真实 source-reading static tests。

如果仍存在已知漏检：

```text
BLOCKED
```

不要进入 J8-C。

---

# J8-C — Final Gates / Evidence

先建立最终 **implementation commit**。

建议 commit：

```text
test: close M05 authoritative source-taint inventory
```

记录：

```text
implementation HEAD = <sha>
```

然后所有最终 evidence 都必须绑定这个 SHA。

---

## C1. 必须执行

至少执行：

```text
changed targeted tests
test-inventory-contract.test.js
完整 inventory
inventory reproducibility
test discovery
npm run lint
typecheck:renderer
typecheck:bridge
typecheck:main
npm run format:check
M05 relevant static gates
full npm test
git diff --check
git status --short
```

按仓库实际 scripts 调整命令名，但不得删 required gate。

---

## C2. 必须报告

```text
files:
declarations:
source assertion candidates:
retained static guards:
FILE_HEURISTIC_NOT_ASSERTION:
REWRITE_PUBLIC_BEHAVIOR:
semantic REWRITE_PUBLIC_BEHAVIOR:
```

Full test：

```text
total:
passed:
failed:
skipped:
todo:
cancelled:
allFilesReported:
```

---

## C3. 禁止

不要通过：

- exclude
- discovery change
- runner modification
- timeout change
- concurrency change

获得 PASS。

---

## J8-C 停止条件

所有 required gates 必须在同一个 implementation HEAD 上 PASS。

如果 required gate 失败：

```text
BLOCKED
```

不要先写 COMPLETE 文档。

---

# J8-D — Docs-only Closure

只有 J8-C 全 PASS 后执行。

只更新：

- M05 authoritative maintenance contract
- authoritative ledger
- Wave Plan
- latest J8 handoff

状态必须一致：

```text
M05 = COMPLETE
M06 = READY / PENDING TO START
10.5 = PARTIAL（M06 未完成前）
Ticket 25 = blocked by M06 gate
```

建立 docs-only closure commit。

建议：

```text
docs: finalize M05 authoritative inventory closure
```

验证：

```bash
git diff --name-only <implementation-head>..<closure-head>
```

只能出现 docs / ledger / handoff / Wave Plan。

最终：

```text
git status = clean
```

---

# 最终 PASS 门槛

只有以下全部成立才能写：

```text
PASS — M05 COMPLETE, ready for M06
```

必须全部满足：

- [ ] source taint 覆盖 alias
- [ ] source taint 覆盖 string transforms
- [ ] source taint 覆盖 array/map/concat/join
- [ ] source taint 覆盖 object property
- [ ] source taint 覆盖 loop/helper/recursive
- [ ] source taint 覆盖 accumulator
- [ ] source-holder/property 名称不能授权 arbitrary static
- [ ] 真实 source-reading static tests 不再藏在 FILE_HEURISTIC_NOT_ASSERTION
- [ ] 新暴露非法 source-shape residual = 0
- [ ] semantic REWRITE_PUBLIC_BEHAVIOR = 0
- [ ] production behavior diff = 0
- [ ] runner/discovery 未被修改制造 PASS
- [ ] lint PASS
- [ ] typecheck PASS
- [ ] format PASS
- [ ] static gates PASS
- [ ] full test PASS
- [ ] evidence 绑定 implementation HEAD
- [ ] closure docs-only
- [ ] working tree clean

否则：

```text
BLOCKED
```

并按：

```text
P0:
P1:
P2:
P3:
```

列出 remaining findings。

---

# 每个线程可直接复制的开场 Prompt

## J8-A

```text
执行 M05-J8-A。

只修 inventory source-taint/classifier 与 regression contracts。
不要修改真实业务测试，不要修改 production，不要新建分支。

重点闭合：
- array/map/concat/join
- object property
- loop/helper/recursive
- accumulator
- source transform taint
- source-holder/property 名不得授权 arbitrary static

完成后只汇报：
- implementation/tooling diff
- regression contracts
- 是否还有已知 blind spot
- commit SHA

达到停止条件后立即停止。
```

---

## J8-B

```text
执行 M05-J8-B。

基于最新 J8-A commit 重新生成 authoritative inventory。
只审新提升 candidates 与仍可疑的 FILE_HEURISTIC_NOT_ASSERTION。

不要重新审整个 M05，不要修改 production。

合理 architecture/security/legacy/CI/packaging/discovery static 应正确进入 RETAIN_STATIC_GUARD。
如暴露真正 source-shape residual，只做最小 delete/split/rewrite/replacement。

最终必须明确：
- authoritative static inventory 是否完整
- REWRITE_PUBLIC_BEHAVIOR
- semantic REWRITE_PUBLIC_BEHAVIOR
- remaining FILE_HEURISTIC_NOT_ASSERTION 的原因

达到停止条件后立即停止。
```

---

## J8-C

```text
执行 M05-J8-C final gates。

不要继续改 implementation，除非 gate 暴露直接 regression。

记录当前 implementation HEAD，并在该 HEAD 上完整运行：
targeted / inventory contracts / inventory / reproducibility / discovery /
lint / typecheck / format / static gates / full npm test / diff-check / status。

禁止修改 runner/exclude/discovery/timeout/concurrency 获得 PASS。

任何 required gate 失败都输出 BLOCKED。

完成后只汇报完整 evidence 和 implementation HEAD。
```

---

## J8-D

```text
执行 M05-J8-D docs-only closure。

前提：J8-C 所有 required gates 已 PASS。

只更新：
- M05 maintenance contract
- authoritative ledger
- Wave Plan
- J8 handoff

不得修改 implementation。

确认：
M05 COMPLETE
M06 READY / PENDING TO START
10.5 在 M06 完成前仍 PARTIAL
Ticket 25 继续受 M06 gate 约束

建立 docs-only closure commit，验证 implementation HEAD..closure HEAD 只有文档变化，最终 working tree clean。

完成后输出最终 Verdict 和 handoff，然后停止。
```
