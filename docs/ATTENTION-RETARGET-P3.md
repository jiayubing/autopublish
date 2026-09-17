# 需处理批量改投 P3

状态：RUNNING（实现、主审查与有界复查完成，等待最终 clean HEAD 门禁）。

基线：P2 `2971278be2d9d271f21f6bab8ad5e3f5a4122430`；PR #70 启动时 OPEN，故独立分支 `codex/attention-retarget-p3` 基于 P2，PR 以 P2 分支为 base。不自动合并，不修改 P2，不执行真实投稿。

## 范围与 owner

- 单篇及批量改投都在需处理页选择一个其他普通平台和已绑定账号，确认只加入正常队列，不启动远端投稿，不生成新文章。
- 复用平台目录、配置与账号绑定服务、typed admission IPC、跨客户入队应用服务、文章锁内 lifecycle/admission policy 和 OperationalStore 原子入队。不新增 schema、发布器、状态机或账号 owner。
- 入队请求可携带 `retargetFrom`（文章身份与来源 attention ID）；主进程重新读取来源，拒绝 stale、非明确失败、同平台和非匹配身份；原入队 owner 再核实已发布、活动目标、uncertain、回收/缺失和重复项。
- 可用目标取现有目录、当前本地配置和已绑定账号的交集，排除所选原平台；不发起远端账号测试。远端权限和登录身份仍由现有执行链最终核实。
- 没有通用 attention resolve writer。既有待办查询由新发布尝试派生结案，原失败 publication/attempt 保留。修复历史平台往返时错误使用 publication 创建顺序的问题，改为比较 attempt 创建顺序。
- 预检有不可执行项时本轮不入队；正式入队仍逐项返回真实结果，跨客户维持原事务边界。响应无法确认时提示核对并禁用当前会话重提，无自动重试。

## 验证矩阵

- 单篇/多篇/跨客户，一批一个目标；同平台、多个目标、账号不匹配、未配置和 stale 拒绝。
- 原文与原历史保留、原待办关闭；重复调用不重复入队，重启后事实保留。
- 现有队列 claim → prepared evidence → accepted 链路保持可用，成功后禁止再入队。
- A 失败 → B 失败 → A 入队/失败，待办追随最新尝试。
- 部分成功、uncertain 来源、事务提交失败：未成功项不假结案，结果不确定不自动重试。
- 浏览器覆盖混合选择、加载/空态/失败重试、取消、单目标选项、配置/绑定过滤、执行中禁用、部分结果、stale 预检、响应丢失；保留 P2 生成与文章/详情入口。

## 当前证据

- 持久化/跨客户/普通结果定向回归 75 项通过；新增两项 partial/rollback 回归后，P3 定向 5 项通过。
- 浏览器 `renderer-article-attention-actions.test.js` 通过，使用合成 IPC fixture 和临时构建。
- production IPC fixture matrix 6 项通过；main/renderer/bridge typecheck 与 ESLint 初步通过，最终代码仍须完整门禁。
- 主审查遵循 Primary → 修复阻塞 → Bounded re-review；不并行委托，不重复 fresh full review。
- 已确认 `EXPOSED_PREEXISTING` P2 阻塞：往返改投后旧待办未关闭；owner 为 OperationalStore recovery 查询，已有复现与修复回归。
- Primary review：核对直接入队/跨客户/IPC/配置/账号/UI 链路及持久事务。新增来源仅为请求约束，不拥有发布状态；实际失败待办查询无独立 resolve 写入。无新增 blocking finding。
- Bounded re-review：仅检查上述往返改投 finding、query 修复、直接 admission 调用方和回归，PASS；原子入队、first success、uncertain 保真不变量未变。
- 最终提交前 main/renderer/bridge typecheck、ESLint、renderer/preload build 通过；新增 typed retarget/目录配置合同测试 2 项通过。构建仅有既有 bundle-size 提示。

仅使用合成数据、临时 SQLite/文件和假 transport。真实登录、发布、付费、AI、图片上传及生产数据库不在授权范围。
