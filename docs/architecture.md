# 架构与事实归属

## 模块边界

路径相对 [应用目录](../auto—publish)。

| 模块 | 拥有的事实与职责 |
| --- | --- |
| src/domain | 身份、DTO、发布目标、publisher contract、封闭运行时校验及安全错误 |
| src/content | 客户、资料、问题、知识库、生成批次、文章文件与快照 |
| OperationalStore 公共门面 | 投稿、发布、订单、恢复意图及事务；internal 不允许外部直接依赖 |
| desktop/services | 应用用例与跨 owner 编排；不复制底层持久状态机 |
| desktop/composition | 显式依赖与窄 port 装配 |
| IPC / preload / renderer bridge | 协议映射、运行时校验、最小白名单与类型安全 |
| Renderer feature / component | 用例协调 / 展示与收集意图；不拥有核心业务事实 |
| platform adapter | 远端协议、字段、结果映射；不拥有冻结、重试或人工 resolution |
| auth-server | 独立认证、会话、权益与最小审计库，不接收内容业务数据 |

主进程和 worker 保持 CommonJS；renderer 使用严格 TypeScript transport DTO。无需全仓迁移模块体系来维持这些边界。扩展只从既有 port 和 contribution 进入，见[扩展](extensions.md)。

## 内容文件与运行事实

用户可编辑内容、图片和模板保留文件形态，方便内容库迁移；运行协调事实进入内容库内 SQLite，使用事务与唯一 writer。外部调用不在数据库事务内：先落盘意图，再发送，再记录真实 observation。全局发布成功不阻止继续保存单个订单的真实后续变化。

ArticleStore 管理文章文件、CAS、同目录完整临时文件、fsync 与原子替换。保留路径/junction/普通文件边界及跨进程锁；没有全应用单实例保证，不能降级成进程内锁。新保存不需要多层 backup 日志；trash/restore 涉及两个文件仍保留恢复日志，purge 先持久化终态墓碑再向前清理。旧版本中断留下的日志和 staging 有实际恢复消费者，未确认退出条件前不能删。进程崩溃测试不等于断电或硬件故障保证。

批量回收只保存最小意图，单文件事实由 ArticleStore 负责；中断保留已完成部分，启动一次恢复或用户显式修复，不增加后台重试、租约和第二状态机。

## 生命周期与投影

文章内容、队列、付费订单和人工待办分开，是为了让费用确认、远端不确定性与内容编辑权限各有明确归属。生命周期 projection 从权威事实计算分类和权限，不能由 UI 写一个通用 articleStatus 替代。普通和付费 admission 共用排他/事务边界，不把整个 store 传给每个 service。

文章摘要不含正文；缓存可重建，绑定原文件版本，编辑、投稿和恢复仍锁内重读。发布摘要只用于展示，内部完整证据必须校验。页面不提供搜索或已发布正文读取，不表示可以删除历史原文和证据。

查询和命令分离。文章库、attention、投稿中心按客户读取版本复用缓存，同版本在途读取合并，返回值隔离；失败不缓存，stale 结果不回写。全局 revision 保留通知顺序；跨客户或身份无法确认的变更仍全局失效，不能从分页预览推断完整客户集合。页面只安装所需 feature；订单 mutation 由通知刷新，资源收藏没有该通知时保留 command-result 读取。

## 生成与安全边界

当前问题批次以问题 × 模板为工作单元，旧“客户 × 模板共享多回答”ADR 不再定义新问题批次。冻结、幂等与 uncertain 合同见[生成产品说明](product/knowledge.md)。runner 先投影小型事件再 clone，完整 brief 仍由 batch store 持久化；不通过延迟落盘改善性能。

配置、凭据、浏览器会话、日志/缓存与可迁移内容库隔离；AI 配置属于应用，不属于客户。密钥经 Electron safeStorage 保存，workspace .env 不提供 AI 凭据。鉴权服务器独立部署，不接收客户正文、Cookie 或内容库路径。

## 保留的验收资产

[acceptance 目录](../.scratch/article-lifecycle-and-submission/acceptance)内 JSON 为既有 benchmark 与验收合同，路径和内容不能因文档整理改变。其中 story matrix 的 source 指向[旧规格快照](../ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md)；该文件仅保留原始证据定位，当前行为以 docs/product 为准，旧标题筛选和生成规则不能作为新需求。变更该资产体系需独立修改消费者，本次没有这样做。

内容模板、默认成稿提示词、测试 fixture Markdown 同样属于程序资产，不是计划或说明文档。历史 evidence JSON 的文件名及 hash 记录是历史来源，不追改成当前结果。

文章分组的展示分页每页 50 篇，全选分组覆盖所有页；客户目录先枚举元数据，详情再读当前客户材料。文章快照按最近访问与字符串预算淘汰，超大快照可返回但不驻留缓存。当前具体容量常量以服务和测试为准，不把本机基准写成长久 SLA。
