# 工作区重复迁移导致启动失败（2026-09-17）

## 范围与原因

修复已有删除事实被重复导入时整个工作区无法启动的问题。
扫描指纹包含不参与导入的文章；这些内容变化后生成新的迁移批次，
但删除事实与历史 verified 批次完全相同。新批次导入触发
`MIGRATION_IMPORT_ARTICLE_CONFLICT`，可能停在 confirmed。

## 实现与边界

- OperationalStore 的只读 journal inspector 同时提供 verified 批次的持久导入事实。
- 启动 composition 仅复用全部由删除冲突组成、与某个 verified 批次完整相等的计划。
- 必须同工作区、同 sourceVersion，无 corrupt/unplanned；其他未完成批次不放行。
  仅允许当前完全匹配的新批次停在尚未提交导入的 detected/backed_up/confirmed。
- 使用既有 backup verifier、数据库 verifier 和 migration verifier 重新核对历史证据。
  备份或 verification fingerprint 不符不会放行。
- 不更新 journal 阶段、不插入重复事实、不删除凭证、不更改 schema，
  不扩大到发布/订单事实的重复迁移。历史 confirmed 记录保留其真实阶段。

修改文件：workspace-migration-composition.js、
operational-store-migration-journal-inspector.js、workspace-migration-duplicate.test.js。

## 验证与审查

合成数据回归覆盖新扫描、已 confirmed 的重复批次、事实变化、损坏来源、
损坏备份、损坏 verification fingerprint、未验证导入。
用 Git HEAD 原 composition 在内存中运行新增测试，两个正常重复场景均失败；
最终实现的七个场景全部通过。

Primary review 检查 journal/事实 owner、锁内检查、只读复用、完整事实比较及失败关闭。
Bounded review 确认范围限制在删除事实，补充 verification 损坏负例，无剩余阻塞项。

真实 xmq 只读探测：替换 lease 获取为空操作，并把 backup.ensure 和
createMigrationFacade 替换成直接抛错，防止任何写入路径；返回
`allowed=true / verified_import_reused`。未启动完整真实 runtime，未运行真实迁移、
发布、付费；最终界面需开发版主进程重启后确认。

最终验证：

- `node --test tests/workspace-migration-duplicate.test.js`：7/7 PASS。
- `node --test tests/article-lifecycle-ticket-23-a.test.js tests/article-lifecycle-ticket-23-b.test.js tests/article-lifecycle-ticket-23-c.test.js tests/article-lifecycle-ticket-23-d.test.js tests/ticket-25-e-migration-acceptance.test.js`：50/50 PASS。
- `npm run lint`、`npm run typecheck:main`、`git diff --check`：PASS。
- `npm run test:integration`：227 文件、1227/1227 PASS，0 skipped/todo，178.123 秒。
  原生 evidence：`auto—publish/build/test-results/integration-timings.json`（不提交）。

未执行打包/release；此次不改 Renderer 或 preload，无需重建这些产物。
未 stage/commit/push，保留用户原有 pelican-bicycle.html 删除及 work/ 未跟踪目录。
