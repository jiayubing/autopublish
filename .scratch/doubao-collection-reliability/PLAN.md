# 豆包采集稳定性与读取减负

状态：COMPLETE（2026-09-11，本地实现与验证完成）。基线 HEAD 049771b3，开始时工作区干净。

范围：修复人工切换会话导致错误发送/映射污染、已确认发送后验证恢复重发；核实并封闭 runtime 超时后的后续操作边界。仅复用既有 queue、adapter、store，不建立持久化恢复协议。

用户已明确保留 3–8 秒同客户、6–12 秒切客户节流。本次优化 recollect 无用 research 读取、DOM 尾部节点数组分配；不建立文件缓存或 DOM observer。

最小阅读集：README/AI-ENTRY/WORK-INDEX、应用 AGENTS、doubao collection queue/service/browser adapter/conversation store/parser、core Playwright runtime 与直接测试。审查范围仅对应 owner、调用方、失败/恢复及公开行为。

实施：adapter 单个内存已发送消息检查点，登录/验证恢复绑定原消息；发送前 live URL fence；只允许发送证据建立客户 URL，禁止普通轮询写回。runtime 命令超时必须先结束旧 session，关闭失败阻止再开新采集。

验证：合成 queue+adapter、真实本地 Chromium DOM（屏蔽网络）、定向服务/会话/核心测试、lint/main typecheck；不使用真实客户、登录或豆包请求。完成后记录最终命令、结果、review 与 Git 状态。


## 最终实施

- `src/content/doubao-browser-adapter.js`：移除 activeClientId 快捷判断，复用实时快照校验客户 URL；发送脚本在等待输入框后、填入前和 Enter 前验证会话及 deadline。发送确认同时记录用户消息 ID 与其 DOM 所在 URL；新 URL 延迟生成时只凭该消息建立映射，普通轮询不能污染映射。
- 已确认发送后 login/challenge 在 adapter 内保留单个 answer checkpoint，resume 只等原消息；问题文本变化、消息/会话证据缺失进入显式失败，不重发。检查点不跨进程，close 时清除。
- runtime 命令超时后 await 旧 session close；close 失败保留 gate，下一次 collect/openLogin 必须先成功关闭。没有把所有错误当成超时，也没有自动重试发送。
- `src/content/doubao-collection-queue.js`：新会话/恢复错误遵循既有 terminal failed + 暂停剩余 pending 的规则。用户 resume 不重跑这些 failed 项；显式 retryFailed 保持原有语义。
- `src/content/doubao-collection-service.js`：recollect 的 preview/prepare 不读取 research；missing 模式继续检查当前问题对应的 research。
- DOM 保留最后 80 个消息的解析语义，只移除全消息 NodeList 转数组的额外分配。question/research 既有必要读取和长会话 DOM 查询未全面异步化。
- README 同步恢复、会话校验和节流行为。测试更新假的发送 evidence，新增 `doubao-resume-safety.test.js` 及真实 Chromium 的 navigation/deadline fence 回归。

## 最终验证（最终 production source 修改之后）

在 `auto—publish/` 运行：

```powershell
$doubaoTestFiles = @(rg --files tests -g 'doubao*.test.js')
node --test @doubaoTestFiles
npm run typecheck:main
npm run lint
npm test
```

- 全部豆包相关 139 项测试通过，无失败/跳过；含本地 Chromium 页面，所有页面请求由合成内容响应或拦截。
- main typecheck、全仓 ESLint 通过。
- core：61 个文件、574 项通过，无失败/跳过，约 33.2 秒。
- 根目录 `git diff --check` 通过。
- 未运行完整 integration/release、打包或真实豆包验收。本次没有 renderer/打包修改；真实登录和问题提交未获授权，未操作真实浏览器/客户数据。测试仅证明合成 transport 和本地 DOM 行为，不宣称真实服务耗时或后台远端生成被取消。

## Primary Review → Bounded Re-review → Closure

主 agent 自审仅覆盖当前 queue/service/adapter/runtime 的直接链路，无独立 reviewer。

- `EXPOSED_PREEXISTING`：已发送验证恢复重发、会话映射污染、无用 recollect research 读取已关闭。
- `INTRODUCED_BY_CHANGE`：复审收敛了新会话 URL 延迟生成场景，避免仅因 acknowledgement 先于 URL 更新而误报失败；使用本次已确认消息绑定 URL。另补齐空输入框时的 URL 校验、填写到 Enter 之间的导航/deadline fence，以及 close 失败时 openLogin 的相同关闭门禁。
- 已验证：发送前验证、发送后登录/验证恢复、人工切会话、采集中导航、暂停中编辑问题、消息 ID 缺失、runtime timeout drain、close 失败禁止重开、URL 延迟绑定/不相关页面不得绑定、既有节流和 terminal failed resume 规则。
- bounded 复审及直接回归通过；无剩余 blocking finding，不继续 fresh full review。

## 剩余边界与 Git 状态

- 保留用户确认的 3–8/6–12 秒节流；未做 DOM observer、后台 worker 或文件缓存。
- 旧的已污染客户 URL 无可靠归属证据，未自动改写历史映射；本次阻止新增污染。
- 发送结果不确定时仍由用户核对，显式 retryFailed 可能产生新的提问；程序不承诺第三方 exactly-once。
- HEAD 保持 `049771b3b178a51bbca766aea082ccdd38d303bc`；本次修改留在工作区，未 stage/commit/push。最终验证后仅更新本记录。
