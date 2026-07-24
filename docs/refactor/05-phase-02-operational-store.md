# 阶段2：SQLite运行状态存储

## 1. 阶段目标

实现并验证workspace OperationalStore：schema、事务、不变量、迁移、备份、恢复检查和查询能力。阶段结束时它已具备production质量，但尚不自动迁移真实workspace；现有production publication writer在阶段3切换前继续作为唯一writer，新SQLite仅由测试和显式migration CLI使用。

关联工作：重构OPT-002、OPT-009、OPT-013的持久化implementation基础。

## 2. 开始条件

- 阶段1为`COMPLETE`。
- Identity、target、Publisher outcome、安全错误和主进程构建方式已经冻结。
- Electron runtime的`node:sqlite`可用性检查进入自动测试。

## 3. 必读输入

- 总纲、目标架构、执行协议、进度账本和阶段1交接。
- ADR-0003、ADR-0004及阶段1新增类型策略ADR。
- M03、M11、M18、M20、M22、M23、M27、M29 module报告。
- 当前publication ledger、batch store、order JSONL、queue sidecar、workspace paths、atomic file helpers和legacy migration。
- OPT-002、003、009、010、013、014的目标/测试/回滚要求。

## 4. 允许修改

- OperationalStore interface和SQLite implementation。
- Versioned schema migrations、migration CLI、dry-run、backup/restore verifier。
- 隔离fixture、fault injection和migration测试。
- Workspace composition中“仅显式开启/测试”的OperationalStore构造能力。
- 路径安全、打包和runtime capability tests。

## 5. 禁止修改

- 自动打开真实用户workspace并迁移。
- 切换现有publication/batch/order production caller。
- 平台adapter、renderer业务行为和Auth数据库schema。
- 删除或写回旧JSON/JSONL记录。
- 引入ORM、事件总线或与当前用例无关的通用repository框架。

## 6. 存储架构约束

- 数据库位于内容库私有目录，路径由workspace path module唯一生成。
- Electron main进程是运行期唯一write connection owner；worker和renderer不得打开写连接。
- Migration CLI只能在应用关闭且持有独占migration lease时写入。
- 启用`foreign_keys`，明确journal mode、busy timeout、同步级别和checkpoint策略并用故障测试证明。
- 事务不得跨网络、child process等待或文件复制。
- 所有时间使用统一clock，所有ID使用阶段1类型。
- Attention不持久化为独立事实表。

## 7. 实施步骤

### 7.1 设计schema和不变量

至少实现目标架构列出的核心表。对每张表写清：

- 主键和业务唯一键；
- 外键和删除策略；
- 状态闭集和合法transition；
- attempt、target、account和remote evidence关系；
- batch item revision/claim语义；
- recovery intent和post-processing job的领取/重试语义；
- 敏感字段禁止清单。

不要把旧JSON结构逐字段照搬进数据库。Schema围绕业务查询和事务不变量设计。

### 7.2 实现OperationalStore深module

上层不得获得裸database handle或表级CRUD。Interface围绕以下用例：

- reserve publication target并创建attempt；
- commit remote outcome；
- query actionable recovery；
- enqueue/claim/complete post-processing；
- create/claim/update submission items；
- attach remote order evidence；
- derive attention input；
- verify/backup/close。

复杂SQL、transaction顺序、retry和constraint mapping隐藏在implementation内。

### 7.3 建立迁移器

迁移器读取当前publication records、submission batches/sidecars和order JSONL，产生确定性migration plan：

- 输入文件和记录计数；
- 成功映射数；
- 重复/冲突/损坏数；
- unknown account数；
- remote ID缺失数；
- 将生成的target/attempt/batch/order数；
- 不会自动迁移的人工项。

Dry-run只读且重复输出一致。正式迁移写入全新数据库临时路径，验证通过后原子切换；不得在半成品数据库上继续运行应用。

### 7.4 建立备份与恢复验证

- 备份后重新打开destination并验证schema、foreign keys、行数、关键hash和只读查询。
- 缺失、目录、symlink、损坏、截断和权限错误必须失败且不创建“健康空库”。
- 恢复检查只读，不能自动migration。
- 失败不删除源、备份或migration report。

### 7.5 建立运行期写入所有权

通过测试证明：

- 同一workspace只创建一个write owner。
- worker/renderer无法构造write adapter。
- 重复启动、异常dispose和强杀后数据库可重新打开。
- Migration CLI与运行应用互斥。
- 不再需要每publication文件锁；阶段3切换后旧锁将整体删除。

### 7.6 建立容量基线

使用合成数据至少覆盖：

- 1万publication records；
- 每记录多attempt；
- 500～5000 batch items；
- 大量attention查询；
- 重复远端证据和order引用；
- checkpoint和关闭重开。

记录事务延迟、数据库大小和主要查询计划，但不为没有真实需求的极端规模优化。

## 8. 必须测试的故障点

- migration开始前、中间、commit前、rename前后强杀。
- 数据库满、只读、损坏、WAL残留、backup destination错误。
- 重复migration和重复import。
- 两个write owner竞争。
- duplicate target、attempt、remote ID和batch revision冲突。
- unknown account和旧media target缺资源。
- 敏感字段写入拒绝。
- 关闭后句柄、timer和WAL文件收敛。

## 9. 阶段验证

- 运行阶段0全局门禁。
- 运行全部OperationalStore单元、事务、迁移、并发、容量和故障注入测试。
- 对合成旧workspace执行dry-run→正式迁移→验证→备份→恢复副本→再次验证。
- 运行`electron-builder --dir`并证明`node:sqlite`在最终Electron runtime可加载。
- 静态检查worker/renderer无数据库write import。

## 10. 完成条件

- OperationalStore通过完整interface提供能力，不暴露裸SQL/CRUD给caller。
- Schema v1及每个migration有up、验证、失败恢复和重复执行测试。
- 合成workspace迁移零数据丢失，冲突全部显式报告。
- 备份验证destination而非source；restore-check零副作用。
- Main-only write ownership有静态和运行测试。
- 当前production业务仍只有旧writer，且没有自动创建新数据库；不存在双写。
- 阶段3切换清单明确列出每个旧store/caller和对应新事务。

## 11. 停止条件

- Electron production runtime不能稳定使用`node:sqlite`。
- Schema需要把文章全文、Cookie或API key写入operations数据库。
- 无法用一个事务关闭当前跨文件lost-update窗口。
- 迁移冲突被静默跳过或自动猜测账号/远端结果。
- Restore verifier会创建或修改被验证目标。

## 12. 交接重点

交接包括schema版本、ER关系、不变量、OperationalStore interface、migration CLI用法、合成fixture路径、容量数据、所有旧store映射表、阶段3切换顺序和已知人工迁移项。

