# 阶段7：Auth、构建、安全与可观测

## 1. 阶段目标

补齐独立Auth、生产传输、备份恢复、运行诊断、CI/release和最终制品能力，使前六阶段的新架构在真实运行拓扑下可以安全发布。本阶段不再改变核心领域interface。

关联工作：OPT-007、008、010、011、026、028；覆盖F-H03、F-H10、F-H11、F-H13、F-H14、F-M02、F-M18、F-M19。

## 2. 开始条件

- 阶段6为`COMPLETE`。
- Core/Application/Renderer interfaces已冻结。
- 所有外部待人工事项和production配置缺口已在进度账本列出。
- Auth真实部署owner、CI/release owner、媒体HTTPS owner至少已确定负责人；无法确定时对应production验收保持blocked。

## 3. 必读输入

- 总纲、目标架构、协议、进度账本和阶段4/6交接。
- M02、M11、M26、M27、M28、M29、M30、M31 module报告。
- Auth server/domain/repository/scripts/Docker/compose、media config/client、runtime paths、logging/diagnostics、electron-builder和根CI。
- OPT-007、008、010、011、026、028及风险决策D-001、D-004～D-007。

## 4. 允许修改

- Auth domain/repository/HTTP adapter、backup/restore/migration和deployment配置。
- HTTPS/fail-closed配置、安全诊断、日志和运行指标。
- Root CI、package scripts、Electron builder、runtime paths和制品smoke。
- 运维手册、release checklist和故障演练文档。
- 删除无consumer的原始`publish-log`路径。

## 5. 禁止修改

- PublicationWorkflow、OperationalStore、ContentStore和Renderer feature interface。
- 为可观测性把内部状态/原始错误暴露给renderer。
- 自动配置生产DNS、证书、Cloudflare、WAF或正式签名。
- 在真实Auth数据库执行恢复或破坏性migration。
- 因HTTPS暂不可用恢复公网HTTP。

## 6. 已确定的产品/安全选择

- Media production只允许可信HTTPS；缺endpoint时功能禁用。
- 失败诊断默认结构化摘要，不保存原始整页截图。
- 不增加原始实时publish-log UI；删除死sender，以task snapshot、attention、diagnosticId和本地结构化日志作为interface。
- Auth保持Node + SQLite单实例，除非本阶段容量证据证明当前目标必须HA；本轮不迁PostgreSQL。

## 7. 实施步骤

### 7.1 修复Auth备份与恢复

- Backup完成后重新打开destination并执行只读schema/row/hash验证。
- Restore-check先验证普通文件和已知schema，以readOnly打开；不存在路径保持不存在。
- Migration在commit版本前验证目标schema，失败不把库标记为新版本。
- 覆盖WAL、截断、空库、旧schema、权限、磁盘满和重复执行。
- 建立隔离恢复演练脚本，不接受production路径。

### 7.2 拆分Auth健康检查

- Liveness只证明进程事件循环和HTTP响应。
- Readiness执行轻量必要查询，不每30秒全库`integrity_check`。
- 完整integrity检查由受控运维命令/定时任务执行并有超时。
- Audit保留/轮换和数据库容量有明确诊断。

### 7.3 收敛代理来源与限速

- 只有受信代理配置明确时读取转发来源头。
- Login limiter key数有TTL/LRU硬上限。
- 增加来源级与登录identity级合理桶，避免攻击者制造无限key。
- 覆盖100k loginName、NAT共享、重启和窗口过期。
- 真实Cloudflare/Tunnel来源头由人工环境验收，不从文档推断。

### 7.4 完成HTTPS与配置门禁

- Media base URL默认不包含公网HTTP。
- 非loopback HTTP在读取/发送API key和正文前拒绝。
- TLS证书错误、hostname错误和timeout安全分类。
- Settings明确显示disabled/invalid，不提供“继续使用不安全默认值”。
- Production endpoint、证书和网络路径由人工验收并记录。

### 7.5 建立结构化诊断

- 统一diagnostic record：时间、code、module、operationId/runId、safe metadata。
- 不记录正文、Cookie、API key、绝对路径、原始DOM和账号显示名。
- Renderer只看到diagnosticId和用户消息。
- 删除无consumer的`publish-log` sender/channel和原始entry路径。
- 日志有轮换/容量上限、ACL/目录策略和启动清理。
- Attention和结构化状态负责可操作故障，日志不成为恢复事实源。

### 7.6 完成production packaging

- Production ASAR中的Python、Playwright/runtime工具和migration CLI路径均解析到可执行普通文件。
- `electron-builder --dir`后执行离线self-test。
- 安装、本地状态、可迁移内容库和私密工件保持分离。
- 升级后的workspace schema marker会让旧版本明确拒绝。
- Production签名变量、证书和审批缺失时只阻塞正式release，不回退安全配置。

### 7.7 完成CI/release流程

- Root CI运行全局门禁、migration roundtrip、故障注入摘要、auth容器测试和production directory smoke。
- Required checks名称固定并写入release checklist。
- Release需记录commit、schema版本、migration report、backup验证、人工平台/TLS验收和回滚包。
- 不在CI使用生产秘密；外部E2E为单独人工受控job。

## 8. 测试要求

- Auth backup destination、read-only restore、v1/v2、WAL、损坏和副作用测试。
- Liveness/readiness/integrity分离和超时。
- 100k limiter key容量、TTL/LRU、可信/不可信代理头。
- Media HTTP拒绝、TLS fake endpoint和敏感body未发送。
- Diagnostic DTO/log脱敏、轮换、容量和symlink/path安全。
- 无`publish-log` sender/consumer/channel静态检查。
- Auth Linux container、Electron Windows `--dir`、Python self-test和migration CLI smoke。

## 9. 完成条件

- Auth backup验证真实destination，restore-check零副作用。
- Healthcheck不会高频执行全库完整性扫描。
- Limiter有硬上限且可信来源配置明确。
- Media production无公网HTTPfallback。
- 诊断结构化、有界、脱敏，死publish-log interface已删除。
- 最终制品离线smoke通过，资源路径指向真实解包文件。
- CI和release checklist覆盖schema、备份、制品和人工门。
- 所有未完成production人工项明确阻塞release而非阻塞代码收口。

## 10. 停止条件

- Backup/restore测试需要触碰真实数据库。
- 无HTTPS时implementation尝试继续发送敏感body。
- 日志需求要求把原始错误/内容暴露给renderer。
- Production package只能依赖源码路径工作。
- 代理来源规则无法与真实部署owner确认却被标为已验收。

## 11. 交接重点

记录Auth RPO/RTO决策及未决项、备份/恢复命令、health语义、限速容量、HTTPS状态、diagnostic schema、制品smoke、required checks、正式release阻塞项和阶段8全链验收入口。

