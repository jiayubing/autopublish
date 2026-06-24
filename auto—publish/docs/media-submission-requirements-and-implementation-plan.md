# 网站媒体投稿接入需求确认与实施计划

本文档用于新开线程后按步骤执行：先确认需求，再逐项实现、审查、测试、验收和提交。它是本次媒体投稿接入的执行说明书，不替代 `auto—publish/docs/` 下已有的历史架构文档。

## 当前项目现状

- `auto—publish` 已完整复制到当前工作区。
- 已清理复制带来的嵌套 `.git`、Playwright 缓存、历史发布产物、日志、临时目录和依赖目录。
- `auto—publish` 当前是 CommonJS 项目。
- 桌面端使用 Electron。
- 当前已有平台：`lieju`、`toutiao`、`hepan`。
- 当前 `config/platforms.json` 通过 enabled 列表控制启用平台。
- 当前批量发布逻辑会扫描所有启用平台目录，后续需要改为支持“本次发布平台选择”。
- 当前桌面端和部分日志存在中文乱码，需要第一阶段先修复。
- 当前根目录已有独立媒体投稿模块、CLI 和测试。
- 根目录媒体投稿测试当前通过 37 项。
- 第一版媒体投稿 API 已实测可用，后续以集成到 Electron 桌面端为主。

## 已确认需求

### 1. 产品定位

网站媒体投稿在底层作为一个普通 `Platform Adapter` 接入现有自动发文流程，同时在 Electron 桌面端提供独立的“媒体投稿中心”。

含义：

- 底层复用现有 `Publication Platform` / `Platform Adapter` / `Publication Job` / `Publication Batch` 模型。
- 桌面端新增媒体投稿专属页面，用于管理媒体资源、媒体池、投稿订单、余额和费用。
- 媒体投稿成功只表示平台已接收投稿请求，进入“已投稿/待出稿”，不等于“已发布成功”。

推荐实现方向：

- 媒体投稿 adapter 参与现有批量流程。
- 桌面端总览和任务列表必须区分“已投稿”和“已发布”。
- 订单跟踪能力放入媒体投稿中心，不塞进普通实时日志里。

### 2. 媒体选择方式

第一版采用人工选择媒体资源，不做自动投放决策。

含义：

- 操作员在桌面端为投稿选择具体媒体资源。
- 桌面端应提供媒体资源列表和常用媒体池，降低手填 `resource_id` 的出错率。
- 系统第一版不根据价格、关键词、成功率自动选择媒体。
- 自动选择可以作为后续功能，等积累订单状态和媒体效果数据后再设计。

### 3. 媒体选择粒度

第一版支持每篇文章选择不同的媒体资源，同时提供批量填充同一媒体的快捷操作。

含义：

- 文章队列中每条媒体投稿任务都可以绑定自己的 `Media Resource`。
- 桌面端应支持选中多篇文章后批量应用同一个媒体资源。
- 批量填充只是操作效率工具，不代表系统自动决策。

### 4. 媒体资源库

第一版媒体资源库需要支持全量拉取、本地缓存、搜索筛选和收藏到媒体池。

含义：

- 从网站媒体 API 拉取媒体资源列表。
- 将媒体资源保存为本地缓存，避免每次打开桌面端都重新拉取全部数据。
- 支持按名称、关键词、价格区间等条件筛选。
- 支持把常用媒体加入 `Media Pool`。
- 投稿选择媒体时优先从 `Media Pool` 选择，必要时再打开完整资源库。


## 待确认需求

后续按 `grill-with-docs` 一次确认一个问题，并在确认后更新本文档。

### 5. API Key 管理

第一版 API Key 通过本地 `.env` 或 ignored 配置文件管理，桌面端只提供配置状态检测、测试连接和余额查询。

含义：

- 不把 API Key 提交到 git。
- 不在日志、订单记录或界面中展示完整 API Key。
- 桌面端显示“已配置/未配置”，而不是明文密钥。
- 媒体投稿中心提供“测试连接”和“查询余额”。
- 第一版暂不做复杂密钥管理 UI 或加密存储。

### 6. 投稿后文件流转

媒体投稿成功后不直接归档到 `published/`，而是先进入 `submitted/` 或等价的“已投稿待出稿”状态。只有订单状态同步为已发布后，才进入真正的 `published/`。

含义：

- API 返回成功只表示投稿请求已被平台接收。
- 媒体投稿成功后，文章文件移动到 `submitted/`，并保存 `Submission Order`。
- 订单后续同步为已发布时，再把状态推进到 `published`。
- 订单被拒、失败或取消时，进入 `failed/` 或对应失败状态。
- 现有 `jobs.js` 不能继续把所有非失败结果都当作 `succeeded` 处理，需要新增 `submitted` 语义。

### 7. 订单状态同步

第一版采用手动同步订单状态，第二版再考虑自动定时同步。

含义：

- 媒体投稿中心提供“同步订单状态”按钮。
- 支持同步单个 `Submission Order`。
- 支持同步全部未完成订单。
- 同步结果更新桌面端订单列表和本地订单记录。
- 第一版不做后台定时轮询，避免桌面端启动后自动请求 API，也降低并发状态复杂度。

### 8. 文章投稿配置来源

第一版通过桌面端 UI 为文章选择媒体资源并保存为本地草稿/任务配置，第二版再引入文章旁路元数据 sidecar。

含义：

- 第一版不要求操作员手写 `文章名.meta.json`。
- 操作员在文章队列中选择媒体资源、填写投稿备注。
- 选择结果保存到本地 pending job 或 draft 配置中，刷新页面后不丢失。
- 后续支持 sidecar 元数据，用于让文章自带平台目标和投稿参数。
- 现有文件名解析规则继续兼容旧流程。

### 9. CLI 与桌面端关系

保留当前独立 CLI 作为开发和排错工具，但产品主入口以 Electron 桌面端为主。

含义：

- CLI 可继续用于查余额、拉媒体列表、dry-run 投稿和查订单。
- 媒体投稿核心逻辑应迁入 `auto—publish`，由桌面端和 CLI 共同复用。
- 不长期维护两套媒体投稿实现。
- 用户日常操作应在桌面端完成，不依赖命令行。

### 10. 桌面端优化范围

本次不只新增媒体投稿页面，还要把桌面端整体操作体验列入实施计划，并拆成可逐项验证的小任务。

含义：

- 先修复现有乱码文案和基础可用性。
- 重新组织导航和页面信息架构。
- 新增媒体投稿中心、媒体资源库、媒体池、订单中心。
- 批量发布前增加预检。
- 付费投稿前增加明确确认。
- 页面风格以清晰、密集、适合反复操作的工作台为主。
- 所有工作必须拆成小任务，每个任务完成后都要审查、测试、验收，通过后提交 git，再继续下一个任务。

建议页面结构：

- 总览
- 文章队列
- 平台管理
- 媒体投稿
- 订单中心
- 日志
- 设置

### 11. 真实投稿安全确认

真实媒体投稿第一版至少需要两层确认，避免误触发付费投稿。

第一层：批量发布前预检页显示：

- 文章数量。
- 媒体资源名称。
- `resource_id`。
- 单价或预估费用。
- API Key 配置状态。
- 是否有未选择媒体的文章。

第二层：点击真实投稿时再次确认，并明确提示该操作可能产生费用。

含义：

- dry-run 或预检不调用真实投稿接口。
- 只有通过预检且完成二次确认后，才允许调用投稿 API。
- 预检失败时禁止开始真实投稿。

### 12. 接入范围

第一版只接网站媒体，不接第三方自媒体，但数据结构预留未来扩展。

含义：

- 第一版使用网站媒体接口：媒体列表、投稿、订单详情、余额查询。
- 暂不接第三方自媒体接口。
- 本地数据结构预留 `mediaType` 或 `channelType` 字段，避免后续扩展时重做订单和资源模型。

### 13. 本地数据存储

第一版使用 JSON/JSONL 文件保存媒体资源、媒体池、投稿订单和投稿草稿，后续预留迁移到 SQLite 的空间。

建议文件：

```text
auto—publish/data/media-resources.json
auto—publish/data/media-pool.json
auto—publish/data/submission-orders.jsonl
auto—publish/data/media-drafts.json
```

含义：

- 媒体资源缓存用 JSON。
- 常用媒体池用 JSON。
- 投稿订单流水用 JSONL。
- 文章的媒体选择草稿用 JSON。
- 第一版不引入数据库，降低实现和调试成本。

### 14. 现有平台保留与本次发布平台选择

现有 `lieju`、`toutiao`、`hepan` 平台继续保留，但本次重点是媒体投稿接入和桌面端操作流优化。桌面端必须支持选择本次要发布哪些平台，不能只要对应目录有文章就全部发布。

含义：

- 不重写现有三个平台的发布逻辑。
- 修复现有平台相关乱码和展示问题。
- 平台管理页显示每个平台启用状态、队列数量和本次是否选中。
- 批量发布前可以勾选本次发布平台。
- 未勾选的平台即使目录下有文章，也不会在本次批次中发布。
- 媒体投稿作为本轮主线，原平台深度优化后续单独排期。

### 15. 平台选择粒度

第一版按平台选择本次发布范围，不做“文章 × 平台”的复杂矩阵选择。

含义：

- 批量发布前勾选本次要发布的平台，例如 `lieju`、`toutiao`、`hepan`、`media`。
- 未勾选的平台不参与本次批次。
- 如果勾选 `media`，再在媒体投稿配置中为每篇媒体文章选择媒体资源。
- 第一版暂不支持在同一个矩阵界面里为每篇文章分别勾选多个平台。

### 16. 媒体投稿文章来源目录

第一版新增 `input/media` 作为媒体投稿专用文章来源目录，媒体投稿只扫描该目录。

含义：

- `lieju`、`toutiao`、`hepan` 保持各自现有目录。
- 媒体投稿文章放入 `input/media`。
- 媒体投稿中心读取 `input/media` 的文章队列。
- 每篇媒体文章都必须能指定自己的目标 `Media Resource`。
- 未指定媒体资源的文章在预检时标记为阻塞项，不能真实投稿。

### 17. 媒体投稿标题来源

第一版默认从文章内容解析标题，解析不到则使用文件名，并允许操作员在 UI 中手动覆盖。

标题优先级：

1. `.docx/.txt` 内容中的一级标题或首行。
2. 文件名去扩展名。
3. 操作员在桌面端 UI 中手动填写或修改的标题。

含义：

- 投稿前预检必须展示最终标题。
- UI 修改后的标题应保存到本地草稿配置，刷新后不丢失。

### 18. 媒体投稿内容与图片能力

第一版继续支持 `.docx/.txt` 转简单 HTML，并要求优先实现从 `.docx` 中提取图片并随正文投稿。操作员负责在准备 `.docx` 时控制哪些媒体可以带图片、哪些文章不带图片。

含义：

- `.docx` 是媒体投稿的主要内容载体。
- 投稿内容应尽量保留正文中的图片位置。
- 图片来源优先使用 `.docx` 内嵌图片，不要求第一版支持手动额外选图。
- `.txt` 仍作为纯文字投稿格式。
- 文章草稿、订单记录和 adapter 不能设计成只支持纯文字。
- 预检页需要显示文章是否包含图片、图片数量，以及本次图片处理方式。
- 如果平台接口不支持直接上传图片，需要通过可访问的图片 URL 插入 HTML。

### 19. 图片投稿第一版边界

当前没有图床、OSS、服务器上传接口或媒体平台图片上传接口，因此第一版不实现真实带图投稿。

含义：

- 第一版需要识别 `.docx` 是否包含图片。
- 预检页显示图片数量和“当前无法随稿提交图片”的提示。
- 带图片的文章默认阻止真实投稿，避免图片丢失后误投。
- 如果操作员明确删除图片或改为纯文字稿，才能继续投稿。
- 后续接入图床/OSS/图片上传接口后，再实现图片提取、上传、URL 替换和带图投稿。

### 20. 忽略图片继续投稿

带图片文章默认阻止真实投稿，但允许操作员显式勾选“忽略图片并继续投稿”。

含义：

- 默认保护策略是阻止带图稿误投成缺图稿。
- 操作员可以逐篇文章确认忽略图片。
- 忽略图片后，系统按纯文字/简单 HTML 投稿。
- 投稿草稿和订单记录中需要保存 `imagesIgnored: true` 或等价字段，方便后续追溯。

### 21. 费用与余额预检

媒体投稿前必须显示媒体单价、合计预估费用和当前账户余额。

含义：

- 预检页逐篇显示所选媒体资源的价格。
- 预检页显示本次投稿合计预估费用。
- 预检页显示当前账户余额或余额查询失败状态。
- 余额不足时阻止真实投稿。
- 媒体价格缺失时显示“未知”，提示操作员确认；第一版不因价格缺失绝对阻断投稿。

### 22. 媒体资源刷新策略

媒体资源库第一版采用手动刷新为主，打开桌面端时不自动全量刷新。

含义：

- 点击“刷新媒体资源”才调用 API 拉取全量媒体列表。
- 桌面端显示媒体缓存数量和上次刷新时间。
- 如果没有媒体资源缓存，提示操作员先刷新。
- 搜索、筛选和媒体池选择优先使用本地缓存。
- 避免桌面端启动时自动发起大量 API 请求。

### 23. 订单中心字段

订单中心第一版至少展示文章、媒体、订单、状态、费用和同步信息。

字段：

- 文章标题。
- 文件名。
- 媒体名称。
- `resource_id`。
- 订单号 `order_nid`。
- 投稿状态。
- 价格。
- 投稿时间。
- 最近同步时间。
- 错误或备注。

筛选：

- 已投稿。
- 已发布。
- 失败。
- 未知。

### 24. 批次状态与订单状态关系

投稿批次状态和媒体订单状态需要在桌面端打通展示，但不能混成同一个状态。

含义：

- 批次运行结果显示“成功提交 X 篇、失败 Y 篇”。
- 订单中心继续跟踪“待出稿、已发布、失败、未知”等后续状态。
- 总览页分别展示：
  - 待发布文章。
  - 已投稿待出稿。
  - 今日已发布。
  - 失败或异常。
- 系统不能把媒体 API 提交成功直接显示为已发布成功。

### 25. 执行与提交规则

新线程执行本文档时，每个小任务必须独立实现、审查、测试、验收，并在通过后提交 git。

规则：

- 不允许把多个阶段堆到一个大提交。
- 如果一个任务太大，必须拆成多个小任务。
- 每个提交前必须运行对应测试或手动验证。
- 每个任务结束时记录验收结果。
- 如果暂时无法自动化测试，必须写明手动验证步骤和结果。
- 工作区中出现无关改动时，必须先说明并隔离，不能混入提交。
- 每次 git 提交信息使用中文描述。

### 26. 第一阶段优先级

新线程执行时，第一阶段先做项目整理和乱码修复，再开始媒体投稿功能接入。

第一阶段范围：

- 确认复制进来的 `auto—publish` 已清理干净。
- 修复 `package.json` 描述乱码。
- 修复桌面端 UI 文案乱码。
- 修复日志和错误提示乱码。
- 启动桌面端确认基础页面可用。

原因：

- 当前 `auto—publish` 存在明显中文乱码。
- 如果不先修，后续 UI 验收和媒体投稿页面开发都会叠在不稳定基础上。
- 乱码可能反映文件编码或写入方式问题，需要先统一。

### 27. 最终计划颗粒度

最终实施计划必须细到可以直接执行，不需要新线程重新设计。

每个任务必须包含：

- 要修改的模块。
- 建议文件路径。
- 实现要点。
- 审查点。
- 自动测试。
- 手动验收。
- 中文 git 提交示例。
- 继续下一步的条件。

### 28. Git 仓库边界

本次开发使用当前工作区根目录 `F:\官媒投稿` 作为唯一 git 仓库，`auto—publish/` 作为该仓库下的子目录提交，不再把 `auto—publish` 当作独立 git 仓库。

含义：

- `auto—publish/.git` 已清理，不恢复嵌套仓库。
- 新线程执行时在 `F:\官媒投稿` 根目录查看 git 状态和提交。
- 每次提交只暂存本任务相关文件，避免把 `.env`、`node_modules/`、运行记录或无关改动混入提交。
- 第一阶段需要提交清理后的 `auto—publish` 基线，然后再继续后续功能改造。

### 29. 根目录媒体投稿脚本保留

当前根目录已有的独立媒体投稿脚本和测试继续保留，作为媒体 API 的参考实现和排错工具。

含义：

- 不在第一阶段删除根目录 `scripts/media-submit.js`、`src/core/media-client.js`、`src/core/article-converter.js` 等既有实现。
- 后续迁入 `auto—publish` 时，以根目录实现作为行为参考。
- 桌面端集成完成后，再决定根目录 CLI 是继续保留，还是改为调用 `auto—publish` 内部模块。

### 30. 真实投稿限制

新线程执行计划时默认不允许真实投稿。

允许执行：

- dry-run。
- mock API 测试。
- 余额查询。
- 媒体列表拉取。
- 订单查询。

禁止执行：

- 未经操作员明确授权调用真实投稿接口。

真实投稿必须同时满足：

- 操作员明确指定测试文章。
- 操作员明确指定媒体资源。
- 预检通过。
- 操作员明确确认可能产生费用。

### 31. 测试策略总览

最终计划必须包含完整测试策略，覆盖媒体投稿核心、桌面端交互和真实投稿保护。

测试层级：

- 单元测试：media client、资源存储、媒体池、订单存储、文章转换、状态映射。
- 集成测试：media adapter + mock API、批次执行 + media adapter、订单同步。
- UI 测试：Electron 页面状态、平台选择、媒体选择、预检、确认按钮、订单中心。
- 手动验收：启动桌面端、刷新队列、选择平台、选择媒体、运行 dry-run、同步订单。
- 安全测试：未授权真实投稿时不得调用 send API；带图片文章默认阻止真实投稿；余额不足阻止真实投稿。

### 32. 理想操作流程

最终桌面端应支持以下媒体投稿操作流程，并以此作为 UI 和功能验收主线：

1. 打开桌面端。
2. 选择本次发布平台。
3. 刷新文章队列。
4. 进入媒体投稿中心。
5. 刷新或筛选媒体资源。
6. 将常用媒体加入媒体池。
7. 为每篇 `input/media` 文章选择媒体资源。
8. 查看预检：标题、媒体、费用、余额、图片风险。
9. 运行 dry-run。
10. 真实投稿前完成二次确认。
11. 投稿后进入订单中心。
12. 手动同步订单状态。

### 33. 进度记录方式

最终计划中的每个实施任务都需要记录执行进度，但不要写成冗长流水账。

每个任务记录：

```text
状态：未开始 / 进行中 / 已完成
验收：未验收 / 通过 / 未通过
提交：commit hash
```

含义：

- 新线程完成任务后更新对应任务状态。
- 验收通过后记录提交 hash。
- 验收未通过时记录阻塞原因，并先修复再继续。

### 34. 交付边界

第一轮交付做到本地 Electron 可运行，不包含安装包打包。

含义：

- 本轮重点是媒体投稿接入、桌面端流程、资源管理、订单跟踪和测试验收。
- 不引入 Electron 打包发布流程。
- 不处理安装包、自动更新、生产环境分发和跨机器配置迁移。
- 打包发布作为后续独立阶段规划。

## 实施任务拆解

新线程必须按以下任务顺序执行。每个任务完成后先审查和测试，验收通过后用中文提交 git，再继续下一个任务。

### 任务 1：提交清理后的 `auto—publish` 基线

状态：已完成  
验收：已验收  
提交：dcf2000

目标：

把已清理的 `auto—publish/` 作为当前仓库子目录纳入 git，形成后续改造基线。

要修改的模块：

- `auto—publish/`
- 根目录 git 状态

实现要点：

- 确认 `auto—publish/.git` 不存在。
- 确认复制产物已清理：`.playwright-cli`、`desktop/node_modules`、`published/`、`failed/`、`logs/`、`tmp/`、`work/` 不应作为基线提交。
- 保留源码、配置、文档、`input/` 空目录。
- 如果 git 不跟踪空目录，需要根据需要添加 `.gitkeep`。

审查点：

- 不提交 `.env`、`node_modules/`、运行记录或历史文章。
- 不把根目录独立媒体投稿脚本删除。
- 不恢复嵌套 git 仓库。

测试：

```powershell
git status --short --ignored
npm test
```

手动验收：

- `auto—publish/` 下只包含程序本体、配置和文档。
- 根目录测试通过。

中文提交示例：

```text
chore: 提交清理后的自动发文桌面端基线
```

继续条件：

- 基线提交完成。
- 工作区没有无关源码改动。

### 任务 2：修复乱码与基础可用性

状态：已完成  
验收：已验收  
提交：8470e82

目标：

修复 `auto—publish` 现有中文乱码，确保桌面端基础页面可阅读、可启动。

建议文件路径：

- `auto—publish/package.json`
- `auto—publish/src/core/platforms.js`
- `auto—publish/src/core/articles.js`
- `auto—publish/desktop/main.js`
- `auto—publish/desktop/renderer/index.html`
- `auto—publish/desktop/renderer/app.js`
- `auto—publish/desktop/renderer/styles.css`

实现要点：

- 修复 package 描述乱码。
- 修复主进程错误提示乱码。
- 修复队列、按钮、状态、日志提示等 UI 文案。
- 保持现有功能逻辑不变。
- 页面风格暂不大改，只保证可读和可操作。

审查点：

- 不重写发布流程。
- 不改变平台 adapter 行为。
- 不引入媒体投稿新功能。

测试：

```powershell
npm test
cd auto—publish
npm install
npm run desktop
```

如果 Electron 无法在当前环境启动，必须记录原因，并至少运行可执行的 Node 层检查。

手动验收：

- 桌面端首页无明显乱码。
- 启动后能显示平台、队列、日志区域。
- 现有 `lieju/toutiao/hepan` 平台不会因为文案修复而失效。

中文提交示例：

```text
fix: 修复自动发文桌面端中文乱码
```

继续条件：

- 桌面端基础 UI 可读。
- 测试或手动验收通过。

### 任务 3：支持本次发布平台选择

状态：已完成  
验收：已验收  
提交：ea75483

目标：

让桌面端支持选择本次要发布的平台，未选中的平台即使目录下有文章也不发布。

建议文件路径：

- `auto—publish/src/app/publish-batch.js`
- `auto—publish/src/core/platforms.js`
- `auto—publish/desktop/main.js`
- `auto—publish/desktop/worker/run-task.js`
- `auto—publish/desktop/preload.js`
- `auto—publish/desktop/renderer/app.js`
- `auto—publish/desktop/renderer/index.html`
- `auto—publish/desktop/renderer/styles.css`

实现要点：

- 复用现有 `platformIds` 过滤能力。
- 队列快照支持传入本次选中的平台。
- 桌面端平台列表提供勾选。
- “刷新队列”和“开始发布”都只针对选中平台。
- 默认可以全选当前 enabled 平台，避免破坏旧习惯。

审查点：

- 未勾选平台不得生成 Publication Job。
- 平台选择只是本次运行选择，不等于永久启用/禁用。
- 不做文章 × 平台矩阵。

测试：

- 单元测试：`buildBatchPlan({ platformIds })` 只返回指定平台任务。
- 手动测试：取消勾选某平台后刷新队列，该平台文章不计入本次总数。

手动验收：

- `lieju/toutiao/hepan` 可以单独勾选发布。
- 未选平台不会被发布。

中文提交示例：

```text
feat: 支持本次发布平台选择
```

继续条件：

- 平台选择逻辑通过测试。
- 桌面端平台勾选操作可用。

### 任务 4：迁入媒体投稿核心模块

状态：已完成  
验收：已验收  
提交：cfbc85c

目标：

把根目录已验证的媒体投稿能力迁入 `auto—publish`，作为桌面端和 CLI 可复用的核心模块。

建议文件路径：

```text
auto—publish/src/platforms/media/media-client.js
auto—publish/src/platforms/media/article-converter.js
auto—publish/src/platforms/media/submission-order-store.js
auto—publish/src/platforms/media/media-resource-store.js
auto—publish/src/platforms/media/media-draft-store.js
```

实现要点：

- 以根目录媒体投稿模块为行为参考。
- `auto—publish` 当前是 CommonJS，迁入模块优先使用 CommonJS。
- 支持网站媒体：媒体列表、投稿、订单详情、余额查询。
- 支持 `.docx/.txt` 转简单 HTML 和纯文本 fallback。
- 支持识别 `.docx` 是否包含图片及图片数量。
- 不实现真实带图投稿。
- 保留根目录独立 CLI，不删除。

审查点：

- API Key 不记录明文。
- 迁入后不要长期复制两套核心逻辑；后续 CLI 可逐步调用 `auto—publish` 内部模块。
- 图片识别不能误以为已支持带图投稿。

测试：

- media client mock 测试。
- article converter 测试。
- `.docx` 图片识别测试。
- store 写入/读取测试。

手动验收：

- 能在 `auto—publish` 内查询余额、拉媒体列表或通过 mock 验证接口参数。
- 带图片 docx 被识别为含图片。

中文提交示例：

```text
feat: 迁入媒体投稿核心模块
```

继续条件：

- 媒体核心模块测试通过。
- 没有真实投稿调用。

### 任务 5：建立本地媒体数据存储

状态：已完成  
验收：已验收  
提交：3dbf8c3

目标：

建立媒体资源缓存、媒体池、投稿草稿和订单记录的 JSON/JSONL 存储。

建议文件路径：

```text
auto—publish/data/.gitkeep
auto—publish/src/platforms/media/media-resource-store.js
auto—publish/src/platforms/media/media-pool-store.js
auto—publish/src/platforms/media/media-draft-store.js
auto—publish/src/platforms/media/submission-order-store.js
```

运行数据文件：

```text
auto—publish/data/media-resources.json
auto—publish/data/media-pool.json
auto—publish/data/media-drafts.json
auto—publish/data/submission-orders.jsonl
```

实现要点：

- `data/` 下运行数据默认不提交。
- 媒体资源缓存记录刷新时间、数量和原始字段。
- 媒体池支持添加、删除、启用、备注、标签。
- 草稿保存每篇文章的标题覆盖、媒体资源、备注、忽略图片选择。
- 订单 JSONL 保存订单号、文章、媒体、价格、状态、同步时间、raw。

审查点：

- 不保存完整 API Key。
- JSONL 追加不覆盖历史。
- 文件不存在时自动创建。

测试：

- store 单元测试。
- JSON/JSONL 读写测试。
- 忽略图片字段保存测试。

手动验收：

- 本地数据文件能生成、读取和更新。
- `.gitignore` 阻止运行数据误提交。

中文提交示例：

```text
feat: 增加媒体资源与订单本地存储
```

继续条件：

- 数据存储测试通过。
- 运行数据不进入 git。

### 任务 6：实现媒体资源库与媒体池

状态：已完成  
验收：已验收  
提交：eb79f91

目标：

在桌面端提供媒体资源库和常用媒体池，解决媒体资源多、难选择的问题。

建议文件路径：

- `auto—publish/src/platforms/media/media-client.js`
- `auto—publish/src/platforms/media/media-resource-store.js`
- `auto—publish/desktop/main.js`
- `auto—publish/desktop/worker/run-task.js`
- `auto—publish/desktop/preload.js`
- `auto—publish/desktop/renderer/index.html`
- `auto—publish/desktop/renderer/app.js`
- `auto—publish/desktop/renderer/styles.css`

实现要点：

- 媒体资源库手动刷新，不随桌面端启动自动全量请求。
- 显示缓存数量和上次刷新时间。
- 支持关键词搜索、价格区间筛选。
- 支持加入/移出媒体池。
- 投稿选择优先从媒体池选。
- 保留 `channelType` 或 `mediaType` 字段，第一版值为网站媒体。

审查点：

- 刷新媒体资源不是投稿，不需要二次确认。
- 搜索筛选走本地缓存。
- 资源字段缺失时 UI 仍可显示，不崩溃。

测试：

- mock 媒体列表分页/全量拉取。
- 筛选测试。
- 媒体池增删改测试。

手动验收：

- 点击刷新后能保存媒体资源缓存。
- 可搜索、按价格筛选。
- 可把媒体加入媒体池。

中文提交示例：

```text
feat: 增加媒体资源库和常用媒体池
```

继续条件：

- 媒体资源和媒体池可用。
- 不调用真实投稿接口。

### 任务 7：实现媒体文章队列与投稿草稿

状态：已完成  
验收：已验收  
提交：08f4090

目标：

新增 `input/media` 媒体投稿队列，并支持为每篇文章保存媒体选择、标题、备注和图片处理选择。

建议文件路径：

- `auto—publish/input/media/.gitkeep`
- `auto—publish/src/platforms/media/adapter.js`
- `auto—publish/src/platforms/media/media-draft-store.js`
- `auto—publish/src/platforms/media/article-converter.js`
- `auto—publish/desktop/renderer/app.js`
- `auto—publish/desktop/renderer/index.html`

实现要点：

- 媒体投稿只扫描 `input/media`。
- 标题优先级：正文一级标题/首行、文件名、UI 手动覆盖。
- 每篇文章必须能绑定不同 `Media Resource`。
- 支持批量应用同一媒体资源。
- 带图片文章默认阻止真实投稿。
- 操作员可显式勾选“忽略图片并继续投稿”。
- 草稿刷新后不丢失。

审查点：

- 未指定媒体资源不能通过预检。
- 图片风险必须显示。
- UI 不做复杂文章 × 平台矩阵。

测试：

- 扫描 `input/media` 测试。
- 标题解析测试。
- 草稿保存/恢复测试。
- 带图片阻止规则测试。

手动验收：

- `input/media` 文章出现在媒体投稿中心。
- 可逐篇选媒体。
- 可批量填充媒体。
- 刷新后选择不丢。

中文提交示例：

```text
feat: 增加媒体文章队列和投稿草稿
```

继续条件：

- 媒体文章队列和草稿可用。
- 带图风险能被识别。

### 任务 8：实现投稿预检与 dry-run

状态：已完成  
验收：已验收  
提交：b63ee2d

目标：

在真实投稿前提供预检和 dry-run，显示文章、媒体、费用、余额和风险。

建议文件路径：

- `auto—publish/src/platforms/media/preflight.js`
- `auto—publish/src/platforms/media/media-client.js`
- `auto—publish/desktop/renderer/app.js`
- `auto—publish/desktop/renderer/index.html`

实现要点：

- 预检显示文章数量、标题、媒体名称、`resource_id`、价格、合计预估费用、余额、图片风险。
- 余额不足阻止真实投稿。
- 价格缺失显示未知，但不绝对阻止。
- 带图片且未选择忽略图片时阻止真实投稿。
- dry-run 不调用真实投稿接口。
- 预检失败时禁用真实投稿按钮。

审查点：

- dry-run 不应调用 `/api/media/send`。
- 余额查询失败要明确展示。
- 付费风险提示清楚。

测试：

- preflight 单元测试。
- mock 余额查询测试。
- dry-run 不调用 send API 测试。
- 阻塞项测试：未选媒体、余额不足、带图未忽略。

手动验收：

- 预检页能清楚列出所有待投稿文章。
- 不满足条件时不能真实投稿。

中文提交示例：

```text
feat: 增加媒体投稿预检和 dry-run
```

继续条件：

- 预检规则测试通过。
- 未授权真实投稿保护有效。

### 任务 9：实现媒体 Platform Adapter 与 submitted 状态

状态：已完成  
验收：已验收  
提交：4408e87

目标：

把媒体投稿接入现有 `Platform Adapter` 和批次流程，新增 `submitted` 状态。

建议文件路径：

- `auto—publish/src/platforms/media/adapter.js`
- `auto—publish/src/core/jobs.js`
- `auto—publish/src/core/files.js`
- `auto—publish/src/app/publish-batch.js`
- `auto—publish/config/platforms.json`

实现要点：

- 新增 `media` adapter。
- `ensureSession/ensureLoggedIn/closeSession` 对媒体平台可为 no-op。
- `publishArticle()` 调用媒体投稿 API。
- API 成功后保存 Submission Order。
- API 成功返回 `submitted`，不返回普通 `succeeded`。
- 新增 `submitted/` 文件流转，投稿成功先移入 `submitted/`。
- 订单确认发布后再推进到 `published/`。

审查点：

- 不能把 API 提交成功显示为已发布。
- 真实投稿默认禁止，除非用户明确授权。
- 文件移动逻辑不能影响原有平台成功归档。

测试：

- media adapter mock 投稿测试。
- `jobs.js` 状态映射测试。
- submitted 文件流转测试。
- 真实投稿保护测试。

手动验收：

- 勾选 media 后可以生成媒体任务。
- dry-run 不投稿。
- mock 投稿成功后状态为 submitted。

中文提交示例：

```text
feat: 接入媒体投稿平台适配器
```

继续条件：

- submitted 状态打通。
- 不误归档到 published。

### 任务 10：实现订单中心与手动同步

状态：未开始  
验收：未验收  
提交：待记录

目标：

提供媒体投稿订单中心，支持查看订单和手动同步状态。

建议文件路径：

- `auto—publish/src/platforms/media/submission-order-store.js`
- `auto—publish/src/platforms/media/order-sync.js`
- `auto—publish/desktop/main.js`
- `auto—publish/desktop/worker/run-task.js`
- `auto—publish/desktop/preload.js`
- `auto—publish/desktop/renderer/app.js`
- `auto—publish/desktop/renderer/index.html`

实现要点：

- 展示文章标题、文件名、媒体名称、`resource_id`、订单号、状态、价格、投稿时间、最近同步时间、错误/备注。
- 支持状态筛选：已投稿、已发布、失败、未知。
- 支持同步单个订单。
- 支持同步全部未完成订单。
- 第一版不做后台定时同步。
- 平台返回未知状态时保存 raw 并显示 unknown。

审查点：

- 订单同步不应触发投稿。
- 同步失败不丢失历史订单。
- 已发布状态和 submitted 状态语义清楚。

测试：

- 订单状态映射测试。
- 单个同步 mock 测试。
- 批量同步 mock 测试。
- 未知状态测试。

手动验收：

- 订单中心能展示本地订单。
- 可手动同步。
- 同步后状态更新。

中文提交示例：

```text
feat: 增加媒体订单中心和手动同步
```

继续条件：

- 订单展示和同步可用。
- 不做自动轮询。

### 任务 11：重组桌面端导航与操作流程

状态：未开始  
验收：未验收  
提交：待记录

目标：

把桌面端从单一批处理控制台升级为清晰的发布工作台。

建议页面：

- 总览
- 文章队列
- 平台管理
- 媒体投稿
- 订单中心
- 日志
- 设置

建议文件路径：

- `auto—publish/desktop/renderer/index.html`
- `auto—publish/desktop/renderer/app.js`
- `auto—publish/desktop/renderer/styles.css`

实现要点：

- UI 风格保持工作台：清晰、密集、适合反复操作。
- 总览区分待发布、已投稿待出稿、今日已发布、失败/异常。
- 文章队列显示平台选择后的队列。
- 平台管理显示平台启用状态和本次是否选中。
- 媒体投稿页面承载资源库、媒体池、文章媒体选择和预检入口。
- 订单中心承载订单状态。
- 日志保留实时输出。

审查点：

- 不做营销式落地页。
- 文案清楚，无乱码。
- 文本不溢出按钮和卡片。
- 不把功能说明写成大段教程堆在页面上。

测试：

- UI smoke test。
- 平台选择交互测试。
- 媒体选择交互测试。
- 订单筛选交互测试。

手动验收：

- 操作员能按理想操作流程走完 dry-run。
- 页面信息层级清楚。
- 小屏和桌面尺寸不重叠。

中文提交示例：

```text
feat: 优化桌面端发布工作台页面
```

继续条件：

- 新导航和核心页面可用。
- 不破坏已有发布流程。

### 任务 12：全链路验收与文档收口

状态：未开始  
验收：未验收  
提交：待记录

目标：

完成端到端 dry-run 验收、文档更新和最终状态记录。

建议文件路径：

- `auto—publish/docs/media-submission-requirements-and-implementation-plan.md`
- `auto—publish/docs/media-submission-usage.md`
- 相关测试文件

实现要点：

- 补充用户使用说明。
- 补充开发者测试说明。
- 更新所有任务状态、验收结果和提交 hash。
- 记录真实投稿限制。
- 记录图片第一版边界。
- 记录后续图床/OSS 接入路线。

测试：

```powershell
npm test
cd auto—publish
npm run desktop
```

手动验收流程：

1. 打开桌面端。
2. 选择本次发布平台。
3. 刷新文章队列。
4. 进入媒体投稿中心。
5. 刷新或筛选媒体资源。
6. 加入媒体池。
7. 为 `input/media` 文章选择媒体。
8. 查看预检。
9. 运行 dry-run。
10. 确认未授权时不能真实投稿。
11. 查看订单中心空状态或 mock 订单状态。

验收：

- 所有自动测试通过。
- 核心手动流程通过。
- 文档可指导新操作者使用。
- 无真实投稿发生，除非操作员明确授权。

中文提交示例：

```text
docs: 完成媒体投稿接入验收文档
```

继续条件：

- 全部任务完成。
- 工作区干净。

## 后续扩展

- 接入第三方自媒体接口。
- 接入图床、OSS 或媒体图片上传接口，实现带图投稿。
- 将 JSON/JSONL 存储迁移到 SQLite。
- 基于历史订单表现实现媒体自动推荐。
- 增加后台定时订单同步。
- 增加 Electron 打包和发布流程。
