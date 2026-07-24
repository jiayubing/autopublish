# 目标架构与权威状态

## 1. 目标依赖方向

```text
Renderer View
  → Renderer Feature Module
  → Typed Preload / IPC Adapter
  → Application Module
  → Domain Module
  → OperationalStore / ContentStore / Publisher interfaces
  → SQLite / filesystem / external-platform adapters

Electron Composition Root
  → creates adapters
  → creates application modules
  → registers IPC
  → owns start/dispose
```

禁止方向：

- Domain module不得引用Electron、IPC、React、Playwright、文件路径或数据库implementation。
- Application module不得引用renderer或具体外部平台implementation。
- `src`内层不得引用`desktop`implementation。
- Adapter不得调用renderer、决定publication状态或自行归档。
- Renderer不得读取workspace文件、数据库或平台adapter。
- IPC adapter不得编排ledger、batch、archive或重试。

## 2. 核心深module

### PublicationWorkflow

拥有一次发布用例的完整本地协调语义：目标身份、重复保护、attempt、远端前意图、publisher调用、outcome持久化、后处理排队、恢复和人工核对。

推荐外部interface：

```ts
interface PublicationWorkflow {
  publish(command: PublishCommand): Promise<PublishResult>;
  recover(): Promise<RecoverySummary>;
  reconcile(command: ReconcileCommand): Promise<ReconcileResult>;
}
```

caller不应知道事务顺序、锁、batch写入、archive条件或attention派生规则。publisher adapter、clock、OperationalStore和后处理器属于implementation的internal seams。

### OperationalStore

拥有运行协调状态的SQLite事务、schema迁移、备份、恢复检查和查询。它不是为每张表暴露CRUD的repository集合；上层通过围绕业务意图的小interface修改聚合。

推荐能力按事务用例组织：

- 创建发布意图并拒绝重复目标。
- 原子提交远端outcome和证据。
- 领取/完成可恢复后处理。
- 创建、领取和更新batch item。
- 查询需要恢复或人工核对的聚合。
- 导入旧记录、生成迁移报告、验证schema和备份。

### PlatformRun

拥有一个平台执行run的runId、child、watchdog、heartbeat、abort、stop、cleanup、snapshot和terminal transition。任何callback只捕获自己的不可变run context，不读取“当前全局run”的可变字段。

### Renderer Feature Module

每个业务feature拥有自己的查询参数、request identity、snapshot、command状态、invalidation和dispose。View只渲染snapshot和发送命令，不解释跨module业务规则。

### ContentIdentity

统一解析ClientId、ArticleId、GenerationTaskId、TemplateId和磁盘位置。逻辑identity与路径、显示名、远端ID使用不同类型和命名，不允许caller自行拼目录。

## 3. Publisher interface

平台adapter满足同一个interface，但平台DOM、HTTP和Python细节留在各自implementation内。

```ts
interface Publisher {
  inspectAccount(): Promise<AccountEvidence>;
  publish(input: PublishInput, signal: AbortSignal): Promise<PublishOutcome>;
}

type PublishOutcome =
  | { status: "published"; evidence: RemotePublicationEvidence }
  | { status: "submitted"; evidence: RemoteSubmissionEvidence }
  | { status: "failed"; error: SafeOperationalError }
  | { status: "uncertain"; error: SafeOperationalError; evidence?: PartialEvidence };
```

不变量：

- `published`必须有与当前文章、目标、账号和attempt绑定的远端发布证据。
- POST可能到达远端后的timeout、断连、worker强杀或无法解释的页面状态必须是`uncertain`。
- `failed`只表示有证据证明远端未成功或请求在远端调用前失败。
- outcome不得包含Cookie、API key、全文、原始DOM、绝对路径或整页截图。
- Adapter不修改OperationalStore、batch、archive或attention。

## 4. 权威状态表

| 事实 | 权威owner | 持久介质 | 非权威projection |
|---|---|---|---|
| 文章正文、标题、来源快照 | ContentStore | Markdown/sidecar文件 | Renderer文章列表 |
| 客户、资料、模板 | 对应Content module | 文件 | Renderer目录树 |
| 发布目标与发布记录 | OperationalStore | workspace SQLite | 文章流程阶段 |
| 发布尝试与远端证据 | OperationalStore | workspace SQLite | 结果计数、状态标签 |
| 发布恢复意图 | OperationalStore | workspace SQLite | attention |
| submission batch/item | OperationalStore | workspace SQLite | 平台运行快照 |
| 媒体订单remote reference | OperationalStore | workspace SQLite | 订单列表 |
| 后处理/归档待办 | OperationalStore | workspace SQLite | attention |
| 远端真实结果 | 外部平台 | 外部平台 | 本地证据化状态 |
| 当前运行run | PlatformRun | 内存；必要摘要入SQLite | Renderer运行快照 |
| 需处理项 | AttentionQuery | 实时查询/派生 | Renderer attention列表 |
| 认证与授权 | Auth Domain | 独立auth SQLite | 桌面认证快照 |

Attention不得成为第二份持久publication事实；它必须能从OperationalStore和ContentStore重新派生。

## 5. Workspace SQLite

建议位置：内容库内部固定私有目录，例如`.autopublish/operations.db`。最终路径由阶段2确定并通过路径安全测试，不允许renderer或平台adapter接收数据库绝对路径。

概念schema至少包含：

- `schema_migrations`
- `publication_records`
- `publication_attempts`
- `remote_evidence`
- `recovery_intents`
- `submission_batches`
- `submission_items`
- `remote_orders`
- `post_processing_jobs`
- `account_profiles`

不建议持久化attention列表；它应通过查询生成。是否增加审计event表由阶段2根据恢复和诊断需要决定，不为了“事件驱动”而默认事件溯源。

### 外部调用事务顺序

1. SQLite事务A验证target并写入attempt和`remote_started` recovery intent。
2. 提交事务A。
3. 调用publisher adapter。
4. SQLite事务B提交outcome、证据和后处理job。
5. 后处理job归档/清理本地队列，失败可重试。
6. 重启后扫描未终结intent；不能证明结果时派生`uncertain`并阻断新attempt。

绝不能跨远端调用持有SQLite事务。

## 6. 身份规则

- `ClientId`不是目录名。
- `ArticleId`在内容库内稳定，不由文件名临时推导。
- 普通平台target key至少包含`platformId + accountProfileId`。
- 媒体target key至少包含`mediaResourceId`，不退化为`platformId:"media"`。
- `AttemptId`只标识一次执行或核对，不改变文章—目标聚合identity。
- RemoteId只作为证据，不替代本地ArticleId或PublicationId。
- 旧平台记录无法确定账号时迁移为`legacy-unknown-account`并阻断自动执行，等待人工绑定。

## 7. 错误协议

所有跨进程和跨网络错误转换为安全、稳定的错误对象：

```ts
type SafeOperationalError = {
  code: string;
  category: "validation" | "authentication" | "transport" | "remote" | "storage" | "conflict" | "internal";
  retryability: "never" | "safe" | "manual-check";
  userMessage: string;
  diagnosticId?: string;
};
```

原始Error、stack、绝对路径、Cookie和响应正文只允许进入经过脱敏的本地诊断记录，不通过IPC回传renderer。

## 8. 目标目录方向

目录调整随module切换进行，不先做全仓搬家。目标形态可以逐步收敛为：

```text
auto—publish/
  src/
    domain/                 # 纯领域状态、identity、不变量
    application/            # PublicationWorkflow等用例module
    infrastructure/
      operational-store/    # SQLite implementation与migration
      content-store/        # 文件内容implementation
      publishers/           # 平台adapter
  desktop/
    composition/            # 唯一组合根
    ipc/                    # typed IPC adapters
    worker/                 # PlatformRun执行implementation
  media-workbench/src/
    features/               # renderer feature modules和views
    bridge/                 # typed preload client
```

若移动只改变路径而不改善interface、依赖方向或测试surface，则不做该移动。

## 9. 类型策略

- 新的identity、command、result、outcome、IPC DTO和schema定义使用严格TypeScript或可由现有runtime直接验证的共享schema。
- 不为了类型迁移一次性重写全部CommonJS。
- 每个旧module被替换时再迁移其production seam；阶段验收必须包含真实Electron/worker打包测试。
- IPC、数据库、worker message和外部网络数据必须运行时验证，TypeScript类型不能代替验证。

## 10. 删除测试

一个新module只有在满足“删除它会让复杂性重新散回多个caller”时才值得存在。纯转发wrapper应合并或删除。测试通过module interface验证可观察结果；当新interface测试稳定后，读取旧implementation内部结构的测试应删除而不是永久叠加。

