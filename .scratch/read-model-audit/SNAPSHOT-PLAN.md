# 文章列表载荷与并发构建优化

状态：COMPLETE / bounded re-review PASS。用户“继续”授权推进上轮建议的字段裁剪与重复构建合并。

范围：article-management-snapshot 及直接 IPC/type/test 消费者。保留文章库产品简化后的行为，不恢复搜索、正文详情，不改分页、存储 schema、生命周期事实 owner 或授权。

实施：
- 列表只保留页面使用的操作决定，删除重复 safeMetadata、内部 queue/retarget 决策、canQueue 和无页面消费者的 targetFacts；核心生命周期 projection 不改。
- 发布摘要继续验证完整终态身份，但列表不返回 terminalTargetV1。
- 同客户、同文章读取版本共享正在构建的快照，每个调用方获得独立副本；失败清理、版本切换、显式失效和迟到完成均有回归。

验证：先跑定向快照/生命周期/IPC；真实存储成本基准比较载荷；浏览器文章库/发布详情/投稿操作；类型、构建、lint、IPC、完整桌面门禁。Primary Review → 修复直接问题 → Bounded Re-review → Closure。未授权提交、推送或真实外部操作。

## 实现及有界复审

- snapshot 在原生命周期 projection 后按展示字段组装，保留5个操作的 allowed/reasonCodes；不改变核心授权对象。删除内部 safeMetadata、queue/retarget、canQueue、targetFacts。发布终态身份仍验证，只不返回 terminalTargetV1。IPC/type 合同同步收窄。
- 同客户、同文章读取版本复用 in-flight Promise，完成后仍只缓存一份序列化结果；每个消费者 JSON.parse 独立副本。失败 finally 清理；generation 阻止显式失效前的旧构建回写；版本变化最多重读一次。无关 source-only revision 不重建，但返回当前公共 revision。
- Primary Review / Bounded Re-review 验证：同版本6请求1读取；跨客户隔离；失败后重试；返回值隔离；source-only版本；显式失效/版本变更；旧任务先完成和新任务先完成；持续变更的有界退出。终态身份不匹配继续拒绝；原事实 metadata 和授权不变。
- 完整回归发现3项旧测试仍要求已从列表移除的 canQueue，保留 canSubmit 和实际入队/冻结/移除行为断言，并验证 canQueue 不再返回。修改仅限两个测试文件，复跑27/27通过，没有新生产修改。

## 测量

同既有真实 ArticleStore + SQLite 基准，1000篇/客户、每篇4096字节。数值为合成数据，非跨机器 SLA。

| 客户 | 上轮快照字节 | 本轮快照字节 | 本轮首次/刷新中位ms |
| --- | --- | --- | --- |
| 无历史 | 2,596,291 | 935,291 | 990 / 220 |
| 失败历史 | 3,879,028 | 1,451,781 | 1062 / 307 |
| 已发布 | 6,053,882 | 3,052,189 | 1455 / 459 |

已发布载荷减少49.6%。这是应用服务完整快照的字节数，不能冒充准确的 Electron IPC 字节计数；IPC 同样移除了相关字段。首次仍枚举摘要、读取生命周期证据，没有承诺磁盘/SQL提速。本轮首读时间有波动，主要收益是载荷和重复构建减少。

## 最终验证

- 定向快照/摘要/生命周期/typed IPC 59/59（snapshot-targeted-final.log）；随后增加的新旧完成顺序测试在完整回归通过。
- 浏览器文章库、发布详情、布局、待办36/36（snapshot-ui.log）。
- 真实存储基准2/2（snapshot-cost.log），100/1000篇各三种客户状态。
- `npm run test:desktop-core -- --exclude tests/article-management-snapshot-storage-cost.test.js`：1768项，1765通过，3项上述旧字段断言失败，0 skip/cancel/todo，退出码1。容量文件已单独完整运行，不重复跑耗时基准。
- 修改两个旧测试后 `node --test tests/article-lifecycle-acceptance.test.js tests/phase-07-regular-queue.test.js`：27/27，退出码0（snapshot-bounded-final.log）。没有再次声称整轮全量全绿；其余源码/测试哈希与完整运行一致。
- lint、main/bridge typecheck、renderer build（含renderer typecheck）、preload build、format check通过；production IPC matrix 6/6。renderer保留已有bundle体积警告。未新增schema，不重跑迁移；未生成安装包或运行真实账户。
- 最终 diff --check 通过；snapshot-source-state.json含26份累计工作树源码/测试，SHA-256集合 cff86d8b52ff42e4467ac4cfe37355b5ba8a50703118a9a299860a74ab1a0d0b。基线828ab1eff9bb137bbeed698d2bb0bb379f27e29f，包含上轮尚未提交的产品简化修改。本轮未commit/push，远端CI未触发。

仍保留：查询端分页、单文件异步IO未做；首次缺少摘要的原文验证、未知身份枚举和生命周期完整证据校验不变。达到本轮两个目标后停止扩展。
