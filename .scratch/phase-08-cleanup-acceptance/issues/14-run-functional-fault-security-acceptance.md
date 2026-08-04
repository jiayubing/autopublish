# 14 — 执行功能、故障与安全最终验收

**What to build:** 在完全离线、合成 fixture 环境中证明客户、内容、生成、入队、发布、订单、attention、trash 的完整行为，以及外部调用前后、进程/磁盘/网络故障和安全边界；每项失败都能归属到权威 module，而不是由 Phase 8 wrapper 掩盖。

**Blocked by:** 13 — 删除旧测试、依赖与构建残余并固化门禁

**Status:** ready-for-agent

## 必读输入

- Ticket 13 最终 module map、CI gates、test inventory 和保留例外。
- Phase 8 最终验收矩阵 8.1–8.3。
- 37 条 finding、29 个 OPT 对应的功能/故障/安全验证项与 Phase 4/7 人工 gates。
- 当前 fake Publisher、fake HTTP、temporary workspace/SQLite、child/fake clock/disk fault fixtures。

## 开始门禁

1. 确认 cleanup/architecture gates 全绿，source tree 无待删旧路径。
2. 冻结自动验收 manifest schema和每类测试的真实收集清单。
3. 所有 fixture 指向临时隔离目录；网络默认关闭，不加载 production secrets。

## 执行过程

1. 功能矩阵：客户、文章、模板、生成、入队、发布、订单、attention、trash；覆盖每个 fake Publisher、多账号 target、media resource identity、重复保护、handoff、排序、删除/恢复。
2. 故障矩阵：操作/远端调用/持久化前后强杀，timeout、接收后断连、弱证据、SQLite/disk/WAL/corruption、post-processing/archive failure、旧消息、快速 stop/start、recovery/removal 重复 runner。
3. 安全矩阵：Electron sandbox/preload/IPC、media HTTP/TLS/redirect、账号切换、DTO/log/fixture/temp/package 敏感扫描、path traversal/symlink、Auth secret/proxy/limiter。
4. 每个 case 记录权威 owner、故障点、预期稳定 code、持久事实、重启后结果和是否需要人工核对。
5. 运行全量而非挑选性定向测试；任何失败按 owner 重开 Phase 1–7，Phase 8 不实现兼容补丁。
6. 输出安全验收摘要，只含计数、code/category、fixture 类型和 hash，不含绝对路径、正文、secret、raw error 或截图。

## 验收标准

- [ ] Phase 8 8.1 功能与领域矩阵全部自动项通过，无真实外部调用。
- [ ] Phase 8 8.2 故障与恢复矩阵每个故障点有可观察、可归属结果。
- [ ] Phase 8 8.3 安全矩阵全部自动项通过，敏感数据扫描为 0。
- [ ] 所有自动 suite 无未解释 skip；平台限制有 issue/状态记录。
- [ ] attention/run snapshot 可在重启后从权威事实重建，无第二份业务状态。
- [ ] 真实账号、TLS、签名、installer、Auth recovery 等项目仍明确 `PENDING_HUMAN`。

## 必跑验证

- 完整 root suite、Auth suite、links/security、media transport、diagnostics、architecture、Renderer Electron focus。
- lint、三套 typecheck、format、Renderer/preload build、`git diff --check`。
- 按 Phase 8 验收表记录每条命令的数量、skip、环境和 evidence hash。

## 交接与停止条件

- 更新 Phase 8 handoff 的功能/故障/安全证据和重开决定。
- 任一状态/错误无法归属权威 module、自动测试需要真实账号/数据/付费服务、或出现数据破坏风险时停止。
- 不将人工项标为通过，不自动提交。

