# 01 — Auth 备份、恢复检查与迁移安全

**What to build:** 运维人员可以把 Auth SQLite 数据库备份到指定 destination，并得到“目标文件本身可恢复”的验证结果；恢复检查只读取已经存在的普通数据库文件，不创建空库、不修改源库；schema migration 在提交版本标记前完成目标 schema 验证，任何失败都保持可重试且 fail-closed。

**Blocked by:** None — can start immediately

**Status:** completed

## Scope

- 修复 backup 完成后错误验证源 repository 的问题，验证必须重新打开 destination。
- 为 restore-check 增加普通文件存在性、隔离副本、只读打开和已知 schema 验证。
- 让 migration 在版本写入前验证迁移结果；失败时不得留下“已升级”状态。
- 将 WAL、主库文件、权限、磁盘空间和重复执行纳入同一套可重复的本地演练。

## Module boundaries

- **Backup orchestrator:** 只负责 source/destination 生命周期、备份调用、结果汇总和退出码；不直接拼 SQL。
- **Database verifier:** 只负责普通文件检查、只读连接、schema/table/row/hash/integrity 验证，返回结构化结果；不得创建目录或数据库。
- **Migration guard:** 只负责 migration transaction、目标 schema 预检和版本 marker 提交顺序；不得承担 CLI 输出格式化。
- **CLI adapters:** 只负责参数解析、调用上述服务和安全摘要输出；不得把 SQLite 原始异常或绝对路径写入用户输出。
- **Recovery fixtures:** 只生成临时数据库、WAL、损坏副本和权限场景；不得引用任何 production path。

新增模块以单一职责为准，约 200 行作为软上限；若验证逻辑继续增长，应按“文件检查 / schema 验证 / 数据统计”拆分，而不是扩张 CLI 或 repository 类。

## Acceptance criteria

- [x] Backup 完成后关闭或隔离 source connection，并对 destination 重新打开执行普通文件、schema、关键表、记录计数、hash 和 integrity 验证。
- [x] destination 不存在、不是普通文件、不可读、被截断、损坏或磁盘写满时命令返回非零结果，并明确标记备份不可恢复。
- [x] restore-check 对不存在路径直接拒绝，执行前后都不存在该路径；不会创建目录、SQLite 文件、schema marker 或 migration 记录。
- [x] restore-check 只读取隔离副本，不持有 production database lock，不执行写事务，不改变 WAL/checkpoint 状态。
- [x] 已知 schema v1/v2 的验证结果可区分；未知版本、缺表、缺列和完整性错误统一 fail-closed。
- [x] migration 只有在目标 schema、必需表/列和 integrity 验证成功后才提交版本 marker；失败会 rollback 且允许重复执行。
- [x] WAL 主库、仅 WAL 变更、空库、旧 schema、权限不足、重复 backup/restore-check 和临时目录清理均有测试。
- [x] 隔离恢复演练脚本只能接收显式临时目录，拒绝默认工作目录、用户数据目录和 production 环境变量。
- [x] 测试断言只依赖结构化结果和安全错误码，不依赖完整错误文本或机器绝对路径。

## Evidence

- `npm test`：44 tests passed, 0 failed.
- `node --test tests/backup-restore-migration.test.js`：11 tests passed, 0 failed；覆盖 destination 重开验证、重复 backup/restore-check、WAL/截断/空库/v1/权限/ENOSPC/损坏/未知 schema、migration rollback/retry 和临时目录清理。
- `npm run recovery-drill -- --temp-root <system-temp-directory>`：临时目录隔离演练通过；WAL source、source-open restore-check、backup restore-check 和损坏副本均获得结构化结果，演练目录已清理。

## Implementation notes

- 保持 Node + SQLite 单实例和现有 repository/application interface 不变。
- 不在真实 Auth 数据库执行恢复、破坏性 migration 或演练；完成证据必须来自临时 fixture。
- 备份 destination 的加密、远端保留和 RPO/RTO 属于运维决策，不在此 ticket 擅自增加存储服务。
