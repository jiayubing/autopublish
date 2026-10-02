# 剩余工作

本页只登记当前未闭合事项。状态依据本地源码、测试与最近证据核对；本地实现完成不等于真实外部验收完成。历史授权不随文档迁移而生效。

| 事项 / owner | 当前剩余工作与阻塞 | 下一步与完成判据 |
| --- | --- | --- |
| 知识质量 / knowledge service | 本地正文、候选、快照链路已落地；真实模型、搜索、引用、Coding Plan 权限与成本未验 | 按[质量计划](plans/knowledge-quality.md)取得样例、接口和额度授权后逐项记录；不以 mock 代替质量 |
| 内容生产 CP-5 / generation service | 明确延期；原集成链含已退役客户确认投影，不能照抄旧清单 | [CP-5 剩余范围](plans/content-production-closeout.md)；用户重新选择推进时按现行正文/问题/brief 边界核对，非所有功能的默认发布门槛 |
| 规模与可靠性 / query 和 runtime owners | 普通队列分页、执行/启动身份读取、客户缓存失效和页面消费已有本地修复；剩余上限/真实规模/历史证据对账尚未全闭合 | [规模剩余范围](plans/scale-and-reliability.md)，先复现当前痛点再改，不重复实施旧索引中的已完成项 |
| 外部投稿 / platform 与 paid owners | Ticket 19 multipart、Ticket 26 真实链路及最终候选签名升级未完成；Ticket 25 历史收尾状态需按新链路核对 | [外部及候选验收](plans/external-acceptance.md)，逐项授权并绑定候选，不恢复旧 UI gate |
| 鉴权部署 / auth-server | 真实代理/TLS 拓扑与备份恢复环境未验 | 依[人工验收说明](../auto—publish/auth-server/docs/proxy-source-manual-acceptance.md)执行批准的独立验收 |

## 文档整理暴露的脚本限制

证据脚本 owner：release-evidence-inputs 的 currentSourceState 使用 execFileSync 读取完整 git diff，未设大 diff 缓冲。此次约 4 MB 的文档删除 diff 复现 ENOBUFS，导致 content-library-migration 的 CLI dry-run 测试报告 MIGRATION_FAILED；其余资产定向测试通过。这不是 Markdown 资产丢失，全部程序资产和代码 hash 保持不变。后续单独修证据读取的容量与安全失败行为，并补大 diff 回归；本次按只改文档范围保留该失败，未修改脚本或为测试暂存/提交文件。

## 状态冲突的处理

CLIENT-GENERATION-TASKS 旧计划的 IN_PROGRESS/空勾选已落后：当前客户任务 service、共享 AI scheduler、IPC 与页面存在，最近审计补齐了持久化和重启恢复，上一轮桌面回归已覆盖。无需继续旧 npm run ci 或创建旧 PR 任务。客户生成和问题批次是现存不同用例，不能因旧“所有新任务均问题化”措辞删除存量资料生成路径。实现依据为 client-generation-task-service/store、client-generation-tasks 测试和现行知识产品说明。

文章标题筛选冲突已消解：用户确认移除搜索的产品简化记录、当前 GeneratedArticlesView 筛选及浏览器回归一致；文章库无标题关键词/全文搜索，保留状态、批次、日期筛选和模板分组。旧 SPEC 的 3.2 不是新的功能要求。

上一轮未提交的[审计记录](AUDIT-REMEDIATION-2026-10-02.md)及[规模修复证据](../.scratch/scale-audit/REMEDIATION.md)仍保留供本地 diff 检查，不是第二份调度入口；其阶段计数/旧待办仅代表当时状态。它们提交归档到 Git 后可移出工作树，不覆盖或删除尚未提交的证据。
