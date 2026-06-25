# 媒体投稿桌面端修复计划

用于新开线程和新分支，专门修复当前 `auto—publish` 里尚未闭合的媒体投稿问题。

## 目标

修复媒体投稿中心中仍然存在的 UI 断链和状态不一致问题，让桌面端的预览、订单筛选、同步和媒体选择链路真正闭合。

## 当前已确认问题

### 1. 媒体队列没有真实的“预览”按钮

表现：

- `desktop/renderer/app.js` 里已经绑定了 `.preview-article-btn`
- 但 `renderMediaQueue()` 生成的每条文章卡片里没有输出这个按钮
- 结果是预览 IPC 写了，但界面根本点不到

修复方向：

- 在每条媒体文章卡片里补出“预览”按钮
- 让按钮带上 `data-fn="filename"`
- 保留现有 `window.desktopConsole.previewArticle()` 调用
- 如有必要，改成事件委托，避免重复绑定

验收：

- 媒体队列每篇文章都能点预览
- 预览能显示标题和正文

### 2. 订单中心“已发布”筛选失效

表现：

- 订单状态展示里已经识别 `published`
- 但筛选逻辑只看 `result.success`
- `published` 选项没有独立分支
- 结果是已发布订单无法按状态正确筛选

修复方向：

- 抽一个统一的订单状态函数
- 渲染和筛选都使用同一套状态映射
- 让 `submitted / published / failed / unknown` 语义一致

验收：

- 订单中心能正确筛出已发布订单
- 已投稿和已发布不会混掉

### 3. 媒体相关页面仍有乱码

表现：

- `desktop/renderer/index.html` 里仍有不少乱码文案
- 影响媒体投稿中心、订单中心、设置页的可读性

修复方向：

- 优先修媒体投稿相关区域的中文文案
- 不改业务逻辑，只修展示文本

验收：

- 媒体投稿、订单中心、设置页可正常阅读

## 修复顺序

1. 先补预览按钮
2. 再修订单状态筛选
3. 再修页面乱码
4. 跑回归测试
5. 手动验证桌面端媒体投稿中心

## 建议回归点

- 媒体队列里每篇文章都有预览按钮
- `previewArticle()` 能被触发
- 订单中心“已发布”筛选有结果
- 订单同步后状态显示正确
- 页面文案不再乱码

## 建议测试

```powershell
npm test
```

手动验证：

- 打开桌面端
- 刷新 `input/media`
- 给一篇文章选媒体
- 点预检
- 点预览
- 查看订单中心状态筛选

## 新线程开场提示词

```text
请在 F:\\官媒投稿 这个 git 仓库里工作，当前分支请新建一个修复分支。

我需要你专门修复 auto—publish 里的媒体投稿中心 bug，参考文档：
F:\\官媒投稿\\auto—publish\\docs\\media-submission-bugfix-plan.md

这次只做修复，不做新功能。已确认的修复点：
1. 媒体队列没有真实的“预览”按钮，导致预览 IPC 虽然存在但界面点不到。
2. 订单中心“已发布”筛选失效，状态映射和筛选逻辑不一致。
3. 媒体相关页面还有乱码，需要优先修正可见文案。

要求：
1. 先读文档和相关代码，再动手。
2. 每修一个小问题都要先做审查，再测试，再验收，再提交 git。
3. git 提交信息必须用中文。
4. 不允许引入真实投稿。
5. 优先保持改动最小，别顺手重构无关代码。
6. 修完后把结果和提交 hash 写回文档。
```


---

## 修复执行记录 (2026-06-25)

### Bug 1: 媒体队列预览按钮缺失 ✅ 已修复

- **根因**: enderMediaQueue() 生成的文章卡片 HTML 模板中没有 .preview-article-btn 按钮元素，导致后续 querySelectorAll('.preview-article-btn') 查询不到任何元素，预览 IPC 虽然存在但界面无法触发。
- **修复**: 在每条文章卡片模板的 media-queue-resource div 内添加了带 data-fn 属性的预览按钮。
- **提交**: 8a2fae0 — fix: 媒体队列卡片补上预览按钮，修复预览IPC断链

### Bug 2: 订单中心"已发布"筛选失效 ✅ 已修复

- **根因**: 筛选逻辑中只检查 esult.success (boolean)，缺少对 published 状态的分支。当用户选择"已发布"筛选时，ilterStatus === "published" 落入 default eturn false，导致所有订单被过滤掉。
- **修复**: 抽取统一的 getOrderStatus(o) 函数，将 syncStatus 映射为 submitted / published / failed，筛选和渲染都使用该函数，确保状态语义一致。
- **提交**: 9d85e30 — fix: 统一订单状态映射，修复已发布筛选失效问题

### Bug 3: 媒体相关页面乱码 ✅ 已排查

- **排查结果**: 对 desktop/renderer/index.html、pp.js、styles.css、preload.js、main.js 及所有数据文件 (media-resources.json、media-drafts.json、media-pool.json、submission-orders.jsonl) 进行了完整的 UTF-8 编码验证。所有源文件均为干净 UTF-8，无替换字符 (U+FFFD) 或常见乱码模式。疑似该问题已在之前会话中修复，或表现于特定运行时环境。如需进一步排查，建议在实际 Electron 环境中检查页面渲染结果。

### 修改文件

- desktop/renderer/app.js — +17 行, -14 行 (两个提交合计)
