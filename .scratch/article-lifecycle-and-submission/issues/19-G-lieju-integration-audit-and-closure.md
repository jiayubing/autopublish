# 19-G — 列举网 HTTP 图文 Integration、审计与 Closure

**Goal:** 只对 19-A–F 最终组合执行一次 combined Primary Audit、blocking remediation、bounded re-audit 和最终 clean-HEAD gate，准备需用户另行授权的独立 HTTP 真实验收。

**Blocked by:** 19-F `COMPLETE`。

## 最小必读

1. Issue 19 umbrella、19-0–F 最终 handoff / commit / evidence。
2. `AUDIT-PROTOCOL.md` 全文；`EXECUTION-PROTOCOL.md` 的测试、commit / provenance 与阶段推进规则。
3. 19-0 owner map、最终 diff、直接消费方、CI/package gate 和列举网定向测试。

## 本包职责

1. 从包含 19-A–F 的 clean integration HEAD 开始，不重审已完成的 Ticket 17/18/08/09。
2. combined audit 只覆盖：charset/form/city，state 单 writer，平台 body evidence，image multipart，单次 POST/outcome，Playwright 提交前 fallback，打包能力。
3. 修复 P0/P1 和直接违反 umbrella acceptance 的 blocking P2；修复后只做 bounded re-audit。
4. 运行最终状态 / 故障矩阵和 packaging smoke；静态确认无第二城市 / body / state / outcome owner。
5. 生成 `handoffs/19-G-lieju-http-integration-closure.md`，记录 final HEAD、provenance、测试、audit、未执行的真实 POST 及授权清单。

## 禁止跨界

- 不开启 fresh full-repo review，不实施今日头条 / 蓝色河畔，不修改 Ticket 18 随机选图。
- 不执行真实登录、图片上传或发布，除非用户对本次验收单独明确授权。
- 不因审计 finding 新增 manager / coordinator / compatibility layer。

## Acceptance criteria / 最低验证

- [ ] GBK/UTF-8、城市、form、body Markdown matrix、0–5 图、N>M、Session/state concurrency、HTTP/Playwright 选择、提交边界前后 fault 全部通过。
- [ ] 有效 state 下默认正常准备不启动 Chromium；HTTP POST 调用最多一次，不确定结果没有 fallback submit。
- [ ] 文章库原文不变，evidence 绑定实际平台 body 和实际成功图片；日志 / 持久化无敏感数据。
- [ ] 纯文本 Ticket 08/09 直接回归、runtime/package smoke 和 architecture gates 通过。
- [ ] Primary Audit blocking findings 关闭，bounded re-audit PASS，最终证据绑定 clean HEAD。
- [ ] 未授权真实 HTTP POST 时，明确保持 `USER_EXTERNAL_IMAGE_ACCEPTANCE_REQUIRED`，不伪写真实验收已完成。

## 停止条件

需要真实外部操作授权、供应商当前合同与冻结证据实质冲突，或 remediation 必须改变公开 schema / 副作边界时才返回主任务；普通测试失败和 blocking finding 在本包内闭环。
