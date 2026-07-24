# M29 Auth repository/migration/admin/DR 深度审查

> 状态：已完成（2026-07-24）。

## 模块职责和边界

M29 管理 auth SQLite schema/migration、管理员 CLI、在线备份和恢复检查。数据库 schema v2 是认证服务的权威持久化；备份目标、恢复隔离路径和运维权限属于部署边界。

## 已检查目录与关键文件

- `auth-server/src/repositories/sqlite-auth-repository.js`、`migrations/001-auth.sql`、`002-multi-user.sql`。
- `auth-server/scripts/migrate.js`、`backup.js`、`restore-check.js`、`apctl.js`/`authctl.js`、`Dockerfile`/compose。
- `auth-server/tests/*` 全部 repository、CLI 和 API 测试。

## 发现列表

### TEMP-M29-01：备份成功后校验的是源 repository，不是备份目标

- 分类：灾备 / 数据完整性
- 严重程度：高
- 置信度：高
- 位置：`auth-server/scripts/backup.js:9-13`
- 问题：`backupTo(destination)` 完成后调用 `repository.healthCheck()`，该 repository 仍打开源 `source` 文件；目标文件不存在、路径不可读或目标内容损坏时，命令仍可能报告成功。
- 修复方向：关闭源库后对 destination 以只读/隔离方式打开并执行 schema、integrity、数据量/关键表校验；失败时明确拒绝将备份标记为可恢复。

### TEMP-M29-02：restore-check 对不存在路径会创建并初始化空库

- 分类：灾备 / 运维安全
- 严重程度：高
- 置信度：高
- 位置：`auth-server/scripts/restore-check.js:4-12`；`sqlite-auth-repository.js` 构造函数及 `ensureDirectory/applyMigrations`
- 问题：检查脚本直接构造 `SqliteAuthRepository`。不存在的路径会创建目录、SQLite 文件并运行 migration，随后 `healthCheck` 通过；操作员可能把“恢复检查通过”误认为已验证备份，实际检查的是新建空库。
- 修复方向：restore-check 首先要求目标文件已存在且为普通文件，复制到隔离临时路径后再打开；输出 schema version、关键表和记录计数，禁止检查命令隐式创建数据库。

## 其他核对

迁移对未知 schema、旧 legacy users 表和完整性错误采取 fail-closed；事务使用 `BEGIN IMMEDIATE`，WAL/foreign keys/busy timeout 已配置。备份频率、目标加密/保留、磁盘满/WAL 恢复、v1→v2 真实数据迁移和隔离启动演练没有仓库证据。

## 测试情况

repository schema、CLI 和认证行为测试通过；没有“备份目标损坏仍失败”或“restore-check 缺失文件拒绝且不创建”测试。

## 模块审查结论

M29 深审完成，保留 TEMP-M29-01、TEMP-M29-02 两条高风险灾备 finding；当前不能宣称已验证 RPO/RTO 或可回滚恢复。
