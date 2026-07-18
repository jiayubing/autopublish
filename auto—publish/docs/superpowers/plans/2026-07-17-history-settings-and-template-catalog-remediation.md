# 历史文章布局、平台配置中心与文件驱动模板系统修复计划

**日期：** 2026-07-17  
**源代码范围：** 仅 `F:\官媒投稿\auto—publish`  
**基线 commit：** `53bae92`（`fix(packaging): include build provenance in the installer`）  
**目标：** 修复历史文章页在中等窗口下的内容错乱；在配置中心安全管理蓝色河畔和付费媒体配置；重新组织配置中心的信息架构与响应式布局；将单篇、批量生成统一到文件驱动的模板目录，并降低模板文件的必填元数据。

**本轮交付顺序：** 先建立可复现的布局红色测试，再修复历史页；随后建立应用级安全平台配置模块并接入付费媒体、河畔；最后深化模板目录模块并改造单篇/批量选择器。正式安装包只从干净 commit 构建，不迁移或删除客户业务数据。

---

## 1. 已确认现状与根因

### 1.1 历史文章页面错乱已在当前解包安装版复现

使用当前 `release-alpha/win-unpacked/AutoPublish.exe`，固定窗口为用户截图对应的 `1128 × 527`，进入：

```text
AI内容生成 -> 历史文章
```

真实浏览器测量结果：

```text
viewport: 1128 × 527
标题“历史文章”: width=17.515625, height=96
说明文字: width=17.515625, height=320
```

可重复的红色探针输出：

```text
HISTORY_LAYOUT_RED {
  "viewport":{"width":1128,"height":527},
  "heading":{"x":296,"y":157,"width":17.515625,"height":96},
  "note":{"x":296,"y":257,"width":17.515625,"height":320}
}
```

`GeneratedArticlesView.tsx` 把以下所有内容放在同一个 `flex flex-wrap` 容器中：

- 页面标题与说明；
- 搜索和状态筛选；
- 回收站、全选、审核、删除；
- 所有投稿平台按钮；
- 加入投稿队列。

标题块使用 `min-w-0 flex-1`，实际计算为 `flex: 1 1 0%`，可以被其他控件压缩到 0。右侧十多个控件具有自己的最小内容宽度，所以标题最终只剩一个汉字宽度，出现逐字竖排；平台按钮随后换到容器底部，使工具栏高度膨胀到 464px。

**结论：** 根因是未分区的响应式工具栏和标题块可无限收缩，不是文章数据、中文断词或历史分组逻辑。

### 1.2 现有历史文章测试无法拦截布局回归

`tests/renderer-article-history.test.js` 覆盖了分组、选择、回收站和入队规则，但 UI 部分主要使用正则读取 TSX 源码。相关 50 项专项测试当前全部通过，仍无法发现标题宽度只有 17.5px。

必须增加真实 Chromium/Electron 布局测试；JSDOM 和源码字符串匹配不能计算 flex 尺寸，不是正确测试 seam。

### 1.3 配置中心当前没有平台发文配置模块

当前配置中心由以下内容纵向堆叠：

1. 工作区；
2. 工作区说明；
3. 运行时诊断；
4. 存储清理；
5. AI 提供方。

真实安装版在 `1424 × 861` 窗口下：

```text
主内容区宽度: 1168px
Settings 实际宽度: 768px
Settings 总高度: 1362px
AI 配置起始位置: y=920
```

配置页使用 `max-w-3xl`，在大窗口浪费约 400px 横向空间；AI 配置完整落在首屏以下。页面标题和大量运行时文案还是英文，与应用其他中文页面不一致。

### 1.4 付费媒体 API 配置仍是明文和启动时冻结模型

当前付费媒体配置来源：

- `XQW_API_KEY`
- `XQW_BASE_URL`
- workspace `.env`
- `%APPDATA%/.../runtime-config.json`

问题包括：

- `runtime-config.json` 不使用 Electron `safeStorage`，API Key 可能明文保存；
- `media-ipc.js` 注册时创建 `mediaResourceService` 并捕获一个固定客户端，保存配置后不能即时生效；
- `media-workbench-service.js`、`media-order-service.js` 又在操作时分别读取全局环境，配置解析不统一；
- 错误语义仍是“缺少 API 客户端配置”，没有稳定平台配置错误码；
- 当前默认 Base URL 是 HTTP，API Key 会通过未加密连接发送，必须在计划中明确处理兼容和安全提示。

### 1.5 河畔发文配置只存在于文件/环境变量，并且运行时被冻结

当前河畔 adapter 在模块加载时创建全局 `HEPAN` 对象，只读取一次：

- `config/hepan.json`
- `HEPAN_COOKIE_PATH`
- `HEPAN_PYTHON`

河畔 Python 发布器当前还固定了：

- `SITE_ORIGIN = https://www.hepan.com`
- `CATID = 121`
- Python 依赖：`requests`、`beautifulsoup4`
- Cookie 通过明文文件路径传入

因此仅在配置中心增加几个输入框还不够：保存后 adapter 和 worker 不会可靠刷新，而且直接保存 Cookie 文件或把 Cookie 放入环境变量会扩大泄漏面。

### 1.6 模板后端已经文件驱动，但单篇生成仍硬编码平台

模板目录模块 `src/content/template-store.js` 已经能够：

- 扫描 `templates/<platform>/*.md`；
- 合并 workspace 自定义模板和包内只读模板；
- 在不传 platform 时列出全部模板；
- 按模板正文哈希保存生成时快照。

批量生成已经调用 `listContentTemplates()` 并根据返回文件动态分组。单篇生成仍写死：

```ts
const PLATFORMS = ['ctrip', 'xiaohongshu', 'dianping'];
const EXPORT_TARGETS = ['media', 'lieju', 'toutiao', 'hepan'];
```

所以新增模板目录不会自动出现在单篇平台下拉框中。这是前后端目录发现能力没有共用，而不是模板存储完全缺失。

### 1.7 当前模板格式重复要求过多固定元数据

现有模板必须写：

```markdown
---
platform: ctrip
scenario: Standard travel guide
name: ctrip_standard_guide
displayName: Standard travel guide
---
Write ...
```

其中：

- `platform` 已由父目录表达；
- `name/id` 已可由文件名表达；
- `scenario` 在 `prompt-builder.js` 中又被强制必填；
- `displayName` 常与 scenario/name 重复。

这就是新增模板时“固定内容太多”的直接原因。模板真正必须提供的内容应只剩写作要求正文；平台、ID 和缺省显示名都可以从目录与文件名推导。

---

## 2. 目标设计决策

### 2.1 历史页面采用分区工具栏，不再把所有控件放在一个 flex 层级

目标结构：

```text
标题与说明
筛选区：搜索 | 状态 | 回收站
批量操作区：全选 | 审核 | 删除 | 撤销
投稿区：平台多选 | 加入投稿队列
文章分组列表
```

规则：

- 标题区在所有桌面宽度下至少占满一行，不参与右侧按钮的宽度竞争；
- 筛选、批量操作和投稿操作分别形成自己的 flex/grid 分区；
- 控件组允许组内换行，但不得把标题压到一个汉字宽度；
- `1128 × 527` 和 `1424 × 861` 均不得水平溢出；
- 文章列表从工具栏真实高度之后开始，不使用固定 top/height 假设。

### 2.2 平台配置是应用级安全配置，不属于内容库

AI、付费媒体和河畔账号配置都归属应用身份：

```text
%APPDATA%/AutoPublish/
  ai-provider.json
  media-provider.json
  hepan-provider.json
```

原则：

- API Key、Cookie 使用 Electron `safeStorage` 加密；
- 非密钥字段可以明文保存，但文件整体仍执行符号链接防护和原子写入；
- 切换内容工作区不切换账号配置；
- Renderer 只能获得 `configured`、mask、来源、非敏感字段和最近测试结果；
- 环境变量覆盖继续支持，但 UI 只读，不能把环境变量秘密回显或复制到磁盘；
- 配置修改在相关投稿任务运行时被阻止。

### 2.3 建立一个深的平台设置模块

主进程新增平台设置模块，Renderer 和测试只学习以下稳定 interface：

```text
getStatus(platformId)
save(platformId, draft)
test(platformId, draft?)
clear(platformId)
```

模块 implementation 内部包含：

- media/hepan 输入校验；
- safeStorage 加解密；
- 原子文件写入；
- 环境覆盖；
- 脱敏 DTO；
- 连接测试；
- 运行中互斥；
- 供业务调用的受控凭据解析。

Media 与 Hepan 是两个真实 adapter；测试提供对应的假外部连接 adapter。不要把文件路径、safeStorage 或 Cookie 临时文件暴露为 Renderer interface。

### 2.4 生成模板和投稿目标是两个不同概念

- **生成模板平台：** 来自 `templates/<platform>/`，决定 AI 写作要求。
- **投稿目标平台：** 来自现有投稿平台目录/adapter，决定文章导出到哪里。

不能因为两者都叫 platform 就共用一个硬编码数组。单篇生成的模板下拉框由模板 catalog 提供；文章编辑区的投稿目标由 `listContentSubmissionPlatforms()` 提供。

### 2.5 模板 catalog 是深模块，文件系统细节不泄漏给调用方

目标 interface：

```text
listCatalog() -> {
  revision,
  platforms[],
  templates[],
  diagnostics[]
}

getTemplate({ platformId, templateId }) -> normalizedTemplate
```

调用方不需要知道：

- 模板来自 builtin 还是 custom；
- front matter 是旧版还是新版；
- platform/id 是写在文件里还是从路径推导；
- Windows 路径和文件监听细节；
- 单个坏模板如何隔离。

### 2.6 模板 v2 采用“路径即身份，正文是唯一必填内容”

建议目录：

```text
templates/
  ctrip/
    platform.json          # 可选
    standard-guide.md
  new-platform/
    first-template.md
```

最小模板可以只有正文：

```markdown
根据已选择的客户资料和调研回答，生成一篇可直接发布的实用攻略。
```

可选 front matter：

```markdown
---
displayName: 实用攻略
description: 适合门店、景区和本地服务
order: 20
enabled: true
---
根据已选择的客户资料和调研回答，生成一篇可直接发布的实用攻略。
```

推导规则：

- `platformId` = 父目录名；
- `templateId` = Markdown 文件名 stem；
- `displayName` = front matter `displayName`，缺省为文件名；
- `scenario` = 可选兼容字段，缺省为 displayName；
- `body` = 唯一必填项；
- `bodyHash/revision` = 由规范化正文和元数据计算。

旧模板继续兼容读取，不要求一次性手工改完。

---

## 3. 分阶段实施任务

### Task 0：冻结现场并建立正确的红色反馈环

**Files:**

- Create: `tests/renderer-responsive-layout.test.js`
- Create: `tests/fixtures/workspaces/layout-smoke/`（只含脱敏最小数据）
- Modify: `scripts/verify.js`
- Modify: `package.json`（仅在需要增加专项命令时）

- [ ] 记录 HEAD、`git status --short`、当前安装包版本和用户截图对应窗口尺寸。
- [ ] 测试启动真实 Electron Renderer 或等价的真实浏览器布局环境，禁止使用 JSDOM 假装验证 flex 尺寸。
- [ ] 使用固定脱敏 workspace，使历史页面稳定有/无文章都能渲染相同工具栏。
- [ ] 在 `1128 × 527` 下断言历史标题宽度不少于 120px，说明文字不逐字竖排。
- [ ] 断言工具栏、平台按钮、入队按钮均位于内容容器内部且没有水平溢出。
- [ ] 在 `1424 × 861` 下重复断言，防止只针对一个截图写死像素。
- [ ] 增加配置页测量：页面内容宽度、分区导航可见、所有 provider 卡片可访问。

**Red gate:** 当前代码必须稳定复现 `HISTORY_LAYOUT_RED`；新测试不得在修复前误绿。

### Task 1：修复历史文章页响应式工具栏

**Files:**

- Modify: `media-workbench/src/components/content/GeneratedArticlesView.tsx`
- Optionally create: `media-workbench/src/components/content/HistoryArticleToolbar.tsx`
- Modify: `tests/renderer-article-history.test.js`
- Modify: `tests/renderer-responsive-layout.test.js`

- [ ] 把标题、筛选、批量操作、投稿操作拆成语义明确的四个区域。
- [ ] 标题区使用 `basis-full` 或独立 grid row，删除会被压缩到 0 的 `flex-1` 竞争关系。
- [ ] 筛选输入框使用 `minmax()`/响应式宽度，中等窗口可占一整行。
- [ ] 危险操作与普通筛选分组，避免“删除历史文章”紧贴平台按钮。
- [ ] 投稿平台按钮继续由 `listContentSubmissionPlatforms()` 动态生成；使用中文 displayName，不直接显示技术 ID（除非缺少 displayName）。
- [ ] 空列表、长平台名称、存在“撤销最近入队”按钮三种状态都跑布局测试。
- [ ] 保持现有选择收敛、审核、回收站、队列幂等逻辑不变。

**Gate:** 原始 Playwright 探针转绿，标题和说明在 1128px 窗口中恢复横向可读。

### Task 2：建立安全的平台设置存储与主进程模块

**Files:**

- Create: `desktop/platform-provider-config-store.js`
- Create: `desktop/services/platform-settings-service.js`
- Create: `desktop/services/platform-settings/media-settings-adapter.js`
- Create: `desktop/services/platform-settings/hepan-settings-adapter.js`
- Create: corresponding store/service tests
- Modify: `desktop/main.js`

- [ ] 复用 AI 配置已有的安全原则，但不要复制三套符号链接、原子写入和 safeStorage 错误处理。
- [ ] 存储模块接受 `fileName`、字段 schema 和 secret 字段列表，在 implementation 内完成加密/解密。
- [ ] 每个平台独立 versioned 文件，损坏一个文件不得令其他平台配置不可读。
- [ ] 保存时先严格校验，再写临时文件并原子 rename；rename 失败保留旧配置。
- [ ] 返回 DTO 永远不含 API Key、完整 Cookie、解密 Buffer、绝对临时文件路径。
- [ ] 提供稳定错误码：配置无效、未配置、环境覆盖、加密不可用、存储损坏、写入失败、连接测试失败、任务运行中。
- [ ] 平台投稿运行期间禁止 save/clear；只读 status 继续可用。
- [ ] 测试使用 fake safeStorage 和假外部 adapter，覆盖加密、mask、原子写入、符号链接、错误脱敏和跨 workspace 共享。

### Task 3：添加付费媒体 API 配置与即时生效链路

**Files:**

- Create: `desktop/services/platform-settings/media-settings-adapter.js`
- Modify: `desktop/ipc/register.js`
- Create/Modify: platform settings IPC
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `desktop/ipc/media-ipc.js`
- Modify: `desktop/services/media-resource-service.js`
- Modify: `desktop/services/media-workbench-service.js`
- Modify: `desktop/services/media-order-service.js`
- Modify: `src/platforms/media/media-client.js`
- Modify/Delete: `src/platforms/media/config.js`

**UI fields:**

- API Key：必填、密码框、只返回 mask；
- API Base URL：高级项，缺省使用批准地址；
- 请求超时：高级项，默认 30000ms；
- 配置来源、最近测试时间和测试结果：只读状态。

- [ ] `save` 只保存，不发网络请求。
- [ ] `test` 使用 `getBalance()` 或专用无副作用接口验证认证，不提交文章、不创建订单。
- [ ] 连接测试失败不得覆盖已生效配置。
- [ ] 保存成功后资源刷新、余额、投稿和订单同步立即使用新配置，不要求重启应用。
- [ ] 删除 `media-ipc.js` 注册时捕获固定 client 的模式；业务模块在每次外部操作开始时从统一 provider 获取一个配置快照/client。
- [ ] 同一批付费投稿开始后固定使用同一配置快照，避免中途切换 API Key；运行期间设置页禁止修改。
- [ ] 环境变量 `XQW_API_KEY/XQW_BASE_URL` 继续作为只读高优先级覆盖，但不回显值。
- [ ] workspace `.env` 不再作为新版本的秘密存储入口。
- [ ] 对当前 HTTP 默认地址增加显著“连接未加密”提示；优先推动并验证 HTTPS。若服务器暂不支持 HTTPS，只允许经过明确确认的批准旧地址，禁止任意 HTTP 主机静默接收 API Key。
- [ ] 所有 IPC 和日志错误不得包含 Key、请求表单、原始响应中的账户隐私或完整 Base URL 查询参数。

**Gate:** 保存一个测试配置后，不重启应用即可完成余额/资源测试；清除后所有外部媒体调用稳定返回 `MEDIA_CONFIG_NOT_SET`。

### Task 4：添加河畔发文配置与安全 Cookie 运行时

**Files:**

- Create: `desktop/services/platform-settings/hepan-settings-adapter.js`
- Modify: platform settings IPC/preload/renderer types
- Modify: `src/platforms/hepan/adapter.js`
- Modify: `src/platforms/hepan/hepan_publish.py`
- Modify: `desktop/services/desktop-task-service.js`
- Modify: `desktop/worker/run-task.js`
- Modify: `desktop/services/runtime-diagnostics-service.js`
- Create/modify Hepan service, worker and adapter tests

**UI fields:**

- Python 可执行文件：必填，支持系统路径或原生文件选择；
- 河畔 Cookie：必填、密码框、safeStorage 加密；
- 栏目 ID：高级项，正整数，默认 121；
- Python vendor/dependency 目录：高级可选项；
- 站点：只读显示 `https://www.hepan.com`，本轮不允许任意域名，避免 Cookie 被发送到错误主机；
- 配置来源、Python/依赖检查、登录测试结果：只读状态。

- [ ] 保存前校验 Python 路径是普通文件，不接受目录、符号链接、NUL 或不受信任的相对路径。
- [ ] 测试配置先运行 `python --version` 和最小 import 检查，再使用 `--check-login` 验证 Cookie。
- [ ] Python 脚本将 categoryId 作为结构化 CLI 参数接收，不再只依赖模块常量。
- [ ] Cookie 不写入 workspace `config/hepan-cookie.txt`，不放入进程环境变量，也不出现在 worker JSON payload。
- [ ] 主进程仅在测试或真实河畔任务期间解密 Cookie，写入 local-state/tmp 下的短生命临时文件；worker/Python 只获得该临时文件路径。
- [ ] 临时 Cookie 文件在成功、失败、超时、暂停、worker crash 和应用退出时都删除。
- [ ] adapter 每次任务从当前任务配置快照解析 Python/category/vendor，不再使用模块加载时冻结的全局 `HEPAN`。
- [ ] 同一河畔批次中途不能修改配置；下一批任务使用新配置。
- [ ] 测试错误只返回稳定码，例如 `HEPAN_PYTHON_UNAVAILABLE`、`HEPAN_DEPENDENCY_MISSING`、`HEPAN_LOGIN_INVALID`，不返回 Cookie、stderr 全文或绝对临时路径。
- [ ] runtime diagnostics 的 Hepan 状态读取同一个 provider，避免配置页与真实发布判断不一致。

**Gate:** 保存后无需重启即可通过 Python/登录检查；任务结束后临时目录中不存在 Cookie 文件。

### Task 5：重构配置中心页面信息架构和响应式布局

**Files:**

- Modify: `media-workbench/src/components/SettingsView.tsx`
- Create: `media-workbench/src/components/settings/SettingsNavigation.tsx`
- Create: `media-workbench/src/components/settings/SettingsOverview.tsx`
- Create: `media-workbench/src/components/settings/MediaProviderSettings.tsx`
- Create: `media-workbench/src/components/settings/HepanProviderSettings.tsx`
- Move/adapt: `AiProviderSettings.tsx`
- Create: shared settings form/status UI modules
- Modify renderer settings tests and responsive E2E test

目标分区：

```text
配置中心
  概览
  服务配置
    AI 生成
    付费媒体
    蓝色河畔
  工作区
  运行环境
  存储与清理
```

- [ ] 页面最大宽度从 `max-w-3xl` 提升为适合主内容区的 `max-w-6xl` 或等价自适应 grid。
- [ ] 桌面宽度使用左侧分区导航 + 右侧内容；中等宽度改为顶部可换行 tabs；窄宽度单列。
- [ ] 首屏展示三项服务配置摘要和必要操作，不再让 AI 配置完整掉到首屏之外。
- [ ] 每次只展开/定位一个设置分区，减少 1362px 的无结构长页。
- [ ] AI、媒体、河畔使用相同卡片骨架：状态、来源、字段、保存、测试、清除；字段和错误仍由各自 adapter 定义。
- [ ] 工作区、运行时诊断和缓存清理移到“系统”分区，不与账号密钥表单混排。
- [ ] 将现有英文标题、按钮和说明统一为中文；技术 ID 只放在辅助说明中。
- [ ] 保存按钮不弹“会联网”确认；测试连接和清除秘密配置保留明确确认。
- [ ] 输入错误就近显示，页面级错误只用于加载失败。
- [ ] `1128 × 527` 下不得出现横向滚动；`1424 × 861` 下充分利用 1168px 主内容宽度。
- [ ] 键盘焦点、label、密码显示/隐藏、禁用状态和错误 `aria-live` 完整可用。

### Task 6：深化模板 catalog 并支持轻量 v2 文件格式

**Files:**

- Refactor: `src/content/template-store.js`
- Optionally create: `src/content/template-catalog.js`
- Modify: `tests/template-store.test.js`
- Create: `tests/template-catalog.test.js`
- Modify: builtin templates under `resources/content-templates/`
- Modify: template-related types

- [ ] 保留一个对调用方稳定的 catalog interface，文件解析、合并和兼容逻辑留在 implementation 内。
- [ ] v2 模板从目录和文件名推导 platform/id，只要求正文非空。
- [ ] front matter 整体可选；出现时只允许批准字段和严格类型。
- [ ] 支持可选 `platform.json`：`displayName`、`description`、`order`；没有文件时用目录名。
- [ ] 旧版 `platform/scenario/name` 模板继续兼容，规范化成同一 DTO。
- [ ] `prompt-builder` 不再强制 scenario；scenario 缺失时使用 displayName，正文仍必须存在。
- [ ] catalog 返回 `revision`，由有效模板身份、正文哈希和平台元数据计算。
- [ ] 一个损坏模板只进入 `diagnostics[]`，不得让其他平台的有效模板全部消失；重复 ID/越界/符号链接仍严格拒绝该项。
- [ ] builtin/custom 冲突规则明确且确定：本轮优先保持“冲突即诊断，不静默覆盖”，避免误用错误模板。
- [ ] 模板 DTO 不向 Renderer 暴露绝对 `sourcePath`；最多返回安全相对文件名和 source 类型。
- [ ] 生成文章继续保存完整模板快照和 bodyHash，模板文件更新/删除不改写历史文章。

**Template v2 gate:** 新建 `templates/new-platform/first-template.md` 且文件只含正文时，catalog 能立即返回 platform=`new-platform`、templateId=`first-template`。

### Task 7：单篇和批量生成统一消费文件 catalog

**Files:**

- Modify: `desktop/services/ai-content-service.js`
- Modify: `desktop/ipc/ai-content-ipc.js`
- Modify: `desktop/preload.js`
- Modify: `media-workbench/src/electron-api.ts`
- Modify: `media-workbench/src/components/content/ArticleGenerationView.tsx`
- Modify: `media-workbench/src/components/content/BatchGenerationView.tsx`
- Modify: `media-workbench/src/content-generation-ui-logic.js`
- Modify renderer generation tests

- [ ] 新增 `content:list-template-catalog`，单篇和批量都调用它。
- [ ] 删除单篇中的固定 `PLATFORMS`；平台下拉框从 catalog 中有有效模板的平台生成。
- [ ] 平台选择变化时只显示该平台模板；模板被删除时清空选择并显示明确提示，不偷偷切换到另一模板后生成。
- [ ] 首次进入生成页、从其他 tab 返回和点击“刷新模板”时重新扫描文件。
- [ ] 不依赖 `fs.watch` 才能正确工作；网络盘/移动盘上手动刷新仍必须可靠。若增加 watcher，只作为带 debounce 的增强。
- [ ] catalog revision 未变化时保留当前选择；revision 变化时按 `{platformId, templateId}` 收敛。
- [ ] 批量生成继续支持跨平台多选，但改用同一 catalog DTO 和 displayName。
- [ ] 单篇与批量都显示模板来源、描述和无效模板诊断摘要。
- [ ] 历史文章打开编辑时，如果模板文件已经删除，显示“历史模板（已删除）”只读选项并继续使用文章快照；不得自动改成当前第一个模板。
- [ ] 删除固定 `EXPORT_TARGETS`；投稿目标调用 `listContentSubmissionPlatforms()` 动态生成，并只展示 `contentQueueImport` 可用平台。
- [ ] 生成模板平台和投稿目标平台在类型、文案和状态中保持分离。

**Gate:** 新增一个全新平台目录和模板文件后，不修改 TSX、config/platforms.json 或重启应用，只刷新模板即可在单篇和批量页面看到并使用它。

### Task 8：简化 Prompt 与模板职责，保持安全约束集中

**Files:**

- Modify: `src/content/prompt-builder.js`
- Modify: `src/content/article-generator.js`
- Modify: prompt/article generator tests
- Modify: template documentation

- [ ] 通用事实安全、禁止编造、只输出最终文章等规则继续集中在系统 Prompt，不要求每个模板重复。
- [ ] 模板正文只描述该写作风格/平台的差异化要求。
- [ ] Prompt 构建只强制：至少一份有效客户资料、至少一个有效调研回答、有效模板正文。
- [ ] platformId 作为来源/分类保留，但 scenario 和 displayName 不再是生成门槛。
- [ ] 模板正文按纯文本指令处理；本轮不引入可执行表达式、任意 include 或脚本变量，避免模板文件获得文件系统/命令能力。
- [ ] 生成时 snapshot 对缺省字段填入规范化值，旧文章 schema 继续可读。
- [ ] 覆盖“只有正文的 v2 模板”“旧 front matter 模板”“模板更新后新旧文章快照不同”三类测试。

### Task 9：旧配置迁移与秘密收口

**Files:**

- Modify: `desktop/runtime-config-store.js`
- Modify: `desktop/runtime-config.js`
- Modify: `scripts/migrate-content-library-v2.js`
- Modify: application identity import list/logic
- Modify: migration and workspace path tests
- Modify: `.env.example` and operator docs

- [ ] 新版本不再把 `XQW_API_KEY` 和 Cookie 路径作为推荐 workspace 配置。
- [ ] 发现旧 `runtime-config.json`/workspace `.env` 的媒体配置时，只报告“可导入旧配置”，不得在 Renderer 回显秘密。
- [ ] 用户明确确认后，主进程将旧媒体 Key 加密写入新 store；成功后再从应用级明文 runtime config 移除该键。
- [ ] 环境变量来源保持只读，不自动持久化。
- [ ] 旧 `HEPAN_COOKIE_PATH` 只在用户确认后由主进程读取并加密导入；不自动删除原 Cookie 文件，向用户提供手工清理提示。
- [ ] 迁移记录只保存来源类型、时间和成功状态，不保存 Key、Cookie、mask 之外的秘密摘要。
- [ ] 旧配置导入可重复执行且幂等，绝不覆盖已存在的新配置。

### Task 10：文档、打包与干净电脑验收

**Files:**

- Modify: `docs/clean-machine-installation.md`
- Modify: `docs/alpha-packaging-checklist.md`
- Modify: `docs/content-generation-operations.md`
- Create: `docs/template-catalog-v2.md`
- Modify: package verifier/tests as needed

- [ ] 文档给出最小模板、带可选元数据模板和新增平台目录示例。
- [ ] 文档说明“生成模板平台”和“投稿目标平台”的区别。
- [ ] 文档说明媒体 API Key、河畔 Cookie 位于应用级加密存储，不进入内容库、安装包、日志或 Git。
- [ ] 包验证排除 `media-provider.json`、`hepan-provider.json`、Cookie 临时文件和 provider test status。
- [ ] 正式包显示唯一版本和 commit SHA，避免新旧安装包误测。
- [ ] 新电脑测试不得依赖开发仓库中的 `.env` 或配置文件。

---

## 4. 建议提交顺序

1. `test(renderer): reproduce history toolbar collapse`
2. `fix(history): split responsive article actions`
3. `feat(settings): add secure platform provider store`
4. `feat(media): manage paid media credentials in settings`
5. `feat(hepan): manage publishing runtime and cookie safely`
6. `refactor(settings): organize provider and system sections`
7. `feat(templates): add path-derived template catalog v2`
8. `fix(generation): discover single and batch templates from files`
9. `refactor(prompt): make template metadata optional`
10. `chore(config): migrate legacy media and Hepan settings`
11. `test(packaging): exclude provider secrets and run clean-machine smoke`
12. `docs: document platform settings and template catalog v2`

不得把布局修复、秘密迁移、模板 schema 和真实投稿 adapter 改动塞进一个提交。

---

## 5. 自动化验证

### 5.1 专项测试

```powershell
node --test `
  tests/renderer-article-history.test.js `
  tests/renderer-responsive-layout.test.js `
  tests/platform-provider-config-store.test.js `
  tests/platform-settings-service.test.js `
  tests/media-provider-settings.test.js `
  tests/hepan-provider-settings.test.js `
  tests/template-store.test.js `
  tests/template-catalog.test.js `
  tests/prompt-builder.test.js `
  tests/article-generator.test.js `
  tests/renderer-batch-generation.test.js
```

### 5.2 全量验证

```powershell
npm run verify
```

### 5.3 安装包验证

```powershell
npm run pack:alpha
node scripts/verify-alpha-package.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-docx-runtime.js release-alpha\win-unpacked\resources\app
node scripts/verify-packaged-playwright-runtime.js release-alpha\win-unpacked\resources\app --browser-smoke
npm run dist:alpha
```

新增 provider 包扫描必须与现有 Playwright/DOCX verifier 一起运行，不能用新验证替代旧验证。

---

## 6. 人工验收矩阵

### 6.1 历史文章页面

- [ ] `1128 × 527` 下标题和说明横向显示，工具栏不覆盖文章列表。
- [ ] `1424 × 861` 下操作区域分组清晰，不浪费大块空白。
- [ ] 空列表、有文章、有撤销按钮、长平台名称四种状态无横向溢出。
- [ ] 搜索、状态、回收站、全选、审核、删除、平台多选、入队功能行为不变。

### 6.2 配置中心布局

- [ ] 首屏可见 AI、付费媒体、河畔三项状态摘要。
- [ ] 分区导航可以直达各设置区域，不需要滚过整页。
- [ ] 1128px 窗口单列/顶部导航正常，1424px 窗口使用两列布局。
- [ ] 所有文案统一中文，无英文/中文混排的主标题和按钮。

### 6.3 付费媒体配置

- [ ] 保存 API Key 后只显示 mask，重新进入页面不回显明文。
- [ ] 测试连接不创建投稿订单。
- [ ] 保存后无需重启即可刷新余额和媒体资源。
- [ ] 投稿任务运行时配置不可修改。
- [ ] 清除配置后缓存仍可浏览，但所有联网操作给出明确未配置提示。
- [ ] HTTP 旧地址显示风险提示；HTTPS 可用时优先使用 HTTPS。

### 6.4 河畔配置

- [ ] Python、依赖、Cookie 登录分别有清晰状态。
- [ ] Cookie 保存后不回显明文，不写入 workspace。
- [ ] 测试登录不发布文章。
- [ ] categoryId 能传入 Python 发布器且默认 121。
- [ ] 保存后下一次任务立即使用新配置，不需重启。
- [ ] 成功、失败、暂停、强制退出后均无临时 Cookie 文件残留。

### 6.5 文件驱动模板

- [ ] 新增仅含正文的 `templates/new-platform/first-template.md` 后，刷新即可出现在单篇和批量生成。
- [ ] 修改模板正文后 catalog revision 变化，新文章保存新快照，旧文章仍显示旧快照。
- [ ] 删除当前选中模板后 UI 清空选择并提示，不自动使用其他模板生成。
- [ ] 一个损坏模板显示诊断，但其他有效模板仍可使用。
- [ ] 旧 front matter 模板继续工作。
- [ ] 投稿目标新增 adapter 后由投稿平台列表出现，不需要修改 `EXPORT_TARGETS` 常量。

---

## 7. 完成标准

- [ ] 历史文章布局红色探针在两个目标窗口尺寸下转绿。
- [ ] 付费媒体 API Key 和河畔 Cookie 均使用应用级 safeStorage，不再以 workspace 明文配置作为推荐路径。
- [ ] 媒体与河畔配置保存后无需重启即可对下一次操作生效。
- [ ] 配置中心完成中文化、分区化和响应式重排。
- [ ] 单篇生成不再包含固定 `PLATFORMS`。
- [ ] 单篇编辑区不再包含固定 `EXPORT_TARGETS`。
- [ ] 最小模板只需正文，platform/id 从目录和文件名推导。
- [ ] 单篇、批量和历史快照通过同一个 template catalog interface。
- [ ] 旧模板、旧文章和旧配置均有明确兼容/迁移路径。
- [ ] 全量测试、Renderer 构建、portable、NSIS 和干净电脑验收通过。

---

## 8. 明确不做

- 不读取、记录或写入真实 API Key、Cookie、客户正文到测试夹具、计划文档或普通日志。
- 不把 Python、Cookie、`.env` 或 provider 配置打进安装包。
- 不允许模板执行 JavaScript、shell、include 任意文件或访问工作区外路径。
- 不把生成模板平台与投稿目标平台合并成同一概念。
- 不因模板文件更新而改写历史文章的模板快照。
- 不在本轮删除或迁移 `F:\官媒投稿` 下其他目录；源代码范围仍仅为 `F:\官媒投稿\auto—publish`。

