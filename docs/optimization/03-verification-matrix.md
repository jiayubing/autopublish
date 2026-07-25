# 优化验证矩阵

> 基线：`master@e8d817847bab3a9e6020006cab35340f645e527f`。  
> 原审查不存在 `REVIEW-XXX`；矩阵保留原 `F-*`，并通过 `F-* ↔ OPT-*` 双向追踪。

## 1. 通用验证门禁

所有“可实施”项至少通过：

- `npm test`（修正后必须收集 `.js` 与 `.mjs`）。
- `npm run test:auth`（涉及 auth 或全批门禁时）。
- `npm run lint`。
- `npm run typecheck:renderer`。
- `npm run typecheck:bridge`。
- `npm run build:renderer`。
- `npm run test:links`（涉及路径、临时文件、迁移或打包时）。
- 变更所属 module 的最小测试，以及其上游 caller、下游 store/adapter 和失败路径集成测试。

下表的“—”表示该测试类型对该项不适用，不得用“—”替代适用的故障验证。真实投稿、扣费、生产账号、签名和破坏性恢复必须由人工在隔离环境执行。

## 2. OPT 验证矩阵

| OPT | 关联发现 | 单元测试 | 集成/端到端测试 | 安全、并发、迁移与压力 | 静态/手工/回归范围 | 可观察验收标准 | 回滚验证 |
|---|---|---|---|---|---|---|---|
| OPT-001 | F-H15、F-M01、F-M20、F-M21 | test discovery、production seam、workflow cwd/audit契约 | `.mjs`与seam/workflow契约进入同一默认命令 | production audit、link security；Node22 auth/Node24 desktop矩阵 | 检查根workflow/cwd；全默认套件、lint/typecheck/build/packaging | canonical本地门禁全绿、静态workflow契约通过、收集清单含`.mjs`；本机file symlink不具备时明确BLOCKED；remote/PR/push/required checks为`NOT_APPLICABLE` | 回退配置后本地命令仍可运行；重新应用时结果一致 |
| OPT-002 | F-H04 | lock record、owner token、lease、旧锁、损坏锁 | 两进程争锁；强杀writer后恢复 | 并发/时钟回拨/PID复用；旧锁惰性兼容 | publication全回归；路径/symlink静态检查 | 活writer不被回收；过期遗锁可恢复；只影响对应聚合 | 关闭自动回收后新旧锁仍可读，记录不丢 |
| OPT-003 | F-H05、F-H07 | recovery state transition、DTO脱敏、attention policy | 远端前/后、ledger写前/后、archive前强杀并重启 | 并发attempt；intent schema兼容；磁盘满/rename故障 | publication/submission/worker/attention全回归；人工检查状态表 | 每个故障点只产生安全终态或明确需核对；unknown不可重试；known outcome未落账不归档 | 关闭自动转换后intent仍可列出并人工核对 |
| OPT-004 | F-H06；关联F-H05 | immutable run context、phase、message runId | fake child双run、旧消息、stop/pause/watchdog；短真实child强杀 | 并发/压力：快速stop-start 100次；cleanup恰好一次 | renderer task store/controller、worker、Hepan interval回归 | remote-started后的第二start拒绝；旧child不改新snapshot；terminal前不清busy | 回退执行文件后新recovery记录仍可读，暂停新任务 |
| OPT-005 | F-H09 | Python stage/error矩阵；Node outcome mapping | fake HTTP接收POST后断连/超时；ledger+attention | 安全：错误不含Cookie/正文；并发retry拒绝 | Hepan contract、publication状态回归；禁止真实投稿 | POST后模糊异常为uncertain、有核对动作、新reserve拒绝；前置失败仍failed | 回退adapter时保留uncertain，不降为failed |
| OPT-006 | F-H08、F-M16 | 头条同一row/详情证据；列举response/详情证据 | 脱敏DOM fixture E2E；批准测试账号受控成功/失败 | 安全：fixture脱敏；压力：页面延迟/同名多行 | adapter/worker/archive回归；人工核对remote ID/URL | 跨行标题+状态、无关success均不能published；真实成功有文章级证据 | 关闭自动published，统一退uncertain，不恢复弱谓词 |
| OPT-007 | F-H10 | resolver候选、普通文件/symlink拒绝 | `electron-builder --dir`后从`app.asar.unpacked`执行Python self-test | 路径安全；alpha/production布局矩阵 | production YAML、runtime manifest、Windows手工smoke | 最终制品脚本存在且self-test退出0；`app.asar/...py`伪路径明确失败 | 回退制品并禁用production Hepan；开发数据不变 |
| OPT-008 | F-H11 | URL协议、HTTP显式确认、client二次校验、redirect manual | HTTP未确认/已确认与HTTPS fake endpoint；3xx不跟随；环境变量覆盖 | 未确认时fetch为0；redirect目标收到0 body；旧配置迁移；人工记录明文残余风险 | 设置UI/配置/媒体client全回归；未来HTTPS迁移检查 | 默认无endpoint；HTTP未确认时body发送前拒绝；确认后持续显示“不加密连接”；HTTPS无需确认；无固定地址豁免；3xx不转发multipart | 清除配置或关闭媒体；验证不会恢复隐式HTTP、自动redirect或绕过确认 |
| OPT-009 | F-H12 | orderNid解析、outcome remoteId、projection幂等 | API返回ID+JSONL ENOSPC；重启从ledger重建 | 磁盘满/权限/重复恢复；旧submitted兼容 | media order/workbench/publication/attention回归 | JSONL失败后仍可查询远端ID、显示需修复、不可重复投稿；恢复只一条projection | 停用projection builder，ledger remoteId保持可读 |
| OPT-010 | F-H13、F-H14 | verifier存在/普通文件/read-only/schema/count | 合法备份、截断/损坏/空/缺失目标；隔离restore启动 | 安全：备份权限/输出脱敏；WAL/磁盘满；v1样本只读 | auth全套、CLI退出码；人工RPO/RTO演练 | 缺失路径执行后仍不存在且非零；坏destination不报成功；合法目标可隔离启动 | 验证失败不删除备份；旧源库不被改写 |
| OPT-011 | F-H03、F-M18 | screenshot裁剪/无图、artifact命名/owner/年龄 | 强杀Cookie/payload child并重启；真实fixture图像检查 | 安全像素/字符串扫描、ACL、越界/ symlink；残留量压力 | Doubao/Hepan/storage maintenance回归；人工检查目录 | 输出不含账号/问题/答案敏感像素；只清合法过期工件；日志无秘密 | 退为仅结构摘要；关闭自动清理但不恢复原始截图 |
| OPT-012 | F-M12 | fingerprint、TTL、一次性token | prepare→restore→retrash→旧token；双窗口 | TOCTOU/并发/fake clock；旧token兼容 | trash/store/IPC/renderer删除回归 | 旧token返回stale/expired且新正文仍在；同版本只成功一次 | 新token schema保留，必要时只调TTL |
| OPT-013 | F-M13 | revision/CAS/locked mutate/schema v1读取 | 两store/两进程更新不同item与localArchive；同item冲突 | 100轮并发、崩溃遗锁、schema惰性迁移、batch容量 | submission/action/worker/attention全回归 | 独立更新全保留；不兼容冲突明确；重启可读且无半写 | 停止writer；兼容reader导出，验证旧文件备份可恢复 |
| OPT-014 | F-M14 | typed target DTO、policy路由、resource重验 | media failed→attention→同resource新attempt E2E | 并发重复点击、价格变化、资源下架、uncertain拒绝 | submission/media/attention安全DTO回归 | 重试仍为`media-resource:R`且新attempt属同aggregate；缺R不可重试；无untracked pair | 关闭media retry，保留查看/人工核对 |
| OPT-015 | F-H01、F-M03 | request identity begin/invalidate/dispose | deferred Promise：A→B客户切换、initial→refresh交错、unmount | 客户隔离安全；高频invalidation压力 | renderer content/media lifecycle与bridge回归 | B state绝不出现A响应；旧initial不覆盖新refresh；无unhandled rejection | 按view回退但保留client/request guard |
| OPT-016 | F-H02 | draft初始化/dirty diff | service→scan→editor→close→store roundtrip；保存失败 | — | ArticleEditor/App/media draft回归；手工打开关闭 | remark/ignoreImages打开直接关闭后不变；失败时不关闭且有错误 | 保留真实字段初始化，暂时总是保存当前值 |
| OPT-017 | F-M09 | logical ID resolver、重复ID、路径错误 | 目录名≠ID经IPC列/建/改/采集问题 | symlink/越界/损坏metadata；大量客户缓存 | client/material/question/Doubao全回归 | 合法logical ID全链可用；重复ID明确冲突；路径保护不退化 | 停止问题写入，目录不改名，恢复旧reader |
| OPT-018 | F-M11 | retry policy、fake clock、max attempts、dispose | 多次transient后成功；重启/人工retry；needs_repair | 并发wake、同事务单执行；长时间timer压力 | removal/trash/attention/workspace lifecycle回归 | 无重启自动恢复；超上限转可见repair；dispose后无I/O | 关闭scheduler，显式retry与journal仍可用 |
| OPT-019 | F-M15 | unique finder 0/1/many、损坏文章 | 真实ArticleStore duplicate task→handoff conflict | 50/500任务性能；可重建索引（若有） | article/generation/handoff/submission回归 | duplicate时不入队且conflict可见；唯一正常；查询非O(tasks×articles) | 禁用handoff，保留文章；不恢复fallback |
| OPT-020 | F-M07 | total/short-page/repeat fingerprint/ID去重/上限 | 远端忽略page、重复页、正常分页；renderer翻页搜索 | 1k/10k资源内存/IPC/请求压力；旧cache兼容 | media resource/App/ResourceLibrary回归；人工性能测量 | 重复页快速停止并报告；无重复ID；单IPC不超pageSize | 保留服务上限/去重，renderer可临时退简单分页 |
| OPT-021 | F-M05 | command prepare/execute错误映射 | prepare reject、client切换、重复点击 | destructive UI安全；未处理Promise检测 | GeneratedArticlesView/controller/trash回归 | reject有alert、无确认、无unhandled rejection、busy收敛 | 回退重构但保留外层try/catch |
| OPT-022 | F-M06 | 独立command token/operation owner | pending submit→pause→resolve/reject；stop与terminal refresh | 交错100轮；dispose/stale response | `.mjs` controller、PlatformWorkbench、task store回归 | busy最终与真实snapshot一致，无需重挂载；stale不覆盖新结果 | 保留独立finalize最小修正 |
| OPT-023 | F-M08 | success/failure/finally | renderer点击自检成功/失败/卸载 | — | Settings/runtime diagnostics回归 | 两种结果后按钮恢复；成功刷新诊断，失败显示alert | 单文件回退但保留finally |
| OPT-024 | F-M04 | confirmation queue/context | 各destructive入口、focus return、Tab/Escape、cancel/confirm | 可访问性/误操作安全；并发确认 | 静态搜索无native confirm；Electron手工焦点测试 | 无业务native confirm；取消零命令，确认恰好一次，焦点恢复 | 移除入口或保留受控modal，不恢复native confirm |
| OPT-025 | F-M10 | createdAt comparator/tie-breaker/legacy fallback | 编辑/审核旧文后重新list；renderer分组 | 大列表排序基准；无迁移 | ArticleStore/history回归；手工顺序核对 | 编辑/审核不重排；重复调用顺序稳定 | 提供独立“最近更新”视图，不改回默认规则 |
| OPT-026 | F-M19 | TTL/LRU、source/login桶、fake clock | auth login并发与proxy source | 100k loginName压力、heap/GC、NAT误限；无迁移 | auth 16项+新增压力；手工Cloudflare来源核对 | key数硬上限、heap稳定；窗口后恢复；攻击来源受限 | 调高阈值/关闭附加桶，不恢复无界Map |
| OPT-027 | F-L01 | 文案/行为测试 | 清除/筛选后刷新 | 审计保留检查 | OrdersView/App回归；手工语义审查 | UI不声称持久删除；刷新行为与文案一致 | 移除操作，不恢复误导标签 |
| OPT-028 | F-M02 | 决策后：typed event或无sender | 决策后：事件E2E/删除静态检查 | 若事件：脱敏、高频背压、安全DTO | 当前仅确认文件日志可用；不阻塞回归 | 暂缓期无新增interface；实施时必须有明确用户价值与脱敏结果 | 文件日志始终保留 |
| OPT-029 | F-M17 | account fingerprint/target mapping（决策后） | 换号阻断；多账号E2E；旧队列兼容 | target schema迁移/dry-run/rollback；账号DTO脱敏 | adapter/profile/publication/submission全回归；人工账号测试 | 换号后旧队列明确阻断；记录可证明目标账号；不同账号不合并 | 停止新write，双读旧/新target映射并保留记录 |

## 3. Finding 覆盖反查

- 37 个原始 `F-*` 均在本矩阵至少出现一次。
- 合并 finding F-M01/F-M20/F-M21 统一由 OPT-001 验证，但仍在 disposition 中保留原 ID。
- 调整 finding F-H08/F-M16 的代码机制用 fixture 验证，真实影响必须由 OPT-006 的外部证据补齐。
- 待确认 F-M17 只有在 OPT-029 决策后才能确定迁移与E2E验收。
- 暂缓 F-M02 不作为其他可靠性项的验收依赖；OPT-003 必须通过 durable attention 验收，不能以实时日志替代。

## 4. 批次级回归范围

| 批次 | 必须回归 |
|---|---|
| 0 | 全仓默认测试、auth、lint、两类typecheck、renderer build、links、packaging、静态workflow契约与本地里程碑commit；真实CI触发为`NOT_APPLICABLE` |
| 1 | production制品、auth备份/restore、Doubao/Hepan安全工件、article trash/永久删除 |
| 2 | publication、submission、worker、attention、archive、batch、renderer task snapshot |
| 3 | Hepan/Toutiao/Lieju adapters、media order/resource target、ledger/recovery、attention |
| 4 | client/question/Doubao、ArticleStore、generation handoff、removal/trash/attention |
| 5 | renderer content/media/platform、bridge、workspace invalidation、请求竞态与容量 |
| 6 | settings/confirmation/history/orders、auth压力；若实施账号模型则全publication迁移 |

## 5. 回滚验证通则

- 回滚前停止新投稿/生成/删除任务并记录当前 runId、publicationId、attemptId、batch revision。
- 兼容reader必须先证明可读取新schema；不能用旧writer直接覆盖新schema。
- 回滚后重新跑对应批次测试，并验证 unknown/uncertain、recovery intent、订单remoteId和备份文件仍存在。
- 安全项回滚测试必须证明不会恢复隐式HTTP或绕过显式确认，也不会保存原始截图或宽匹配删除临时文件。
- 任何回滚若需要真实删除、数据库覆盖、账号变更或外部投稿，必须停止并取得人工授权。
