# 阶段5：内容身份、交接与删除生命周期

## 1. 阶段目标

收敛客户、文章、生成任务、投稿交接、草稿、回收站和永久删除的identity与生命周期。文件内容继续保留，但所有caller通过深Content modules解释逻辑identity、路径和跨publication约束，不再自行拼目录或扫描全库猜测唯一性。

关联工作：OPT-012、016、017、018、019、025；覆盖F-H02、F-M09～M12、F-M15。

## 2. 开始条件

- 阶段4为`COMPLETE`或其代码完成且仅剩明确的外部人工验收。
- PublicationWorkflow/OperationalStore和account-aware target稳定。
- 平台adapter不再直接解释文章文件、trash或生成任务。

## 3. 必读输入

- 总纲、目标架构、协议、进度账本和阶段3/4交接。
- 根及应用CONTEXT、现有内容/删除ADR。
- M03、M14、M15、M17、M18、M19、M20、M21、M23 module报告。
- ArticleStore、client knowledge/material/question、generation batch/handoff、submission preparation、trash/removal、attention查询和ArticleEditor。
- OPT-012、016～019、025。

## 4. 允许修改

- ContentIdentity、ContentStore、GenerationHandoff、Trash/Removal modules。
- 文章/客户文件schema及必要的一次性迁移；必须保留内容备份和dry-run。
- 与OperationalStore查询publication约束的application seam。
- 对应IPC command/DTO，但不重构Renderer页面结构。
- 内容、迁移、删除恢复、容量和排序测试。

## 5. 禁止修改

- PublicationWorkflow状态机和平台adapter。
- 把文章正文迁入operations SQLite。
- 根据目录名、文件名或标题重新定义稳定identity。
- 自动删除重复/损坏内容来“修复”迁移。
- 无fingerprint重验的破坏性恢复。

## 6. 实施步骤

### 6.1 建立ContentIdentity module

- ClientId到真实目录只有一个resolver。
- ArticleId到文章位置只有一个resolver/query。
- GenerationTaskId查询返回0/1/many闭集结果；many是冲突，不自动选第一条。
- 路径解析验证普通文件/目录、workspace包含关系、symlink和重复metadata。
- Caller只传逻辑identity，不传自行拼接路径。

### 6.2 深化ContentStore

围绕用例提供interface，例如读取文章聚合、保存草稿、列出稳定排序、查询generation identity、创建内容快照。隐藏journal、备份、文件命名和metadata细节。

默认历史排序固定为createdAt倒序和稳定tie-breaker；编辑/审核不改变创建顺序。需要“最近更新”时作为独立查询，不污染默认语义。

### 6.3 修正草稿生命周期

- Editor初始化真实`remark/ignoreImages`等全部字段。
- Dirty根据初始快照和当前值计算。
- 直接打开关闭不写盘。
- 保存失败不关闭、不清dirty，并返回安全错误。
- 客户/文章切换结束旧编辑会话，旧保存结果不能写新文章。

### 6.4 重构GenerationHandoff

- Handoff只接受稳定ArticleId/GenerationTaskId和明确targets。
- ContentStore生产interface必须提供唯一查询，不允许测试double比production adapter能力更强。
- Duplicate task产生可见conflict，不自动入队。
- Handoff调用PublicationWorkflow/Submission application seam，不自行写batch/sidecar/ledger。
- 批次一次建立索引，避免N×M全库扫描。

### 6.5 重构Trash confirmation

- Prepare返回绑定ArticleId、tombstone fingerprint、deletedAt/version和TTL的一次性token。
- Execute重新读取并比较当前tombstone；旧token、过期token和新版本均拒绝。
- 双窗口、restore→retrash、重复点击和客户端切换均测试。
- Token只存在内存，不成为长期授权。

### 6.6 重构Removal recovery

- Removal transaction每一步保存稳定identity、fingerprint、cursor、attempt和错误类别。
- Bounded backoff scheduler由workspace生命周期owner管理，启动后自动恢复，不依赖重启。
- 达到最大次数进入`needs_repair`并派生attention。
- 每次恢复破坏性步骤前重新验证publication状态、内容identity和fingerprint。
- Scheduler dispose后不再I/O；同事务不能被两个runner领取。

### 6.7 删除旧路径

- 删除caller自行拼`clients/<id>`路径。
- 删除可选`findByGenerationTaskId`降级逻辑。
- 删除无版本trash token。
- 删除只在启动执行一次的伪auto-recovery。
- 删除按updatedAt实现默认创建顺序的测试/implementation。
- 新interface测试稳定后删除旧store内部结构测试。

## 7. 数据迁移

如文章/client metadata需增加或规范identity：

- Dry-run列出无ID、重复ID、目录冲突、损坏metadata和将写入记录。
- 绝不通过文件名相似或标题猜测identity。
- 冲突内容保留原位并生成repair report。
- 正式迁移写新文件后验证，再原子替换；保留整个内容库快照。
- Operations SQLite引用同步更新必须在应用关闭的迁移事务中完成。

## 8. 测试要求

- 目录名不等于ClientId的全链测试。
- ArticleId和GenerationTaskId的0/1/many测试。
- 路径越界、symlink、损坏/重复metadata。
- Draft open/close/save fail/client switch交错。
- Generation handoff duplicate和500/5000任务容量。
- Trash token TTL、版本、双窗口、restore/retrash。
- Removal fake clock、backoff、强杀、重复runner、needs_repair。
- Publication active/uncertain时删除阻断。
- 内容迁移dry-run、冲突和回滚。

## 9. 完成条件

- 所有内容caller使用ContentIdentity/ContentStore interface，不自行拼路径。
- Production唯一查询与测试能力一致。
- 草稿无打开关闭清零，失败保持可恢复。
- Handoff不写publication/batch内部状态。
- 旧trash token不能作用于新tombstone。
- Removal无需重启自动恢复且有上限、幂等和attention。
- 默认文章排序稳定且符合CONTEXT。
- 所有迁移冲突保留并可人工修复。

## 10. 停止条件

- 需要通过标题、目录名或列表第一项猜测identity。
- ContentStore interface暴露journal/备份/路径顺序给caller。
- 自动恢复可能重复执行永久删除。
- Operations SQLite和文件迁移无法在一个停机步骤保持引用一致。
- 发现用户内容需要删除才能通过测试。

## 11. 交接重点

记录ContentIdentity/ContentStore interface、迁移报告格式、删除恢复状态机、scheduler owner、所有破坏性command、旧路径删除清单和阶段6可安全消费的content DTO。

