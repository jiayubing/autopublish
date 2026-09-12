# 豆包采集修复（2026-09-12）

## 本次范围
- 每轮批次/重试为客户新建对话；同轮同客户共用对话，暂停后继续保留本轮消息身份。取消跨批次 URL 持久化读写，不删除用户已有文件。
- 底栏明确显示当前采集/等待/暂停和成功失败计数；历史失败可展开查看，不挤占运行提示。
- 核对实际日志，修复可复现的就绪识别问题，增加不含正文/URL/凭据的诊断字段。

## 已确认
- 实际应用日志位于 LocalAppData/AutoPublish/logs/doubao-diagnostics；仓库 logs 下记录不能代替真实运行证据。
- 北京时间 22:15、22:19、22:28 的三次失败均为 ready 阶段约 120 秒超时，inputAvailable 未成立，已有 2/4/2 条消息，未确认发送。
- 现有日志没有输入框结构，不能仅据此断言真实页面的 DOM 根因。只读检查时豆包会话已关闭。
- 旧底栏总是显示失败任务；旧服务在内容库读写 doubao-conversations.json。

## 实现与 owner
- 队列为每轮 start/retry 产生内部 collectionRunId；pause/resume 不更换，内容采集服务原样传给 browser adapter。
- browser adapter 独占本轮会话 Map，切换轮次或关闭会话时丢弃；已确认发送后的人工恢复仍绑定原消息。不再有持久会话 store 或历史 URL 注入路径。
- 输入框只检查自身尺寸；仍检查祖先 display/visibility/opacity/aria-hidden。诊断补 inputAvailable、inputCandidateCount，不包含 URL、正文和凭据。
- UI 显示客户名称/队列题次、成功失败数量与当前运行状态；失败详情单独展开，零失败时禁用重试。README 与批次说明同步。

## 最终验证（全部通过）
工作目录：auto—publish。
- `node --test` 加 `rg --files tests` 筛选出的所有 `doubao*.test.js`：144 项通过，无跳过。
- `node --test tests/renderer-question-editor-session.test.js`：7 项通过，无跳过；其 harness 执行 Vite production build。实际 Chromium 验证加载、暂停、继续按钮、运行中保留失败、详情开关、等待、完成及空批次禁用态。
- `node --test tests/test-discovery-contract.test.js`：11 项通过；重命名后的 URL 测试已纳入原 core 分组。
- `npm run typecheck:main`、`npm run typecheck:renderer`、`npm run typecheck:bridge`：通过。
- 对本次修改的源码和测试运行定向 `npx --no-install eslint`：通过。
- `git diff --check`：通过，仅有本机 LF/CRLF 提示。
- UI 截图 `auto—publish/build/evidence/doubao-task-bar.png` 已目视检查，1024×800 下底栏和失败详情可读、未溢出。

## 审查闭环
Primary Review 限本轮 owner、直接调用链、输入框就绪、发送身份、暂停恢复和 UI 状态。没有剩余阻塞 finding。
- `EXPOSED_PREEXISTING`：零尺寸父布局造成就绪误判。新增真实 Chromium 回归在修复前为 unknown、修复后 authenticated；隐藏布局仍为 unknown。
- 新批次/重试会话更新、暂停继续不更新、同轮客户复用与人工切页返回均有行为回归。
- UI 测试 fixture 新字段引起两项原 fixture 整体比对失败，已将队列 fixture 分开；有界复跑该文件 7 项通过。
- 旧持久会话实现和对应持久化测试已删除，保留 URL 安全验证测试；未删除用户的旧会话文件或回答。

## 完成与限制
本地实现与验证 COMPLETE。尚未做真实豆包采集验收；失败时的真实页面已关闭，不能声称所有真实超时根因已确认。
用户授权提交后补跑 `npm run test:integration`：214 个文件、1119 项测试全部通过，无跳过，耗时约 158 秒；计时 evidence 位于 `auto—publish/build/test-results/integration-timings.json`。未运行 release 或打包。
当前应用进程来自仓库 node_modules/electron，主进程修复需完整退出后重启；未中断或重启用户应用。
用户已授权提交并推送。提交仅包含本轮采集修复与上一轮发送前 URL 沙箱修复，共 21 个文件路径；保留用户原有 docs/WORK-INDEX.md、pelican-bicycle.html 和 .scratch/scale-audit 改动，不纳入本提交。提交基线为 master / 1e74583c；实现 commit 以本文件所在 Git 提交为准。
