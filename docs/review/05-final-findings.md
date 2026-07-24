# 最终审查发现与修复优先级

> 基线：`master@e8d817847bab3a9e6020006cab35340f645e527f`。日期：2026-07-24。本文只合并和排序已验证发现，不修改业务代码，不代表真实外部系统、正式安装包或灾备恢复已经现场验收。

## 1. 最终结论

31 个模块均已完成代码深审。模块报告共记录 41 条候选（高 16、中 24、低 1）；合并四组同根重复后，最终为 **37 条 finding：高 15、中 21、低 1**。

当前不建议直接批准正式发布。首要阻断不是一般代码风格，而是以下五类可达风险：

1. 远端投稿成功/未知事实可能被错误确认、错误重试或永久卡在 `submitting`。
2. publication、submission batch、archive、media order 缺少统一的崩溃恢复证据协议。
3. 默认媒体地址用明文 HTTP，诊断/临时文件可能泄露 Cookie、API key、稿件或页面内容。
4. 正式 ASAR 的河畔 Python 路径不可执行，Git 根 CI 又不可发现。
5. auth 备份/恢复检查会给出“已验证”的假阳性。

## 2. 去重后的高风险 findings（15）

| 最终 ID | 来源候选 | 结论 | 发布影响 |
|---|---|---|---|
| F-H01 | TEMP-M07-1 | 单篇生成响应未绑定当前客户，可把旧客户文章注入新客户 UI | 客户数据边界错误 |
| F-H02 | TEMP-M09-1 | 打开媒体稿件会把已保存备注/忽略图片标记重置并写回 | 用户数据静默丢失 |
| F-H03 | TEMP-M16-1 | “脱敏截图”实际保存未遮罩页面 | 敏感页面内容落盘 |
| F-H04 | TEMP-M22-01 | publication 崩溃锁没有租约或回收 | 单目标永久阻断 |
| F-H05 | TEMP-M24-02 + TEMP-M23-02 | worker 被 watchdog/停止中断后 ledger 永久 `submitting`，且 attention 不可见 | 远端未知事实无法恢复 |
| F-H06 | TEMP-M24-01 | stop 过早清 busy，允许第二 run；旧 worker 消息可污染新 run | 重复/错归投稿结果 |
| F-H07 | TEMP-M24-03 | 已知远端 outcome 落账失败后仍可归档，只把错误放在一次性 DTO | ledger/batch/archive 分叉 |
| F-H08 | TEMP-M25-01 | 头条可把不同列表行的标题和状态拼成成功证据 | 错误标记已发布 |
| F-H09 | TEMP-M26-01 | 河畔 POST 后 transport exception 被记为可重试 failed | 盲重试、重复发布 |
| F-H10 | TEMP-M26-02 | 正式 ASAR 解析到归档内 Python 伪路径 | 河畔正式包不可用 |
| F-H11 | TEMP-M27-01 | 默认公网 HTTP 发送媒体 API key 和完整稿件 | 凭据/内容可窃听篡改 |
| F-H12 | TEMP-M27-02 | 远端已接单后订单落盘失败会丢失 order ID 关联 | 付费订单不可审计/同步 |
| F-H13 | TEMP-M29-01 | backup 完成后校验源库而不是备份目标 | 坏备份被报告成功 |
| F-H14 | TEMP-M29-02 | restore-check 对不存在路径创建空库并通过 | 空库被误认为可恢复备份 |
| F-H15 | TEMP-M30-01 | workflow 位于非 Git 根，GitHub 默认不执行 | 无自动发布门禁 |

## 3. 去重后的中风险 findings（21）

| 最终 ID | 来源候选 | 结论 |
|---|---|---|
| F-M01 | TEMP-M04-1 | 架构测试维护非生产 workspace runtime/invalidation seam |
| F-M02 | TEMP-M05-1 | `publish-log` 有发送端但没有 preload/renderer consumer |
| F-M03 | TEMP-M06-1 | 初始媒体加载可覆盖 invalidation 刷新的新快照 |
| F-M04 | TEMP-M07-2 + TEMP-M08-2 | 内容/平台入口绕过统一确认宿主，直接调用原生 confirm |
| F-M05 | TEMP-M07-3 | 永久删除预检异常越过 UI catch |
| F-M06 | TEMP-M08-1 | 暂停命令可使提交请求永久保持 busy |
| F-M07 | TEMP-M09-2 + TEMP-M27-03 | 资源分页不去重/只等空页，renderer 再一次加载 99999 条 |
| F-M08 | TEMP-M10-1 | 浏览器自检成功后 checking 状态不收敛 |
| F-M09 | TEMP-M14-1 | 问题存储把逻辑客户 ID 当物理目录名 |
| F-M10 | TEMP-M18-1 | 历史按 updatedAt 而非 createdAt 排序 |
| F-M11 | TEMP-M19-1 | `pending_auto_recovery` 仅启动时恢复一次，没有 bounded backoff |
| F-M12 | TEMP-M19-2 | 永久删除 token 不绑定 tombstone 版本/TTL |
| F-M13 | TEMP-M20-01 | submission batch 无锁整文件 read-modify-write，可跨进程丢更新 |
| F-M14 | TEMP-M20-02 + TEMP-M23-01 | 媒体失败重试 DTO 丢失 mediaResourceId，无法绑定原目标 |
| F-M15 | TEMP-M21-1 | ArticleStore 不支持按 generationTaskId 唯一查找 |
| F-M16 | TEMP-M25-02 | 列举把页面任意通用 success 文案当作本次投稿成功 |
| F-M17 | TEMP-M25-03 | 浏览器 profile/publication target 未绑定账号身份 |
| F-M18 | TEMP-M26-03 | 强杀/cleanup failure 后明文 Cookie/payload 可残留 |
| F-M19 | TEMP-M28-01 | 登录限速 Map 可由不同 loginName 造成无界增长 |
| F-M20 | TEMP-M31-01 | 默认 `npm test` 漏跑 `.mjs` 测试 |
| F-M21 | TEMP-M31-02 | 默认套件中的旧架构 seam 断言与当前 controller 接口漂移并失败 |

## 4. 低风险 finding（1）

| 最终 ID | 来源候选 | 结论 |
|---|---|---|
| F-L01 | TEMP-M09-3 | 订单“清空记录”只清 React 状态，重新加载后恢复 |

## 5. 推荐修复顺序与验收门禁

### P0：恢复发布门禁与可恢复性

- 修 F-H15、F-M20、F-M21，使 Git 根 CI 可触发，默认 JS/MJS 套件只有一套一致的 controller seam。
- 修 F-H10，并在 production `app.asar`/`app.asar.unpacked` 真实目录执行河畔脚本自检。
- 修 F-H13/F-H14；备份后打开 destination 验证，restore-check 必须拒绝不存在路径且不产生文件。
- 验收：PR 上可见 CI；全套测试/类型检查通过；production unpacked smoke 通过；隔离备份恢复演练成功。

### P1：统一远端事实协议

- 修 F-H04–F-H09、F-H12：所有远端调用必须明确 `not_started / started_unknown / confirmed_success / confirmed_failure`，并在进程退出前持久化 recovery intent。
- 对 `submitting` 增加启动期 reconcile/attention；锁改为有 owner/lease 的可回收协议；远端 ID 与 outcome 同次持久化。
- 验收：在每个“远端调用前、调用后、ledger 写前、order/archive 写前”故障点强杀，重启后都能得到可解释且不盲重试的状态。

### P2：关闭敏感信息与账号边界

- 修 F-H03、F-H11、F-M17、F-M18：生产媒体只允许 HTTPS；截图遮罩/裁剪；临时秘密文件用受限 ACL、启动清理；目标和 profile 绑定账号 identity。
- 验收：安装包现场检查网络、日志、截图、临时目录和浏览器 profile，不出现明文 key/Cookie/稿件残留；换号必须阻断旧队列。

### P3：修复客户/内容/批次一致性

- 修 F-H01、F-H02、F-M03、F-M09、F-M12–F-M15。
- 验收：客户切换、并发 batch 更新、旧删除 token、generationTaskId 重复和媒体资源重试都有最小回归测试。

### P4：容量、UX 与可观测性收口

- 修 F-M01/F-M02/F-M04–F-M08/F-M10/F-M11/F-M16/F-M19/F-L01。
- 验收：资源分页有去重/重复页检测/容量上限；所有 destructive action 走统一 confirmation；状态和日志在 UI/attention 中闭环。

## 6. 已执行验证

- auth-server：16/16 通过。
- `tests/platform-submission-controller.test.mjs`：6/6 通过；证明 `.mjs` 测试有效但不进入默认 glob。
- `tests/renderer-workbench-controller-seams.test.js`：0/2，通过失败输出确认旧 hook 断言与当前生产 controller seam 漂移。
- 早期模块联合验证记录：M22–M24/M27 133/133；M14–M21 313 项中 308 通过、5 skip；M01/M03/M04/M11/M12 147 项中 145 通过、2 个 Windows symlink skip；M25/M26 59/59。各集合有重叠，不能相加为全仓总数。

## 7. 仍需现场证据

真实 J4125 Cloudflare Tunnel/TLS/trustProxy、媒体服务 HTTPS/幂等协议、头条/列举/河畔真实页面、Windows 安装包签名/SmartScreen/ACL、磁盘满/断电/WAL、备份保留与 RPO/RTO、真实容量/SLO 均未验证。任何“可以正式发布”结论必须等待 P0/P1 和这些现场门禁完成。
