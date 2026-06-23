# 媒体投稿渠道对接 — 使用说明

## 环境配置

### 1. 安装依赖

```powershell
npm install
```

### 2. 配置 API Key

三种方式任选其一：

**方式 A — .env 文件（推荐）**

```powershell
copy .env.example .env
```

编辑 `.env`，填入真实 API Key：

```env
XQW_API_KEY=你的真实API密钥
```

**方式 B — 环境变量**

```powershell
$env:XQW_API_KEY="你的真实API密钥"
```

**方式 C — 命令行参数**

每次执行加 `--api-key` 参数。

> 优先级：命令行参数 > 环境变量 > .env 文件

## 命令参考

### dry-run 投稿（默认安全模式）

不加 `--confirm` 时只预览，不调用投稿 API：

```powershell
node scripts/media-submit.js submit `
  --resource-id 123456 `
  --title "文章标题" `
  --content-file "F:\官媒投稿\articles\sample.txt"
```

输出示例：

```text
🔑 API Key: test****5678
📄 文章文件: F:\官媒投稿\articles\sample.txt
🔄 正在转换文章...
   → 转换完成，HTML 48 字符，纯文本 35 字符

🔍 [DRY-RUN] 预览模式
──────────────────────────────────────────────
  资源 ID : 123456
  标题    : 测试标题
  文件    : sample.txt
  备注    : (无)
  第三方ID: (无)
  内容预览: 这是测试文章的正文内容...
──────────────────────────────────────────────

💡 这是 dry-run，未真实调用投稿 API。
   添加 --confirm 参数以执行真实投稿。
```

### 真实投稿

添加 `--confirm` 参数：

```powershell
node scripts/media-submit.js submit `
  --resource-id 123456 `
  --title "文章标题" `
  --content-file "F:\官媒投稿\articles\a.docx" `
  --remark "请按原文发布" `
  --confirm
```

> ⚠️ `--confirm` 会真实调用投稿 API，可能产生费用。使用前确认 API Key、resource_id、文章内容正确。

### 订单查询

```powershell
node scripts/media-submit.js order --order-nid 订单号
```

### 余额查询

```powershell
node scripts/media-submit.js balance
```

### 自定义 API 地址

```powershell
node scripts/media-submit.js balance --base-url https://custom-api.example.com
```

## 支持的文件格式

| 格式 | 说明 |
|------|------|
| `.txt` | 纯文本，自动转简单 HTML |
| `.docx` | Word 文档，通过 mammoth 转简单 HTML |

**第一版不支持**：图片、表格、复杂 Word 样式。这些内容在转换时会丢失或产生警告。

## 投稿记录

每次操作（submit / order / balance）都会记录到 `submission-records.jsonl`，每行一条 JSON。

API Key 在记录中自动脱敏（仅保留前 4 位和后 4 位）。

## Electron 集成

在 Electron 主进程或任务队列中调用：

```js
import { createMediaAdapter } from "./src/platforms/media/adapter.js";

const adapter = createMediaAdapter();

// 投稿
const result = await adapter.publish({
  title: "文章标题",
  contentFile: "/path/to/article.docx",
  resourceId: "123456",
  remark: "备注",
});

// result = {
//   platform: "media",
//   status: "submitted",  // 已投稿 ≠ 已发布
//   orderNid: "N-001",
//   htmlContent: "...",
//   plainText: "...",
//   raw: { ... }
// }

// 查询订单
const order = await adapter.queryOrder("N-001");

// 查询余额
const balance = await adapter.getBalance();
```

## 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `缺少 API Key` | 未配置 API Key | 设置 `.env`、环境变量或传 `--api-key` |
| `不支持的文件格式` | 文件不是 `.txt` 或 `.docx` | 使用支持的格式 |
| `文件内容为空` | 文件内容为空 | 检查文件内容 |
| `API 请求超时` | 网络超时 | 检查网络连接，增加超时时间 |
| `网络请求失败` | 无法连接 API | 检查 `--base-url`，确认 API 地址可访问 |

## 项目结构

```text
scripts/
  media-submit.js          # CLI 入口

src/
  core/
    config.js              # API Key 读取
    media-client.js        # API HTTP 客户端
    article-converter.js   # 文章转换器 (docx/txt → HTML)
    submission-store.js    # 投稿记录 JSONL 存储
  platforms/
    media/
      adapter.js           # Electron 集成适配器

tests/
  *.test.js                # 测试文件

docs/
  media-submission.md      # 本文档

articles/
  sample.txt               # 测试用文章样本
```
