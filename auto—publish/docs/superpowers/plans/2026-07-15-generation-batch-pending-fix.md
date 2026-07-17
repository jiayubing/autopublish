# 批量生成永久 Pending 修复计划

## 目标

修复批量文章生成任务始终停留在 `pending`、点击“继续未完成”确认后无反馈，以及恢复批次时页面步骤显示错误的问题。

## 已确认根因

- `generation-batch-runner` 调用文章查重回调时只传入 `task.id`。
- `content-generation-batch-service` 的查重回调需要完整 `task`，以获得 `clientId` 和任务 ID。
- 查重在任务认领前报错后被 runner 静默吞掉，导致任务保持 `pending`、`attempts` 保持 0，AI 从未被调用。
- 批次监控与四步新建向导共用同一页面，但恢复批次时 `step` 仍默认为 0，因此错误显示为“选择批次客户”。

## 实施任务

### 任务一：建立回归测试

**修改文件：**

- `tests/content-generation-batch-service.test.js`
- `tests/generation-batch-runner.test.js`

**步骤：**

1. 使用真实 service 与真实 runner 创建一个 pending 任务。
2. 使用需要 `clientId` 的文章查重存储模拟真实调用。
3. 断言修复前任务保持 `pending`、`attempts = 0`、AI 调用次数为 0。
4. 增加继续未完成批次和查重异常场景。

**通过标准：**

- 回归测试在修复前稳定失败，并准确复现用户看到的状态。
- 测试不调用真实 AI，也不读取真实客户资料。

### 任务二：修复查重契约与异常状态

**修改文件：**

- `src/content/generation-batch-runner.js`
- `desktop/services/content-generation-batch-service.js`

**步骤：**

1. 统一注入查重回调的参数为完整任务对象。
2. runner 直接调用 article store 时继续使用任务 ID，明确区分两种接口。
3. 查重或任务认领前发生异常时，记录安全错误并更新任务/批次状态，不再静默吞掉。
4. 保持 succeeded 任务幂等跳过，继续操作只处理 pending、failed 和 interrupted。

**通过标准：**

- 正常任务从 `pending` 进入 `running`，最终进入 `succeeded/completed`。
- 已存在文章时不重复调用 AI。
- 异常任务不会无错误地永久停留在 `pending`。
- 错误信息不包含 API Key、客户正文或完整 Prompt。

### 任务三：修复继续操作的反馈与刷新

**修改文件：**

- `desktop/ipc/content-generation-batch-ipc.js`
- `media-workbench/src/electron-api.ts`
- `media-workbench/src/components/content/BatchGenerationView.tsx`
- `tests/content-generation-batch-ipc.test.js`

**步骤：**

1. 验证 `batchId` 和 `confirmConfigChange` 能完整传递到 service。
2. 点击确认后立即显示处理中状态。
3. 操作完成后主动重新读取批次，同时保留事件订阅刷新。
4. 将操作错误显示在批次控制区域附近。

**通过标准：**

- 点击确认后立即出现可见反馈，且不会重复提交。
- 成功后任务计数和状态及时更新。
- 失败时页面显示稳定错误信息，不再表现为“没有任何反应”。

### 任务四：修复步骤和批次状态显示

**修改文件：**

- `media-workbench/src/components/content/BatchGenerationView.tsx`
- `media-workbench/src/components/content/GenerationBatchDetail.tsx`
- `tests/renderer-batch-generation.test.js`

**步骤：**

1. 区分新建批次向导与已有批次监控状态。
2. 加载或启动批次后显示批次监控，不再同时显示第 1 步选择页面。
3. runtime state 只在其 `batchId` 与当前批次一致且非 idle 时覆盖持久化状态。
4. 在终态批次上提供返回新建向导的入口。

**通过标准：**

- 恢复 pending/failed/interrupted 批次时直接显示批次进度。
- 页面步骤与实际业务阶段一致。
- 应用重启后显示持久化的真实批次状态。
- completed/stopped 后可以开始新批次。

### 任务五：完整验证

依次运行：

```powershell
node --test tests/generation-batch-runner.test.js tests/content-generation-batch-service.test.js tests/content-generation-batch-ipc.test.js tests/renderer-batch-generation.test.js
npm test
npm run build:renderer
npm run verify
npm run pack:alpha
```

**最终通过标准：**

- 所有测试 0 失败。
- lint、renderer build、verify 和 alpha 打包通过。
- 模拟批次能从 pending 正常执行到 completed。
- 配置错误和存储错误都有可见状态与恢复入口。
- 现有 pending 批次无需迁移；修复后可直接点击“继续未完成”。
- 未经明确确认，不使用真实 AI 接口执行付费验收。

