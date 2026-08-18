# AI 任务阅读入口

本文只负责把任务路由到最小阅读集合，不拥有产品语义、执行状态或历史证据。

## 默认顺序

1. `AGENTS.md` 会作为项目规则生效；需要时确认与当前目录相关的局部规则。
2. 阅读本文件和 `WORK-INDEX.md`，判断任务类型以及是否已有当前计划。
3. 小型、明确、局部的修改：直接阅读相关源码、测试和必要的合同，不创建或读取大型计划。
4. 复杂任务：只选择一个当前 ExecPlan；先完成该计划规定的最小阅读集，再开始调查或修改。
5. 只有当前计划明确引用、发生真源冲突或正在执行审计时，才读取 Protocol、ADR、handoff 或历史 evidence。

## 任务路由

| 任务类型 | 首选阅读 | 默认不读 |
| --- | --- | --- |
| 文章生命周期、文章库、投稿中心 | `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` 的直接相关小节、Wave Plan §1/当前阶段行、当前 issue/maintenance 合同 | SPEC/Wave Plan 全文、无关 Wave 的 handoff、archive、平台历史计划 |
| Renderer 导航或页面职责 | `docs/WORK-INDEX.md` 指定的当前计划；若无计划则读相关 `App.tsx`、页面/feature、直接测试 | `.scratch/archive/` 中已完成的 Renderer 计划、文章 store、历史 Wave 全文 |
| 普通平台、平台 capability、图片交付 | `docs/ADDING-BUILTIN-PUBLISHING-PLATFORM.md`、对应 definition/adapter 合同和测试 | 已完成的 Post-Wave 计划、付费订单计划、无关平台 handoff |
| 投稿架构只读模型或 facade 收敛 | `ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md` §9、直接 owner、调用方和测试 | 已完成的 Post-Wave 计划、Ticket 完整历史流水账 |
| Electron 桌面应用局部任务 | `auto—publish/AGENTS.md`、`auto—publish/README.md` 的入口和相关命令、相关源码和测试 | auth-server、历史 Wave、运行期 workspace/log/release 目录 |
| auth-server | `auto—publish/auth-server/AGENTS.md`、`auto—publish/auth-server/README.md` 的入口和直接相关小节、相关 migration/测试 | 文章生命周期、投稿 Wave、桌面 Renderer 和客户内容文档 |
| 小型 bug、局部测试或类型修复 | 相关源码、直接调用方和回归测试 | 所有计划、所有 handoff、整个 `.scratch/` |

## 上下文边界

- 不要 glob、批量读取或总结整个 `.scratch/`。
- 计划的 `COMPLETE` 状态表示该计划是历史证据；除非 `WORK-INDEX.md` 或用户当前请求再次指定，不要把它当作当前执行入口。
- `handoffs/` 用于取证，不是默认工作说明；`archive/` 默认不读。
- `.scratch/article-lifecycle-and-submission/archive/` 中的 `PAID-MEDIA-STAGING-QUEUE-FINAL-EXECUTION-PLAN.md` 和 `PAID-SUBMISSION-ACCEPTANCE-REMEDIATION-R1-R4.md` 是旧 paid staging 路线的历史材料，不得作为当前产品行为或调度依据。
- 当前计划如果与源码、测试、schema、Git 或产品规格冲突，停止继续扩展阅读，按 `AGENTS.md` 的真源顺序调查冲突。

## 完成后的写回

复杂任务结束时，只更新对应计划的 Progress、Discoveries、Decision Log、验证结果和剩余风险；工作索引只更新链接或“当前入口”指向，不复制长篇执行日志。
