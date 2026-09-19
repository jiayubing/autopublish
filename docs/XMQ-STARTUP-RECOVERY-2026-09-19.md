# XMQ 启动恢复（2026-09-19）

## 范围与原因

旧数据库移回后，当前扫描没有待迁移事实，但迁移历史混有 verified 和 confirmed，且没有与当前扫描匹配的 journal。原启动逻辑因此返回 MIGRATION_JOURNAL_FINGERPRINT_MISMATCH。

唯一修改 owner 为 workspace migration composition；OperationalStore 的只读 journal inspector 补充真实 importedEntryCount。仅在扫描无待导入/损坏/未规划数据、有当前运行产物及已验证历史、所有 journal 属于同一工作区和受支持版本、未完成 journal 尚未提交导入且导入条数为零时，校验数据库后允许启动。日志原样保留，不改为 verified，不删除历史，不重新导入或自动投稿。

## 真实数据保护与诊断

- 用户授权修复前，以 SQLite 在线备份保存到 `F:\xmq-recovery-backup-2026-09-19T14-08-31-695Z\operations.db`，备份 quick_check 为 ok。
- 旧库含 247 条发布记录：199 published、37 failed、11 queued；277 条投稿尝试。
- 修复后对 `F:\xmq` 单独执行真实迁移 gate：allowed=true，status=stale_preimport_journals_ignored。前后 operations.db SHA-256 一致；未启动完整应用、发布器或远端调用。
- 用户称下午新数据库已删除。对 F 盘回收站原路径匹配检查未找到当天可用副本；不能认定下午记录已恢复，也不能将旧库的 queued/failed 当作远端未发布证明。
- 恢复后先核对下午的真实平台记录，尤其原有 11 条排队记录；未核对前不要启动投稿。没有拼接数据库或伪造发布事实。

## 验证与交接

- 定向迁移回归：37/37，通过；覆盖重复检查、未验证导入、残留导入行、提交标识、异工作区、未知状态/计数、损坏数据库及历史不变。
- npm run typecheck:main、npm run lint：通过。
- npm test：596/596，通过。
- npm run test:integration：1296/1296，通过，无 skipped/todo。
- Primary review：仅放行未发生导入的过期尝试；import_committed、存在导入行/提交标识、异工作区、未知状态及损坏数据库仍阻塞。未扩大既有 verified-only 路径；无数据库 writer 或 schema 变化，未发现本次阻塞项。
- 仅主进程逻辑变化，无 renderer/preload 修改；完整界面进入需重启开发模式后人工确认。未做真实投稿验收。
- 备份和真实工作区数据不提交；原有未跟踪 work/ 保留。
