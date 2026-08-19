# 平台账号档案 P1 收敛计划

状态：`COMPLETE`

## 目标

以已验证可正常发文的 P0 登录会话修复为基线，收敛“登录会话 / 平台账号档案 / 远端账号绑定 / 投稿前核验”的职责，并提供安全删除账号档案能力。

## 产品决策

1. 创建账号档案不再只是创建本地标签；必须基于当前已保存登录状态识别远端账号，并在命令成功返回前建立远端 fingerprint 绑定。
2. 历史版本遗留的未绑定档案继续可见，但明确标记为“未绑定”；用户可显式执行“绑定当前登录账号”。投稿流程不再替未绑定档案偷偷建立绑定。
3. 投稿前与准备完成后的账号核验继续保留，只做“验证当前远端身份是否与既有绑定一致”，不写绑定。
4. 删除账号档案为显式危险操作：若仍有普通平台队列项或活动发布目标则拒绝。可安全删除时，清理空队列组、删除本地档案，并清理本机 opaque fingerprint 绑定；历史发布/订单/审计事实不删除。
5. 账号身份解析失败、未绑定、账号不匹配、绑定存储异常保留稳定原因码；不再统一吞成 `REGULAR_ACCOUNT_PROFILE_UNVERIFIED`。

## Owner 边界

- `platform-session-service`：仅负责登录浏览器生命周期、登录检查、状态保存与释放；P0 行为保持不变。
- `platform-account-identity-service`：只负责从平台 adapter 取得当前远端身份并转换为不泄露 remote id 的 fingerprint evidence。
- `platform-account-profile-service`：账号档案应用用例 owner，负责 list/create+bind/bind-existing/delete；协调 OperationalStore 与本机 binding store。
- `platform-account-inspector`：投稿时只验证既有档案与当前远端身份是否匹配；不创建绑定。
- `OperationalStore`：账号档案身份与删除安全边界；不保存 Cookie/remote id/fingerprint。
- Renderer：只展示档案、绑定状态与收集用户意图；不实现 fingerprint 或绑定规则。

## 实施步骤

1. OperationalStore 增加安全删除账号档案能力和直接行为测试。
2. Binding store 增加 remove 能力。
3. 新增 identity service 与 account profile application service；补创建绑定、遗留档案绑定、换号拒绝、删除补偿测试。
4. 将投稿 inspector 改为 verify-only，并保留具体 reason/cause；preparation/orchestrator 映射稳定原因码。
5. 接入 composition、IPC contract、preload、renderer bridge/feature/UI；新增“绑定当前账号”和“删除档案”操作与确认。
6. 更新产品真源与直接测试；运行定向 Node tests、renderer typecheck/build（依赖可用时）。

## 验收

- 新档案只有在当前远端账号身份可验证且 binding 写入成功时才创建成功；失败不留下孤儿本地档案。
- 旧未绑定档案可显式绑定当前账号；已经绑定 A 的档案不能绑定/投稿到 B。
- 投稿 inspector 对未绑定档案只失败，不写 binding store。
- 删除有活动队列/活动目标的档案返回稳定阻塞码；安全档案可删除且不再出现在选择器。
- 删除后历史发布/订单/最小审计数据不被删除。
- UI 明确显示“已绑定 / 未绑定”，提供“绑定当前账号”和“删除档案”。
- P0 `check -> save -> close` 生命周期回归测试继续通过。

## Progress

- [x] 2026-08-18：确认 P0 已由用户实际发文验证通过，作为本计划基线。
- [x] 2026-08-18：确认删除采用安全删除策略，不触碰历史发布/订单/审计事实。
- [x] 2026-08-19：Owner / service / store 实现完成；创建即绑定、遗留档案显式绑定、verify-only inspector、安全删除与 queue admission bound gate 已接入。
- [x] 2026-08-19：IPC / bridge / renderer 实现完成；UI 显示已绑定/未绑定，提供“绑定当前账号”“删除档案”，删除带危险确认。
- [x] 2026-08-19：定向回归完成：账号档案核心 25 项中 24 pass / 1 因归档源码缺少 `@noble/hashes` 跳过；Ticket 08 投稿边界 34/34 pass；platform feature 14/14 pass；IPC schema fixtures 118/118 解析通过；P0 login lease 回归继续通过。
- [x] 2026-08-19：产品真源与工作索引已更新，准备源码全量包与基于 P0 的直接覆盖包。


## 验证说明

- 本轮没有执行任何真实平台登录、投稿或付费操作；P0 的真实列举网发文已由用户在进入 P1 前验证通过。
- 归档源码不包含完整 `node_modules`，因此依赖 Electron / React / `@electron/asar` 的全量测试与 renderer build 无法在当前容器完成。
- 已对全部本轮变更 JavaScript 执行 `node -c`；5 个变更 TypeScript/TSX 文件使用 TypeScript parser 检查，均无语法诊断。
- `tests/reference-standard-platform-acceptance.test.js` 在当前归档环境因缺少 `@electron/asar` 无法启动，不作为代码失败记录。
- 打包时不包含本次测试过程中产生的不完整 `node_modules` 或临时测试 stub。
