# 媒体工作台修复工作记录

> **日期:** 2026-06-28 ~ 2026-06-29
> **分支:** repairdeep → master
> **状态:** 已合并

---

## 修复概览

共完成 7 个提交，修复了媒体工作台（media-workbench）从 React 迁移后遗留的多个关键 Bug，恢复了完整业务流程能力。

---

## 逐项修复记录

### 1. 基础设施修复（b596689）
**问题：** 白屏、侧边栏点击无响应、金额显示 `[object Object]`、文章预览无内容、UTF-8 编码损坏导致大量乱码

**修复内容：**
- `App.tsx`: 侧边栏 prop 名称不匹配（`onNavigate` → `onViewChange`），补全缺失 props
- `electron-api.ts`: `getBalance` 返回对象而非数字，导致金额显示异常
- 从 git 恢复被编码损坏的 `ArticleEditor`/`ArticleList`/`ResourceLibrary`，修复全部 UTF-8 乱码
- 文章预览：打开文章时调用 `previewArticle` 获取正文内容
- `ArticleEditor` 新增草稿加载（`getDraft`）和关闭前自动保存
- 清理 `ArticleList` 中残留的 mock 稿件生成逻辑

### 2. 资源库全量加载 + 资源池筛选（2d28c7f）
**问题：** 媒体资源库只拉取 200 项（实际有 1 万+），且无法筛选入资源池

**修复内容：**
- 资源库初始加载从 200 条改为全量拉取（99999）
- 新增「刷新库」按钮，从 API 逐页拉取全部资源
- 管理模式每条资源增加书签按钮，加入/移出资源池
- 工作台编辑稿件时右侧仅显示已入池资源
- 资源池状态实时同步 Electron IPC

### 3. 媒体价格显示修复 + 页面整合（68e8e7c）
**问题：** 媒体价格全部显示为 0，独立的媒体资源库页面冗余

**修复内容：**
- `normalizeResource` 价格字段改用 `Number()` 转换，兼容服务端返回的字符串价格
- 移除侧边栏独立的「媒体资源库」页面，功能已整合到工作台右侧资源面板
- 工作台资源面板兼具管理模式（未选文章时）和选用模式（选中文章时）

### 4. 字数统计修复 + 页面重命名（9a249c8）
**问题：** 文章字数统计全部显示为 0，页面标题需改为「付费媒体投稿」

**修复内容：**
- `normalizeArticle` 字数从 `content` 字符数计算（去空白），兼容服务端未返回 `words` 字段
- 侧边栏和工作台标题从「稿件与工作台」改为「付费媒体投稿」

### 5. 服务层字数统计（0e97c5c）
**问题：** 字数仍显示为 0，需要在服务端计算

**修复内容：**
- `scanArticles` 扫描时读取 txt/md 文件内容并计算去空白字符数
- 返回 `words` 字段供前端直接展示，docx 文件暂计为 0

### 6. 正则修复（bbb1feb）
**问题：** 正则表达式因 PowerShell 字符串转义变成字面量 `\\s`

**修复内容：**
- 正则 `/\s/g` 正确匹配空白字符，字数统计恢复正常
- 文章标题已通过 `autoTitle` 取第一段

### 7. 双重保障字数统计（f6e664f）
**问题：** 字数统计仍有边缘 case 显示为 0

**修复内容：**
- 服务层 `scanArticles` 对 txt/md 文件计算去空白字符数
- React 层 `onOpenArticle` 调用 `previewArticle` 后从返回的 `content` 二次计算字数
- 同时更新 `articles` 列表中的字数，确保列表和编辑器一致

---

## 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `media-workbench/src/App.tsx` | Bug 修复 |
| `media-workbench/src/components/ArticleEditor.tsx` | 功能增强 |
| `media-workbench/src/components/ArticleList.tsx` | 清理 mock |
| `media-workbench/src/components/OrdersView.tsx` | 编码恢复 |
| `media-workbench/src/components/PreflightModal.tsx` | 编码恢复 |
| `media-workbench/src/components/ResourceLibrary.tsx` | 资源池功能 |
| `media-workbench/src/components/Sidebar.tsx` | 页面重命名 |
| `media-workbench/src/electron-api.ts` | API 修复 |
| `media-workbench/src/mockData.ts` | 编码恢复 |
| `media-workbench/src/types.ts` | 类型更新 |
| `desktop/services/media-workbench-service.js` | 服务层字数计算 |
| `docs/desktop-workbench.md` | 文档更新 |
| `docs/media-workbench-ui.md` | 文档更新 |
| `tests/media-workbench-flow.test.js` | IPC 合约测试 |

---

## 后续继续建议

1. **免费投稿媒体对接：** 当前仅对接了付费媒体，还需要对接免费的媒体发文渠道
2. **docx 文章字数：** 目前仅支持 txt/md 的字数统计，docx 文件字数暂为 0
3. **资源库性能优化：** 资源库全量加载 1 万+ 条数据，数据量大时建议加虚拟滚动
4. **草稿系统完善：** 当前草稿自动保存已实现，可进一步增强版本管理
5. **测试覆盖：** 核心流程已有测试，建议补充资源池和价格相关的边界测试

---

## 运行测试

```powershell
node --test tests/media-workbench-flow.test.js tests/media-article-drawer-boundary.test.js tests/media-workbench-service.test.js
```

## 启动应用

```powershell
npm start
```

