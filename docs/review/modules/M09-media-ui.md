# M09 媒体/订单/资源 UI 深审

> 深度审查状态：已完成（生产文件、直接 bridge/IPC/service 契约与相关测试已检查）。

## 模块职责和边界

App 维护媒体稿件、资源池、余额和订单顶层状态；`ArticleList`/`ArticleEditor` 编辑稿件草稿；`ResourceLibrary` 分页/搜索资源；`OrdersView` 展示订单；`PreflightModal` 执行资源级投稿确认。主进程 media IPC 负责扫描、草稿和资源服务。

## 已检查范围与关键调用链

检查 `App.tsx`、`ArticleList.tsx`、`ArticleEditor.tsx`、`ResourceLibrary.tsx`、`OrdersView.tsx`、`PreflightModal.tsx`、`bridge/media.ts`、`desktop/ipc/media-ipc.js`、`desktop/services/media-workbench-service.js`、`media-resource-service.js` 及媒体 renderer tests。

## 发现列表

### TEMP-M09-1：打开稿件会把已保存备注和忽略图片标记重置并写回

- 分类：数据一致性/输入状态
- 所属模块：M09
- 严重程度：高
- 置信度：高
- 验证状态：已验证
- 位置：`components/ArticleEditor.tsx:2-3,44-50,90-100`、`desktop/services/media-workbench-service.js:241-251`
- 问题描述：主进程扫描已将 draft.remark/ignoreImages 注入 article；编辑器切换 activeArticle 时却无条件 `setRemark('')`、`setIgnoreImages(false)`。随后点击关闭会自动保存这些默认值。
- 触发条件：已有备注或 `ignoreImages=true` 的稿件被打开后直接关闭，或未重新勾选后保存。
- 可达路径或调用链：`scanArticles` 读取 draft → App 设置 activeArticle → ArticleEditor effect 清零字段 → `handleClose` → `onSaveDraft` → `media:set-draft` 覆盖。
- 实际影响：备注丢失；含图片稿件的忽略图片设置被取消，可能重新阻断预检或改变投稿行为。
- 影响范围：媒体稿件草稿及投稿预检。
- 现有测试是否覆盖：编辑器边界测试只验证组件边界，不验证 draft 字段回读/关闭。
- 验证方法与结果：静态调用链已确认；`getDraft` 在 ArticleEditor 中仅导入未使用。
- 修复方向：从 activeArticle 初始化 remark/ignoreImages，关闭前只保存用户实际修改。
- 关联发现：TEMP-M06-1

### TEMP-M09-2：顶层资源请求用 99999 pageSize，把全量资源复制进主进程/IPC/renderer

- 分类：性能/容量
- 所属模块：M09
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`App.tsx:89,127`、`desktop/services/media-resource-service.js:41-61,203-215`
- 问题描述：虽然资源组件支持分页，App 初始和刷新都请求 `pageSize:99999`；服务端分页实现无上限，返回整个缓存数组。
- 触发条件：资源数量增长或刷新资源后进入媒体工作台。
- 可达路径或调用链：App mount/刷新 → `getResourcePage({pageSize:99999})` → `paginate` slice 全量 → structured clone → React state。
- 实际影响：启动延迟、主进程和 renderer 内存峰值、资源列表渲染卡顿；容量增长没有保护阈值。
- 现有测试是否覆盖：`renderer-resource-library-api` 反而断言 99999，未验证容量。
- 验证方法与结果：定向媒体测试通过；源码确认 pageSize 无上限。
- 修复方向：顶层只取首屏，搜索/翻页按需请求；为服务 pageSize 设安全上限。
- 关联发现：TEMP-M06-1

### TEMP-M09-3：订单“清空记录”只清空 React 状态，重新加载即恢复

- 分类：UI/状态所有权
- 所属模块：M09
- 严重程度：低
- 置信度：高
- 验证状态：已验证
- 位置：`App.tsx:245-248`、`components/OrdersView.tsx:97-101`
- 问题描述：按钮标签为“清空记录”，回调仅 `setOrders([])`，没有调用持久化删除或服务端清理接口。
- 触发条件：用户点击订单页“清空记录”后切换页面或触发订单刷新。
- 实际影响：用户误以为订单记录已删除；刷新后记录再次出现，造成状态语义不可信。
- 现有测试是否覆盖：未见清空后重新加载的行为测试。
- 验证方法与结果：源码确认 preload/bridge 没有清空订单命令，回调仅更新内存。
- 修复方向：改为明确的“隐藏本次视图”或实现受控持久化清理并确认。

## 测试情况

- `node --test tests/media-resource-ux.test.js tests/renderer-resource-library-api.test.js tests/media-article-drawer-boundary.test.js`：全部通过。
- `npm --prefix media-workbench run lint`：通过。

## 未覆盖区域

未运行大规模资源容量测试；未做 Electron IPC structured-clone 内存测量。

## 模块审查结论

资源分页 API 存在但顶层绕过分页；更严重的是编辑器字段初始化会覆盖持久化草稿。M09 深审已完成，结论为不通过。
