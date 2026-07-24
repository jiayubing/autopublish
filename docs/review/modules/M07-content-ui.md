# M07 内容工作台深审

> 深度审查状态：已完成（全部内容 UI 生产文件、直接 bridge/IPC 契约与相关测试已检查）。

## 模块职责和边界

`ContentWorkbench` 管理客户、问题采集、文章生成和历史文章子视图；`GeneratedArticlesView`/`article-management-controller.js` 管理文章管理、投稿批次、需处理项和回收事务；各内容子组件通过 bridge 调用主进程。

## 已检查范围与关键调用链

检查 `components/ContentWorkbench.tsx`、`components/content/*.tsx`、`article-management-controller.js`、`article-history-logic.js`、`article-workflow.ts`、`content-generation-ui-logic.js`、`content-question-editor-session.ts`、`generation-runtime-snapshot-logic.js`、content/publication bridge 及对应 renderer tests。

## 发现列表

### TEMP-M07-1：单篇生成响应未绑定当前客户，会把旧客户文章注入新客户会话

- 分类：并发/客户隔离
- 所属模块：M07
- 严重程度：高
- 置信度：高
- 验证状态：已验证
- 位置：`components/content/ArticleGenerationView.tsx:175-185`
- 问题描述：生成请求闭包内比较 `article.clientId !== clientId`，其中 `clientId` 是请求发起时捕获值，并非切换后的当前客户；切换客户后旧响应仍执行 `onArticleChange`。
- 代码证据：179 行发起 `generateContentArticle`，180 行只与闭包变量比较，181 行无条件设置选中文章；没有 request id 或 ref 读取最新 client。
- 触发条件：客户 A 发起慢速 AI 生成，在响应返回前切换到客户 B。
- 可达路径或调用链：ContentWorkbench `handleClientChange` 清空 article → ArticleGenerationView 仍挂载 → A 的响应返回 → `onArticleChange(article)` → B 页面展示/编辑 A 文章。
- 实际影响：跨客户 UI 数据混淆；后续保存/导出操作可能在错误客户上下文中发起，破坏客户边界信任。
- 影响范围：文章生成、历史编辑和后续投稿。
- 现有测试是否覆盖：客户切换回归只覆盖历史入队/撤销，不覆盖慢速生成响应。
- 验证方法与结果：静态闭包分析确认比较对象为旧 props；未修改代码复现。
- 修复方向：为生成/预览/导出建立 client-scoped request identity，响应必须匹配最新 client 和请求序号。
- 关联发现：TEMP-M06-1

### TEMP-M07-2：内容确认仍调用原生 confirm，绕过统一模态宿主

- 分类：契约/可访问性
- 所属模块：M07
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`components/content/QuestionCollectionView.tsx:209,218,230,246,271`、`BatchGenerationView.tsx:268,335`、`GenerationBatchDetail.tsx:43`、`ArticleAttentionPanel.tsx:65`
- 问题描述：项目上下文要求所有确认对话框由独立 modal host 负责 backdrop、焦点和 Escape；内容路径仍直接调用 `window.confirm`/`confirm`。
- 代码证据：上述行对删除问题、覆盖回答、批量采集、AI 风险、继续/取消生成、需处理项动作直接调用原生确认。
- 触发条件：执行任一内容删除、覆盖、批量生成或需处理动作。
- 可达路径或调用链：内容按钮 → 原生浏览器确认 → 不经过 `ConfirmationHost`/`ActionConfirmationModal`。
- 实际影响：确认 UI 不受统一焦点/样式/测试契约控制；Electron 环境和自动化测试行为不一致。
- 影响范围：内容采集、生成、需处理中心。
- 现有测试是否覆盖：部分测试明确只检查某些路径无 native dialog，未覆盖上述全部调用。
- 验证方法与结果：`rg -n "window\.confirm|\bconfirm\(" media-workbench/src/components/content` 命中上述生产调用。
- 修复方向：全部改用统一 `useConfirmation` 或受控 ActionConfirmationModal。
- 关联发现：TEMP-M08-2

### TEMP-M07-3：永久删除预检异常未进入 UI 错误处理

- 分类：错误处理
- 所属模块：M07
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`components/content/GeneratedArticlesView.tsx:485-506`
- 问题描述：`permanentlyDeleteOne` 在 try/catch 外先 await `preparePermanentDeleteContentArticle`，按钮用 `void` 调用；预检拒绝会产生未处理 Promise，用户没有错误反馈。
- 触发条件：回收站条目被并发修改、事务/身份不再满足永久删除预检。
- 可达路径或调用链：点击“永久删除正文” → `void permanentlyDeleteOne` → 第 486 行预检 reject → 后续 catch 不会执行。
- 实际影响：危险操作失败时页面无原因提示，用户可能重复点击或误判已删除。
- 影响范围：回收站永久删除。
- 现有测试是否覆盖：未见预检失败的 renderer 交互测试。
- 验证方法与结果：静态控制流确认 reject 点位于 try 之前。
- 修复方向：把预检纳入同一 try/catch，并在当前客户仍有效时显示错误。
- 关联发现：TEMP-M07-1

## 测试情况

- `node --test tests/renderer-workbench-controller-seams.test.js tests/renderer-content-refresh-lifecycle.test.js tests/renderer-content-confirmation-flow.test.js`：5 通过、2 失败；失败测试仍要求已弃用的 `usePlatformWorkbenchController`/`useArticleManagementSnapshot` seam。
- `npm --prefix media-workbench run lint`：通过。

## 未覆盖区域

未执行慢速 AI/客户切换真实浏览器复现；未覆盖所有内容确认分支的焦点循环。

## 模块审查结论

客户切换保护在文章管理控制器中较完整，但单篇生成路径仍有明确旧响应注入风险；确认入口和删除预检也有边界缺口。M07 深审已完成，结论为不通过。
