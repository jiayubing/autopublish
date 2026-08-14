# 26-I — Integration、审计与 closure

## 目标

只对 Ticket 26 最终组合执行 integration、迁移/并发/性能验收、Primary Audit、blocking remediation、bounded re-audit 和最终 clean-HEAD gate。不得成为新的功能实现包。

## 最小必读

1. 根 `AGENTS.md` 全文。
2. 根 `CONTEXT.md` 相关全部投稿词汇。
3. 根 SPEC 全文（本包是唯一需要完整读取 SPEC 的工作包）。
4. Wave Plan 全部当前状态与 Wave 11.5 gate。
5. `EXECUTION-PROTOCOL.md` §§5–7；`AUDIT-PROTOCOL.md` 全文。
6. umbrella、本合同、26-A–H 的最终 handoff 与 commit/evidence；不读取更早历史 handoff，除非某 handoff 明确引用为 unresolved evidence。
7. 当前 CI/package scripts、Ticket 26 acceptance tests、直接 architecture/performance gates。

不要重新通读 Ticket 01–25、archive 或所有源码；审计从 26 diff、公开合同、受影响 owner 和调用方开始。

## 实施边界

- 先做 combined Primary Audit，finding 分类遵守 Audit Protocol。
- 只修复 blocking findings；修复后做 bounded re-audit，不重开 fresh full review。
- 非阻塞 P2/P3 登记未来 owner，不扩大 Ticket 26。
- 若 finding 暴露 A–H 某 owner 的结构性问题，最小修复仍归该 owner；I 不新增万能协调层。
- 最终测试必须在所有修复后的 clean integration HEAD 运行。

## 验收条件

- SPEC §11 的 15 项矩阵全部有公开行为 evidence。
- 生成零投稿事实；普通/付费确认是唯一新目标入口。
- 付费 staging 生产 surface/schema writer absence，migration crash-safe。
- 普通移出、付费取消剩余项、文章删除边界互不混淆。
- 不确定结果无直接 retry；首次成功永久只读。
- 订单/发布证据不可删除。
- Renderer 新信息架构及旧入口 absence。
- owner/capability/dependency direction 无第二 writer、无完整 store 泄漏、无新增浅层业务 wrapper 链。
- 批量 query/scan 性能预算通过。
- Primary Audit blocking findings 全部关闭，bounded re-audit PASS。
- 完整 required gate 在最终 clean HEAD PASS，evidence 绑定该 HEAD。

## 最低验证

- Ticket 26 全部定向 acceptance/state matrix。
- migration/restart/fault/concurrency/idempotency suites。
- Renderer typecheck/build/responsive/interaction suites。
- architecture/absence/performance gates。
- package/smoke gate（不执行真实登录/发布/付费）。
- 最终 `git status --short` 干净，生成物不纳入提交。

## 停止条件

- 需要真实登录、发布、付费、取消或生产数据迁移授权；
- SPEC 与真实供应商合同发生实质冲突；
- 修复需要新的产品决策或不可逆删除真实订单/证据；
- 最终环境/工具硬阻塞且已穷尽安全替代。

普通测试失败、blocking finding 和局部回归必须在本包内闭环，不构成停止理由。

## 完成交接

写最终 closure handoff：final HEAD、commit chain、状态矩阵、audit/findings、bounded re-audit、完整命令、未执行外部验收及原因、剩余风险、Wave Plan 状态。完成目标后停止，不进入图片 Wave。
