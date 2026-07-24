# M14 客户资料、问题、研究与模板深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M14 负责发现客户及其资料目录，解析和缓存客户材料，持久化问题与研究答案，以及合并只读内置模板和客户自定义模板。客户身份由 `client.json.id` 表示，目录名只是物理位置；生成和豆包采集通过这些 store 取得来源，但不应自行推导客户路径。

十项维度已覆盖：客户/问题/研究/模板的 schema 和路径边界、symlink 防护、缓存失效、原子写、重复身份、模板来源合并、损坏记录错误语义、生成调用方和豆包调用方均已核对。发现问题 store 违反逻辑客户 ID 与目录名可分离的契约。

## 已检查目录与关键文件

- 全部生产文件：`src/content/client-knowledge.js`、`client-material-store.js`、`question-store.js`、`research-store.js`、`template-catalog.js`、`template-store.js`。
- 直接边界：`desktop/services/ai-content-service.js`、`desktop/services/doubao-collection-service.js`、对应 content/Doubao IPC、`desktop/workspace-runtime.js`、`src/core/files.js`。
- 契约与资源：`docs/content-workspace-contract.md`、`docs/content-generation-operations.md`、`resources/content-templates/`。
- 相关测试：`client-{knowledge,material-store}.test.js`、`question-store.test.js`、`research-store.test.js`、`template-{catalog,store,generation-contract}.test.js`，以及相关 renderer 客户切换/模板发现测试。

## 关键调用链

1. content IPC → `ai-content-service.listClients` → `client-knowledge.listClients` → renderer 持有逻辑 `Client.id`。
2. 资料生成 → `client-material-store` → `clientKnowledge.getClient(clientId)` → 使用返回的真实 `client.directory` 读取并缓存材料。
3. 豆包 IPC → desktop Doubao service → `question-store(clientId)` → 问题队列 → research store。
4. 模板发现 → template catalog/store → 内置模板与客户模板合并 → prompt builder 保存模板快照。

## 候选发现

## TEMP-M14-1：问题存储把逻辑客户 ID 当目录名，合法客户无法进入采集链

- 分类：正确性 / 身份与路径契约
- 所属模块：M14 客户资料、问题、研究与模板；连带影响 M16 豆包采集
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/docs/content-workspace-contract.md:106-117`；`auto—publish/src/content/client-knowledge.js:153-176,248-286` `getClient/listClients`；`auto—publish/src/content/question-store.js:64-74,136,220` `clientDirectory`；`auto—publish/desktop/services/doubao-collection-service.js:30,60-61`
- 问题描述：契约明确 `Client.id` 不要求等于目录名，客户发现也会返回 `client.json.id`；问题 store 却直接计算 `workspace/clients/<clientId>`，没有通过客户目录解析器查找真实目录。
- 代码证据：`listClients` 的 DTO 使用 metadata `id` 和实际 `directory`；`question-store.clientDirectory` 对传入 ID 执行 `path.join(clientsRoot, clientId)` 并要求该物理目录存在。资料 store 正确调用 `clientKnowledge.getClient`，说明二者路径模型不一致。
- 触发条件：客户目录名与 `client.json.id` 不同，例如目录 `folder-name`、逻辑 ID `logical-id`，用户从正常客户列表选择该客户后打开问题或豆包采集功能。
- 可达路径或调用链：renderer `content:list-clients` → 选择返回的 `logical-id` → Doubao IPC → `doubao-collection-service.listQuestions` → `questionStore.listQuestions("logical-id")` → `CLIENT_NOT_FOUND`。
- 实际影响：无法列出、新建、编辑或采集该客户的问题；客户资料本身仍可由 material store 读取，造成同一客户部分功能正常、部分功能失败。
- 影响范围：所有逻辑 ID 与物理目录名不同的客户；目录名恰好等于 ID 的现有工作区不受影响。
- 现有测试是否覆盖：客户发现和问题 store 各自有测试，但没有把“目录名≠逻辑 ID”的客户列表 DTO 接入真实 question store，因此未覆盖跨模块契约。
- 验证方法与结果：在临时工作区创建 `clients/folder-name/client.json`，写入 `id:"logical-id"`；`listClients()` 返回 `logical-id`，随后真实 `createQuestionStore(root).listQuestions("logical-id")` 抛出 `CLIENT_NOT_FOUND`。复现退出码 0。
- 修复方向：question store 应通过共享 client resolver 将逻辑 ID 映射到受信任的实际目录；保留 realpath/越界检查，并增加目录名与 ID 不同的集成测试。
- 关联发现：M16 的问题输入链依赖本缺陷；不另建重复的 M16 finding。

## 测试情况

- M14–M21 联合定向测试：313 个测试，308 通过、0 失败、5 跳过，退出码 0。
- 最小复现确认跨 store 身份契约失配，不依赖 mock。
- 现有单元测试充分覆盖路径穿越、symlink、损坏 JSON 和模板冲突，但缺少逻辑客户 ID 的端到端契约测试。

## 未覆盖区域与待验证

- 未使用真实 DOCX/PDF 大文件做容量压测；材料缓存的格式转换性能属于剩余容量验证。
- 未修改现场客户目录；最小复现仅使用系统临时目录。
- research store 的逻辑 ID 目录是其自身数据分区，不等同于客户物理目录，因此未把它误报为同类缺陷。

## 模块审查结论

M14 达到代码级深审完成门槛，形成 1 条中等严重度候选。资料、研究和模板的输入校验与路径防护总体完整，但问题 store 绕过共享客户目录解析，破坏了已写明的身份模型，并直接阻断 M16 的合法客户采集路径。
