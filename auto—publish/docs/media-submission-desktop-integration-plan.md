# 网站媒体投稿接入与桌面端优化计划

## 目标

把当前工作区已有的网站媒体投稿模块接入 `auto—publish` Electron 自动发文程序，并借这次接入把桌面端从“启动批处理的控制台”升级为“可管理文章、平台、媒体资源、投稿订单和结果复盘的发布工作台”。

## 当前状态

已清理复制进来的 `auto—publish` 目录，保留源码、配置和文档，删除了嵌套 `.git`、Playwright 缓存、历史发布产物、日志、临时目录和依赖目录。

保留的程序结构：

```text
auto—publish/
  config/
  desktop/
  docs/
  input/
  scripts/
  src/
  package.json
  package-lock.json
  CONTEXT.md
```

现有发布程序的核心模型：

- `Source Article`：待发布文章。
- `Publication Platform`：发布平台。
- `Platform Adapter`：平台适配器。
- `Publication Job`：一篇文章投向一个平台的一次发布尝试。
- `Publication Batch`：一组发布任务。
- `Desktop Console`：Electron 操作界面。

媒体投稿新增模型：

- `Media Submission Platform`：通过 API 投稿的平台。
- `Media Resource`：平台内可选择的媒体资源。
- `Media Pool`：常用媒体资源池。
- `Submission Order`：投稿后产生的订单，表示已提交，不等于已发布。

## 关键判断

媒体投稿不应该作为独立脚本挂在桌面端按钮后面，而应该接入现有 `Platform Adapter` 体系。

理由：

- 桌面端已经通过 `createQueueSnapshot()` 和 `runPublicationBatch()` 管理平台、文章和批次。
- 现有 `jobs.js` 把 `publishArticle()` 返回值映射为成功/失败/待人工处理。
- 媒体投稿需要新增“已投稿、待出稿、已发布、失败、退款/取消”等状态，不能简单塞进 `succeeded`。
- 后续第三方自媒体、媒体池、订单同步、价格筛选都属于平台能力，应该沉在 adapter 和 core 里，而不是散落在 UI。

## 分阶段任务

每个任务完成后都要审查、测试、验收，通过后提交 git，再继续下一任务。

### 任务 1：纳入并整理 `auto—publish`

目标：

让 `auto—publish` 成为当前仓库中可维护的子项目。

执行：

- 确认清理后的目录不包含嵌套 `.git`、缓存、历史文章、日志和依赖。
- 修复明显乱码文案，优先处理 `package.json`、`src/core/platforms.js`、`src/core/articles.js`、`desktop/main.js`、`desktop/renderer/app.js`、`desktop/renderer/index.html`。
- 统一 README 或文档入口，说明根目录媒体投稿模块与 `auto—publish` 的关系。

测试：

- `git status --short --ignored`
- `npm test`
- `cd auto—publish && npm install`
- `cd auto—publish && npm run desktop` 或至少启动到 Electron 首页。

验收：

- 复制产物已清理。
- UI 不再出现乱码。
- 桌面端能启动。
- 现有平台配置仍可被读取。

建议提交：

```text
chore(auto-publish): import cleaned desktop publisher
```

### 任务 2：把媒体投稿模块迁入 `auto—publish`

目标：

让媒体投稿能力成为 `auto—publish` 内部能力，而不是根目录旁路脚本。

执行：

- 将当前根目录的媒体投稿核心模块迁入：
  - `src/core/media-client.js`
  - `src/core/article-converter.js`
  - `src/core/submission-store.js`
  - `scripts/media-submit.js`
- 建议迁入到：

```text
auto—publish/src/platforms/media/
  adapter.js
  media-client.js
  media-resource-store.js
  submission-order-store.js

auto—publish/src/core/article-converter.js
```

- 保留根目录脚本作为临时验证入口，或在迁入后移除重复代码。
- 统一模块格式。`auto—publish` 当前是 CommonJS，根目录媒体模块是 ESM，建议第一版改成 CommonJS，避免 Electron 主进程混用成本。

测试：

- 媒体 client mock 测试。
- `.docx/.txt` 转换测试。
- dry-run 投稿测试。

验收：

- `auto—publish` 内部可以独立调用媒体投稿 client。
- API Key 不进入 git。
- 根目录和子项目不再维护两份长期分叉逻辑。

建议提交：

```text
feat(media): move submission client into auto publisher
```

### 任务 3：实现媒体平台适配器

目标：

新增 `src/platforms/media/adapter.js`，让媒体投稿成为 `config/platforms.json` 可启用的平台。

设计：

```js
{
  id: "media",
  scanDir: "media",
  ensureSession(),
  ensureLoggedIn(),
  publishArticle(article, options),
  closeSession()
}
```

媒体平台没有浏览器 session，`ensureSession/ensureLoggedIn/closeSession` 可以是轻量 no-op，但要保留 adapter contract。

`publishArticle()` 行为：

- 读取文章。
- 读取目标 `resource_id`。
- 调用媒体投稿 API。
- 创建 `Submission Order`。
- 返回新的语义结果，例如：

```js
{
  status: "submitted",
  orderNid: "...",
  resourceId: "...",
  raw: {}
}
```

需要同步改造 `jobs.js`，避免把 `submitted` 当成完全 `succeeded`。

测试：

- adapter contract 测试。
- API 成功时返回 `submitted`。
- API 失败时进入 failed。
- 投稿成功后文章是否归档，需要重新定义：建议移动到 `published/` 改为移动到 `submitted/` 或保留在队列并标记订单。

验收：

- `config/platforms.json` 加入 `media` 后，队列快照能看到媒体平台。
- 发布批次能创建媒体投稿订单。
- 桌面端显示“已投稿/待跟踪”，不误显示“已发布”。

建议提交：

```text
feat(media): add order-tracked platform adapter
```

### 任务 4：建立媒体资源管理

目标：

解决媒体资源多、难选择、难复用的问题。

功能：

- 拉取全部媒体资源。
- 本地缓存媒体目录。
- 支持关键词、价格区间、类型、成功率筛选。
- 支持维护 `Media Pool`。
- 投稿时优先从 `Media Pool` 选资源，而不是每次翻完整列表。

建议文件：

```text
auto—publish/data/media-resources.json
auto—publish/data/media-pool.json
```

`media-pool.json` 示例：

```json
[
  {
    "resource_id": "123456",
    "title": "示例媒体",
    "price": 120,
    "tags": ["科技", "本地生活"],
    "note": "出稿稳定",
    "enabled": true
  }
]
```

桌面端页面：

- 媒体资源库：全量列表、刷新、搜索、筛选。
- 常用媒体池：收藏、启用/禁用、备注。
- 投稿选择器：从媒体池中选择 `resource_id`。

测试：

- 资源拉取 mock 测试。
- 筛选和导出测试。
- 媒体池增删改测试。

验收：

- 操作员不需要手动记 `resource_id`。
- 能按价格和关键词快速筛选。
- 常用媒体池能用于后续投稿。

建议提交：

```text
feat(media): add media resource pool
```

### 任务 5：设计投稿订单与状态同步

目标：

把媒体投稿从“一次性提交”升级为“可跟踪订单”。

状态建议：

```text
submitted      已投稿
reviewing      平台处理中
published      已发布
rejected       被拒
failed         投稿失败
cancelled      已取消
unknown        未识别
```

执行：

- 新增 `Submission Order Store`。
- 投稿成功后保存 `order_nid`、`third_id`、文章、媒体资源、价格、创建时间、当前状态。
- 新增订单同步命令/服务。
- 桌面端增加“订单中心”。

测试：

- 保存订单测试。
- 批量同步订单测试。
- 未识别平台状态映射为 `unknown` 并保留 raw。

验收：

- 已投稿文章可以后续查状态。
- 失败/拒稿不会丢失原始返回。
- 桌面端能区分“已投稿”和“已发布”。

建议提交：

```text
feat(media): track submission orders
```

### 任务 6：优化桌面端操作逻辑

目标：

把桌面端从单一批处理控制台升级为多平台发布工作台。

页面建议：

- 总览：待发布、已投稿待跟踪、失败、今日成功。
- 文章队列：按平台/文章状态筛选，显示标题、文件、目标平台、目标媒体。
- 平台管理：启用平台、账号状态、API Key 状态、测试连接。
- 媒体资源：资源库、媒体池、价格筛选。
- 投稿订单：订单号、媒体、文章、状态、同步时间。
- 日志：实时日志和历史日志。
- 设置：目录、API Key、发布间隔、默认媒体池。

操作逻辑：

- 先“刷新队列”，再“预检”，最后“开始发布”。
- 媒体投稿必须有明确 `resource_id` 或媒体池默认策略。
- 批量发布前显示风险摘要：平台、文章数、预计媒体费用、待确认项。
- 真实投稿前需要确认，尤其是付费媒体。

验收：

- 操作员能在 UI 中完成从文章准备到投稿跟踪的闭环。
- 付费动作有明确确认。
- 页面文案无乱码。
- UI 区分浏览器发布平台和 API 投稿平台。

建议提交：

```text
feat(desktop): redesign publishing workflow
```

### 任务 7：完善文章与元数据模型

目标：

摆脱纯文件名承载所有信息的限制，为媒体投稿提供更稳定的目标选择和备注配置。

建议：

- 保留现有文件名解析兼容旧流程。
- 新增 sidecar 元数据：

```json
{
  "title": "文章标题",
  "platforms": {
    "media": {
      "resource_id": "123456",
      "remark": "请按原文发布"
    }
  }
}
```

测试：

- 无 sidecar 时兼容旧文件名。
- 有 sidecar 时优先使用 sidecar。
- sidecar 配置缺失时给出 UI 预检提示。

验收：

- 媒体投稿不依赖人工命令行传参。
- 一篇文章可以明确指定不同平台的目标。

建议提交：

```text
feat(core): support article metadata sidecars
```

### 任务 8：端到端验证

目标：

用测试 API Key 和测试媒体资源完成完整闭环。

执行：

- 启动 Electron。
- 配置 API Key。
- 刷新媒体资源。
- 添加一个资源到媒体池。
- 放入测试文章。
- 刷新队列。
- dry-run 预检。
- 真实投稿。
- 查看订单中心。
- 同步订单状态。

验收：

- 不需要命令行即可完成一次媒体投稿。
- 订单号被保存。
- 状态能同步。
- 日志可追踪。
- API Key 不泄露。

建议提交：

```text
test(media): verify desktop submission workflow
```

## 推荐执行顺序

1. 先修乱码和项目整理。
2. 再把媒体模块迁入 `auto—publish`。
3. 再做媒体 adapter 和 job 状态语义。
4. 再做媒体资源管理。
5. 再做订单跟踪。
6. 最后重做桌面端操作流和页面。

## 风险与注意

- 当前 UI 和部分日志存在编码乱码，必须先修，否则后续页面优化会叠在脏基础上。
- 现有 `jobs.js` 只有 `succeeded/failed/needs_login`，不够表达媒体订单状态。
- 媒体投稿是付费动作，真实提交必须有确认和预估费用提示。
- 资源库可能很大，桌面端需要本地缓存、搜索和分页。
- API Key 应只存本地配置，不写入日志、订单记录或 git。

## Grill 问题 1

媒体投稿接入后，第一版桌面端是让操作员“每篇文章手动选择一个媒体资源”，还是允许“从媒体池自动选择”？

推荐答案：

第一版先做“手动选择一个媒体资源”，同时允许把常用资源加入 `Media Pool`。自动选择涉及费用、内容适配、成功率和投放策略，应该等订单数据积累后再做。
