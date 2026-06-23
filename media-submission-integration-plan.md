# 媒体投稿渠道对接实施方案

## 背景

准备对接一个媒体投稿渠道 API，并先实现一个可独立运行的 Node.js 投稿脚本，后续再集成到现有 Electron 自动发文桌面端。

API 文档：

https://s.apifox.cn/ecc95f5a-3182-406a-aeb5-8930e3a06e65/404388141e0

已确认条件：

- 已拥有 API Key。
- 第一版只对接“网站媒体”投稿。
- 第一版人工指定 `resource_id`，不做自动选媒。
- 第一版支持读取 `.docx` 和 `.txt`。
- 第一版 `.docx` 用 `mammoth` 转简单 HTML。
- 第一版不处理图片、表格、复杂 Word 样式。
- 第一版投稿内容默认提交简单 HTML，并保留纯文本 fallback。
- 第一版投稿记录保存为本地 JSONL 文件。
- 第一版 API Key 从 `.env`、环境变量或命令行参数读取。
- 第一版必须支持 `submit` 和 `order` 两个命令。
- 后续需要能集成进 Electron 主进程或自动发文任务队列。

## 总体目标

完成一个可独立运行、可测试、可审查、可集成的媒体投稿模块：

```text
scripts/
  media-submit.js

src/
  core/
    media-client.js
    article-converter.js
    submission-store.js
```

投稿命令示例：

```powershell
node scripts/media-submit.js submit `
  --resource-id 123456 `
  --title "文章标题" `
  --content-file "F:\官媒投稿\articles\a.docx" `
  --remark "请按原文发布" `
  --confirm
```

订单查询命令示例：

```powershell
node scripts/media-submit.js order `
  --order-nid 订单号
```

## 执行规则

新线程执行本方案时，必须按任务顺序推进。每个任务都要满足以下流程：

1. 实现当前任务。
2. 自查代码，包括边界条件、错误处理、敏感信息泄露风险。
3. 运行相关测试或手动验证命令。
4. 对照验收标准逐项确认。
5. 通过后执行一次 git 提交。
6. 继续下一个任务。

如果某个任务无法通过验收，不允许继续后续任务。应先修复、复测、再提交。

提交信息建议格式：

```text
feat(media): add article converter
test(media): cover submission store
fix(media): handle missing api key
```

注意：

- 不要把 `.env`、API Key、真实投稿正文提交到 git。
- 付费投稿接口必须有显式确认保护，不能默认直接投稿。
- 每次真实调用投稿接口前必须确认当前使用的是正确 API Key、正确 `resource_id`、正确文章内容。

## API 范围

第一版只使用网站媒体接口：

- 网站媒体资源列表：`POST /api/media/media_list`
- 网站媒体投稿：`POST /api/media/send`
- 网站媒体订单详情：`POST /api/media/order_info`
- 余额查询：`POST /api/geo/get_balance`

核心投稿参数：

- `api_key`
- `resource_id`
- `title`
- `content`
- `remark`
- `third_id`

订单详情参数：

- `api_key`
- `order_nids[]`

请求格式按 API 文档实现，优先使用 `multipart/form-data`。

## 任务 1：项目现状审查与依赖确认

目标：

确认当前 Electron 项目的结构、包管理器、测试框架、代码风格，并决定文件落点。

执行：

- 查看 `package.json`、现有 `src/`、`scripts/`、测试目录。
- 确认项目使用 npm、pnpm、yarn 还是其他方式。
- 确认是否已有 `.env` 加载方式。
- 确认是否已有日志目录或配置模块。
- 确认是否已有平台 adapter 模式。

产出：

- 在执行记录中说明现有结构。
- 如项目没有必要目录，创建 `scripts/` 和 `src/core/`。

测试：

- 运行当前项目已有测试或最小健康检查命令。
- 如果没有测试命令，至少运行 `node -v` 和包管理器安装/检查命令。

验收标准：

- 明确知道代码应该放在哪里。
- 明确知道如何运行脚本。
- 明确知道如何运行测试。
- 没有破坏现有项目启动或测试。

提交：

```text
chore(media): inspect project structure
```

如果没有产生文件变更，可以不提交，但必须记录原因后继续。

## 任务 2：配置与密钥读取

目标：

实现 API Key 读取逻辑，支持命令行参数、环境变量和 `.env`。

建议行为：

读取优先级：

1. 命令行参数 `--api-key`
2. 环境变量 `XQW_API_KEY`
3. 项目根目录 `.env` 中的 `XQW_API_KEY`

执行：

- 增加 `.env.example`，只写变量名，不写真实密钥。
- 确认 `.gitignore` 包含 `.env`。
- 实现配置读取模块或在 CLI 层实现。
- 缺少 API Key 时给出清晰错误。

测试：

- 无 `.env`、无环境变量时，应提示缺少 API Key。
- 设置环境变量时，应能读取。
- 命令行传 `--api-key` 时，应覆盖环境变量。
- 确认日志和错误信息不会打印完整 API Key。

验收标准：

- API Key 不会被提交。
- API Key 不会被明文输出到日志。
- 三种读取路径可验证。

提交：

```text
feat(media): add api key configuration
```

## 任务 3：文章转换模块

目标：

实现 `src/core/article-converter.js`，支持 `.docx` 和 `.txt` 转投稿内容。

设计：

```js
convertArticle(filePath, options) -> {
  html,
  text,
  warnings
}
```

行为：

- `.txt`：读取文本，按段落转为简单 HTML。
- `.docx`：使用 `mammoth` 转简单 HTML，同时尽量获得纯文本。
- 默认输出 `html`。
- 保留 `text` fallback。
- 不处理图片、表格、复杂样式。
- 遇到不支持的扩展名时抛出清晰错误。

依赖建议：

```text
mammoth
```

测试：

- 准备一个测试 `.txt` 文件，验证段落转换。
- 准备一个测试 `.docx` 文件，验证能提取正文。
- 验证空文件、缺失文件、不支持格式的错误处理。

验收标准：

- `.txt` 能转换为 HTML 和纯文本。
- `.docx` 能转换为 HTML 和纯文本。
- 转换结果不会包含 undefined/null 字符串。
- 不支持格式能给出明确错误。

提交：

```text
feat(media): add article converter
```

## 任务 4：投稿记录存储

目标：

实现 `src/core/submission-store.js`，保存投稿记录到 `logs/submissions.jsonl`。

设计：

```js
appendSubmission(record)
readSubmissions()
```

记录格式：

```json
{
  "third_id": "local-20260623-xxxx",
  "order_nid": "平台返回订单号",
  "resource_id": "123456",
  "title": "文章标题",
  "content_file": "F:\\官媒投稿\\articles\\a.docx",
  "status": "submitted",
  "created_at": "2026-06-23T00:00:00.000Z"
}
```

执行：

- 自动创建 `logs/` 目录。
- 每次投稿追加一行 JSON。
- 写入失败时给出清晰错误。
- 不在记录中保存 API Key。

测试：

- 追加一条记录后，文件存在。
- 多次追加后，每行都是合法 JSON。
- `readSubmissions()` 能读取所有记录。
- 记录中不包含 API Key。

验收标准：

- JSONL 格式稳定。
- 追加写不会覆盖历史记录。
- 缺少 `logs/` 目录时自动创建。

提交：

```text
feat(media): add submission store
```

## 任务 5：媒体 API 客户端

目标：

实现 `src/core/media-client.js`，封装网站媒体投稿、订单查询和余额查询。

设计：

```js
submitWebsiteArticle({
  apiKey,
  resourceId,
  title,
  content,
  remark,
  thirdId
})

getWebsiteOrderInfo({
  apiKey,
  orderNids
})

getBalance({
  apiKey
})
```

执行：

- 使用 `multipart/form-data`。
- 统一处理 HTTP 错误、接口业务错误、JSON 解析错误。
- 返回结构保留平台原始响应 `raw`。
- 不在错误信息中泄露完整 API Key。

测试：

- 用 mock 或可替代 HTTP 测试方式验证请求路径、方法、参数。
- 验证网络失败时错误清晰。
- 验证接口返回异常格式时错误清晰。

验收标准：

- 投稿、订单查询、余额查询都有独立方法。
- 请求参数名与 API 文档一致。
- 能在无真实 API Key 的测试环境下完成 mock 测试。
- 真实接口调用前有人工确认步骤，不能在测试中误触发付费投稿。

提交：

```text
feat(media): add website media client
```

## 任务 6：命令行脚本

目标：

实现 `scripts/media-submit.js`，提供 `submit` 和 `order` 命令。

命令：

```powershell
node scripts/media-submit.js submit `
  --resource-id 123456 `
  --title "文章标题" `
  --content-file "F:\官媒投稿\articles\a.docx" `
  --remark "请按原文发布" `
  --confirm
```

```powershell
node scripts/media-submit.js order `
  --order-nid 订单号
```

安全要求：

- `submit` 默认 dry-run。
- 只有传入 `--confirm` 才真实提交。
- dry-run 时打印标题、文件路径、resource_id、内容长度、内容模式，但不调用投稿接口。
- 真实提交前生成 `third_id`。
- 投稿成功后写入 `logs/submissions.jsonl`。

测试：

- `submit` 不带 `--confirm` 不调用真实投稿。
- 缺少 `--resource-id`、`--title`、`--content-file` 时提示错误。
- `order` 缺少 `--order-nid` 时提示错误。
- dry-run 能完成文章转换。
- mock 投稿成功后能写入 JSONL。

验收标准：

- CLI 用法清楚。
- dry-run 默认安全。
- `submit` 和 `order` 都可运行。
- 投稿记录写入正确。

提交：

```text
feat(media): add submission cli
```

## 任务 7：真实接口小流量验证

目标：

用真实 API Key 做最小化验证，但避免误花费或误投。

执行顺序：

1. 配置 `.env`。
2. 调用余额查询，确认 API Key 可用。
3. 调用订单查询接口，使用一个已知或不存在的订单号验证错误处理。
4. 如需要真实投稿，必须由用户明确提供测试用 `resource_id`、标题、正文，并确认会产生费用或投稿行为。

测试：

- `getBalance` 能返回余额信息。
- `order` 能处理平台返回。
- 投稿接口仅在用户明确确认后调用。

验收标准：

- API Key 验证通过。
- 真实返回结构已记录到代码注释或测试夹具中。
- 若返回字段与预期不同，客户端已修正。
- 没有泄露 API Key。

提交：

```text
test(media): verify live media api shape
```

如果没有执行真实投稿，只提交余额和订单查询验证相关修正。

## 任务 8：Electron 集成适配器

目标：

为桌面端自动发文流程预留或实现媒体投稿平台适配器。

建议落点：

```text
src/platforms/media/adapter.js
```

设计：

```js
publish({
  title,
  contentFile,
  resourceId,
  remark
}) -> {
  platform: "media",
  status: "submitted",
  thirdId,
  orderNid,
  raw
}
```

执行：

- 复用 `article-converter`、`media-client`、`submission-store`。
- 不在适配器里重复拼接口参数。
- 返回桌面端统一的发布结果结构。
- 如项目已有平台适配器规范，遵循现有规范。

测试：

- mock API 客户端，验证 adapter 输入输出。
- 验证失败时能返回或抛出桌面端可识别的错误。
- 验证不会把“已提交投稿”误标为“已发布成功”。

验收标准：

- Electron 侧可以调用该 adapter。
- 投稿状态语义正确：`submitted` 表示已投稿，不等于已发布。
- 适配器不包含 API Key 明文。

提交：

```text
feat(media): add electron media adapter
```

## 任务 9：文档与使用说明

目标：

补充最终使用文档，确保自己和后续线程都能运行。

建议文档：

```text
docs/media-submission.md
```

内容：

- 环境变量配置。
- dry-run 投稿示例。
- 真实投稿示例。
- 订单查询示例。
- `.docx` 支持范围。
- 常见错误与处理。
- Electron 集成说明。

测试：

- 按文档命令复制运行 dry-run。
- 确认示例不会包含真实 API Key。

验收标准：

- 新人只看文档可以完成 dry-run。
- 文档明确真实投稿需要 `--confirm`。
- 文档明确第一版不支持图片、表格、复杂样式。

提交：

```text
docs(media): document submission workflow
```

## 任务 10：最终审查与整体验收

目标：

做一次完整收口，确认方案整体可用且没有安全隐患。

审查清单：

- API Key 没有进入 git。
- `.env` 已被忽略。
- 日志不会输出完整 API Key。
- 投稿默认 dry-run。
- 只有 `--confirm` 才真实投稿。
- `.docx` 和 `.txt` 都可转换。
- 投稿记录 JSONL 可读。
- 订单查询可用。
- Electron adapter 可复用核心模块。
- 错误信息清楚。
- 测试覆盖核心路径和失败路径。

最终验收命令：

```powershell
node scripts/media-submit.js submit `
  --resource-id 123456 `
  --title "测试标题" `
  --content-file "F:\官媒投稿\articles\sample.txt"
```

该命令应 dry-run，不应真实投稿。

```powershell
node scripts/media-submit.js order `
  --order-nid test-order-id
```

该命令应调用订单查询，或在 mock 环境中返回可理解结果。

验收标准：

- 所有任务都有对应提交或明确说明。
- 测试全部通过。
- dry-run 安全。
- 真实调用路径需要显式确认。
- 可以交付给桌面端集成使用。

最终提交：

```text
chore(media): complete media submission integration
```

## 后续扩展路线

第二版：

- 支持第三方自媒体接口：`/api/zi_media_api/*`。
- 增加媒体资源列表查询。
- 支持按价格、成功率、出稿时间筛选媒体。
- 增加批量投稿。

第三版：

- 支持 `.docx` 图片提取。
- 对接图床或媒体素材上传接口。
- 替换 HTML 中的图片地址。

第四版：

- 增加高级转换引擎。
- 默认 `mammoth` 干净投稿模式。
- 可选 `pandoc` 复杂格式模式。
- 可选纯文本保底模式。

第五版：

- 在 Electron 桌面端增加可视化配置：
  - API Key 设置
  - resource_id 输入
  - dry-run 预览
  - 投稿记录列表
  - 订单状态刷新

