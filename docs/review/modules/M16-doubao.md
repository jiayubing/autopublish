# M16 豆包采集深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M16 管理问题采集队列，驱动持久化 Playwright 会话打开豆包页面，识别登录/挑战/流式完成状态，提取当前回答及引用并写入 research store；同时提供暂停、继续、停止、失败重试和失败诊断。它不拥有浏览器 CLI 进程实现，也不拥有客户/问题身份或生成逻辑。

十项维度已覆盖：500 条容量、串行队列状态机、暂停/停止检查点、重启快照、登录与 challenge、DOM 作用域、超时和截图超时、profile 生命周期、研究覆盖规则、IPC DTO 与诊断保留。发现诊断 PNG 未执行文档声明的脱敏。

## 已检查目录与关键文件

- 全部生产文件：`src/content/doubao-page-parser.js`、`doubao-browser-adapter.js`、`doubao-collection-service.js`、`doubao-collection-queue.js`；`desktop/services/doubao-collection-service.js`。
- 边界与运行时：`desktop/ipc/doubao-collection-ipc.js`、preload bridge、`desktop/workspace-runtime.js`、`src/core/playwright.js`、runtime paths/diagnostics。
- 数据依赖：M14 `question-store.js`、`research-store.js`、client list 调用链。
- 契约与测试：`docs/doubao-collection-operations.md`、`docs/content-workspace-contract.md`；全部 `doubao-*.test.js` 和 fixture 页面结构。

## 关键调用链

1. renderer/IPC → desktop collection service → question store → collection queue → source collection service。
2. 单项执行 → browser adapter → Playwright runtime → 页面 snapshot → parser 仅从当前 message 节点提取 answer/citations → research store。
3. login required/challenge/page error/120 秒 deadline → `captureDiagnostic` → PNG + 结构化 JSON → 保留最近 20 组。
4. pause/stop → 队列状态机与 adapter 检查点；关闭 workspace → dispose/close browser session。

## 候选发现

## TEMP-M16-1：失败诊断所谓“脱敏截图”实际保存未遮罩的原始页面截图

- 分类：安全性 / 敏感数据泄漏 / 故障诊断
- 所属模块：M16 豆包采集；运行时边界关联 M12
- 严重程度：高
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/docs/content-workspace-contract.md:155-157`；`auto—publish/docs/doubao-collection-operations.md:118-121`；`auto—publish/src/content/doubao-browser-adapter.js:273-301` `captureDiagnostic`；`auto—publish/src/core/playwright.js:266-271` `screenshot`
- 问题描述：操作契约把失败 PNG 定义为 redacted screenshot，但生产代码直接调用 Playwright CLI 对当前页面截图，没有遮罩问题/答案、裁剪安全区域、像素后处理或敏感区域清除。
- 代码证据：`captureDiagnostic` 只生成路径并调用 `runtime.screenshot({path,...})`；runtime 将该调用原样转换为 `playwright screenshot --filename=<path>`。同函数只对 JSON summary 选择字段，PNG 不经过任何脱敏函数。
- 触发条件：页面要求登录、出现 challenge、页面错误、回答超时或最终采集失败；这些均是正常可达的错误分支。
- 可达路径或调用链：采集任务 → browser adapter snapshot/poll → error branch → `captureDiagnostic` → Playwright 整页截图 → `logs/doubao-diagnostics/*.png`。
- 实际影响：当前问题、豆包回答、引用以及页面中可见的其他会话/账号信息可能以原始像素落盘；诊断目录的访问者或备份可能获得超出结构化摘要的数据。
- 影响范围：所有开启失败诊断的豆包采集会话；是否包含其他会话内容取决于失败时页面可视区域。
- 现有测试是否覆盖：测试验证 screenshot 被调用、独立 timeout、JSON summary 和最多 20 组保留，但 fake screenshot 不产生真实像素，也没有断言遮罩/裁剪后的图像内容。
- 验证方法与结果：静态追踪从失败分支到 Playwright CLI 的完整生产链，确认其中没有任何像素变换或页面预处理；测试代码也只断言调用和文件数。因此“原始截图”行为已验证，具体现场泄漏内容取决于页面。
- 修复方向：在截图前对允许的诊断 DOM 做安全裁剪并遮罩文本/头像/账号区域，或改为仅保留已白名单化的结构摘要；增加真实 fixture 截图的像素/区域测试，并明确目录权限与清理策略。
- 关联发现：TEMP-M14-1 会在客户 ID 与目录名不同时更早阻断本模块的问题链；二者根因不同。

## 测试情况

- M14–M21 联合定向测试：313 个测试，308 通过、0 失败、5 跳过，退出码 0。
- Doubao 测试覆盖登录、challenge、流式完成、超时、页面错误、重试、暂停/停止、队列容量和诊断数量；未覆盖真实截图内容脱敏。
- 未连接真实豆包站点，DOM 漂移和账号风控仍由 fixture 近似验证。

## 未覆盖区域与待验证

- 未读取或展示现场诊断 PNG，避免扩大敏感数据暴露；发现由截图调用链直接证明。
- 未验证 Windows 文件 ACL 是否限制诊断目录，仅有数量保留不等于访问控制。
- 真实网站 DOM、登录挑战频率和账号侧限流需要非生产测试账号验证。

## 模块审查结论

M16 达到深审完成门槛，形成 1 条高严重度候选。队列、DOM 作用域、停止和超时机制总体完整，但原始失败页面被保存为 PNG，与明确的“脱敏截图”承诺冲突，具有现实的客户数据与会话信息落盘路径。
