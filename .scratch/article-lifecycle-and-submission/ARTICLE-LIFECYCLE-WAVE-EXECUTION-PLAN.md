# 文章生命周期重构波次执行计划

> **唯一职责：NOW / NEXT / GATE。** 业务语义看根产品规格；实施方式看 `EXECUTION-PROTOCOL.md`；审计方式看 `AUDIT-PROTOCOL.md`；单项范围看当前 `issues/` / `maintenance/` 合同；历史 evidence 看 `handoffs/`。

> **默认阅读预算：** 只读 §1–2 选择入口。只有当前任务已经指向一个具体 Ticket/Maintenance，才读取其合同和直接相关规格小节；`handoffs/`、`archive/` 与已完成阶段默认不读。

## 1. 当前状态

整理日期：2026-08-20。本文状态来自整理前实时计划；每次执行仍必须用当前源码、测试、schema 和 Git 状态重新验证，本文不能覆盖可执行事实。

| 范围 | 状态 | 当前事实与剩余 gate |
| --- | --- | --- |
| Wave 1–10.5、M03、M04–M06 | `COMPLETE` | 本地 implementation、审计、最终 gate 与 evidence 已闭合；详情只在历史取证时读取 archive/handoff/Git。 |
| Wave 11 / Ticket 25 | `PARTIAL` | 25-A～25-G package closure 已完成；其合同仍记录 Independent Combined Audit、必要 remediation、bounded closure re-audit、final clean smoke 和真实外部验收未闭合。Ticket 26 已替换旧文章/投稿 UI，当前没有默认继续执行入口。 |
| Wave 11.5 / Ticket 26 | `PARTIAL` | 26-0～26-I 本地 closure、combined audit、bounded re-audit 和 package/smoke 已闭合；真实登录、发布、付费、取消、订单核对和生产迁移未获本次授权。 |
| Wave 12 / Ticket 18 | `COMPLETE` | 18-0～18-E、本地图片准备 integration closure、审计与 final clean-HEAD gate 已闭合。 |
| Wave 13 / Ticket 19 | `PARTIAL` | 19-0～19-G 本地 implementation、审计、remediation 和最终本地验证已闭合；独立 HTTP multipart 带图真实验收仍需当次明确授权。 |
| Ticket 20 / Ticket 21 | `PENDING` | 已移出当前 Wave，当前没有调度入口；未来是否实施必须建立独立计划，不从 Ticket 19 自动启动。 |
| 阶段三审计整改 / Ticket 27 | `PARTIAL` | 27-A publication evidence/失败 read model 已完成本地实现、定向验证、Primary Audit、blocking remediation、Bounded Re-audit 与 handoff；27-B 当前运行期 uncertain 恢复已完成 implementation、定向验证、Primary Audit、P1 remediation、Bounded Re-audit 与 commit（`6b5f533`；`handoffs/27-B-runtime-uncertain-recovery.md`）；27-C 已完成 Primary Audit、P2 remediation、Bounded Re-audit 与 commit（`fdaa115`；`handoffs/27-C-result-closure-renderer.md`）。 |

**当前动作：** Ticket 27 状态 `PARTIAL`。27-C 已 Closure；只有用户另行授权后才可从新的 scheduling preflight 启动 27-D combined audit/closure，也不得恢复真实外部操作。小型、明确且与 Ticket 27 owner 不重叠的局部修改仍按 `docs/AI-ENTRY.md` 处理。

## 2. 未闭合入口与停止边界

### 2.1 Wave 11 / Ticket 25

- 当前合同：`issues/25-full-workflow-acceptance-performance-and-release-gates.md`。
- 25-A～25-G 的 package closure 只作为已完成本地 evidence，不等于 Ticket 25 / Wave 11 `COMPLETE`。
- 因 Ticket 26 已替换旧文章/投稿 UI，后续若要求收口 Wave 11，必须先以当前规格、源码和测试判断 Ticket 25 剩余 gate 是否仍适用于当前链路；不得直接执行历史计划中的旧 UI 步骤。
- 未经当次明确授权，不执行真实登录、普通平台发布、付费下单、订单刷新或生产迁移。

### 2.2 Wave 11.5 / Ticket 26

- 当前合同：`issues/26-article-library-and-submission-center-redesign.md`；本地 closure evidence：`handoffs/26-I-integration-audit-and-closure.md`。
- Ticket 26 本地 closure 可作为后续本地工作的基线，但不会把 Ticket 25/26 的真实外部验收伪记为完成，也不会继承过去请求中的外部操作授权。
- 只有用户针对具体账号、目标、费用、可见副作用和停止条件作出本次明确授权，才可建立对应真实验收任务。

### 2.3 Wave 13 / Ticket 19

- 当前合同：`issues/19-lieju-image-publication-adapter.md`；本地 closure evidence：`handoffs/19-G-lieju-http-integration-closure.md`。
- 唯一未闭合入口是用户单独授权后的列举网真实 HTTP multipart 带图验收。
- 探索授权、历史发布授权或其他平台授权都不能代替本次验收授权；Ticket 20/21 保持 deferred。

### 2.4 阶段三审计整改 / Ticket 27

- 当前合同：`issues/27-publication-attention-result-closure-remediation.md`；状态 `PARTIAL`；27-A evidence：`handoffs/27-A-publication-evidence-and-failure-read-model.md`。
- 串行顺序：27-A publication evidence/失败 read model → 27-B 当前运行期 uncertain 恢复 → 27-C Attention/发布档案 Renderer → 27-D combined audit/closure。
- 27-A 的本地 implementation、定向验证、Primary Audit、blocking remediation 与 Bounded Re-audit 已完成；27-B 的 implementation、定向验证、Primary Audit、P1 remediation、Bounded Re-audit 与 commit 已完成（`6b5f533`）；27-C 的 implementation、Primary Audit、P2 remediation、Bounded Re-audit 与 commit 已完成（`fdaa115`）。后续 27-D 必须另获用户授权。
- 人工“确认已接受”不强制填写 URL；人工决定、绑定的 attempt/observation、明确的 manual positive evidence time 和 resolution fingerprint 构成成功证据。无链接时档案必须明确说明，不伪造远端定位信息。
- 本 Ticket 不继承任何真实登录、发布、付费、取消、订单核对或生产迁移授权。

## 3. 已完成基线与历史位置

- Wave 1–10.5、Dependency-Resolution Lane、M03、M04–M06 的阶段表、组合矩阵、旧 gate、commit/provenance 和 finding 只保留在 `archive/ARTICLE-LIFECYCLE-WAVE-EXECUTION-PLAN.pre-context-slim-20260818.md`、对应 handoff 和 Git。
- 已完成的 Post-Wave 投稿架构收尾与平台扩展性计划位于 `archive/`，不是当前入口。
- Wave 11.5 的调度例外只证明 Ticket 26 可以基于 Ticket 25 已验证的本地基线推进；Wave 12 的调度例外只证明图片准备可以基于 Ticket 26 本地 closure 推进。两者都不改变外部验收状态，也不携带授权。
- 历史非阻塞 finding、旧 HEAD、测试日志和已完成矩阵不得复制回本文；需要时按具名 handoff 或 Git 取证。

## 4. 调度与更新规则

1. 开始复杂任务前确认仓库根、当前分支、HEAD、工作树和 `docs/WORK-INDEX.md` 的唯一当前入口。
2. `document-ready`、文件存在或历史 `PARTIAL` 都不等于可调度；必须同时满足当前合同 gate、真实 Git 状态和用户授权边界。
3. 每次只读取和执行一个当前 Ticket/Maintenance；协议、规格和历史 evidence 只按直接引用展开。
4. 默认闭环为 Implementation → Primary Audit → blocking remediation → Bounded Re-audit → Closure；具体方式遵守 `EXECUTION-PROTOCOL.md` 和 `AUDIT-PROTOCOL.md`。
5. 状态只使用 `PENDING | READY | RUNNING | PARTIAL | BLOCKED | COMPLETE`；已移出当前调度的事项使用 `PENDING` 并在事实栏明确写明“已移出当前 Wave”，不得自动启动。
6. 本文只更新当前状态、下一动作和必要 gate。详细命令、测试输出、threadId、commit 链和 findings 写入对应 handoff。
7. 如果本文、合同、Git、源码或测试不一致，以 Git/当前可执行事实为基线，只调查并修正受影响入口；不得从 archive 恢复旧规则覆盖当前事实。
