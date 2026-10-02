# 外部链路与候选验收

状态：本地实现与外部验收分开；下列项目尚未对当前最终候选闭合。Owner：平台 adapter、paid application、迁移和发布工程。不得继承历史账号、发布或费用授权。

## 当前需要的验收

| 项目 | 执行前条件 | 完成证据 |
| --- | --- | --- |
| Ticket 19 列举网 HTTP multipart 带图 | 指定账号、合成/批准文章、图片、目标与可见副作用；明确一次操作及停止条件 | 真实上传及提交回执、结果分类与本地保真；失败/不确定不自动改用浏览器再次提交 |
| Ticket 26 真实链路 | 分别批准登录、普通发布、付费额度、取消、订单核查及目标 | 对当前文章库/投稿中心链路记录真实订单号、价格、结果与人工核对，不能用 mock 替代 |
| 迁移 | 批准的副本、备份、dry-run 与恢复方案 | schema/身份/发布证据保留；真实生产迁移另行授权 |
| 发布候选 | 明确最终 SHA、签名环境、隔离 Windows 安装/升级对象 | 当前产物离线 smoke、解包导航、签名及升级/回滚证据；旧包不证明新代码 |

网站媒体图片传输机制未真实证明前不承诺支持。Ticket 20/21 已移出旧 Wave，无默认调度入口，若要新平台/图片扩展另定实际范围。

## Ticket 25 历史 gate 对账

25-A～25-G 本地包曾闭合，旧合同仍记 Independent Combined Audit、必要修复、有界复审、final clean smoke 与真实验收未闭合。Ticket 26 已替换旧 UI 并完成其本地 combined audit、bounded review 和当时包 smoke，另有 25-independent-audit-blocking-remediation 明确记录有界复审 PASS，仍待 final clean HEAD 和外部验收；不把已修复 findings 重新打开。故不再机械执行 Ticket 25 的旧 UI 清单，也不把 Ticket 25 整体伪记 COMPLETE。

下一次发布前把仍有效的不变量映射到当前测试/产物：单活动目标、冻结、uncertain 不重发、订单 observation、迁移恢复及结果证据。已有证明只在匹配源码/产物时复用，缺口在本计划补验；不是强制重启全部历史 Wave 审计。固定 acceptance JSON 与旧 SPEC source 定位保留，不改资产来伪造新验收。

历史曾有个别平台真实无图成功记录，只证明当时指定账号和文章，不替代 multipart、付费、质量或当前候选验收。德瑞客户内容与工作区继续排除在验收之外，除非用户明确变更该限制。
