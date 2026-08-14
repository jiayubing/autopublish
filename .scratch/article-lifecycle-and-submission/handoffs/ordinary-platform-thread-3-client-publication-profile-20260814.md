# 普通平台投稿 Thread 3 交接：文章管理页客户级列举网投递档案

## 执行结果

Thread 3 已完成实现与定向验证。基线 integration HEAD：`b5d3328f7a099e9d9a49d3a4b7efc8cbb2987ba0`。

当前仍为 dirty worktree，未创建 implementation commit；按 Manual Dispatch 规则未自动执行 Primary Audit、commit、merge 或后续 Thread。

## 范围内改动

- 新增 `ClientLiejuPublicationProfileEditor`，入口位于文章管理当前客户区域，明确显示当前客户和“列举网投递档案”状态。
- 城市、联系人、电话继续读写既有 `customer.publicationProfiles.lieju`，复用既有 content command / IPC / service / 原子持久化链路。
- 从 `BatchGenerationView`、`ArticleGenerationView` 移除档案输入、draft state 和保存逻辑；AI 生成页不再承担客户投稿档案维护。
- `ContentWorkbench` 只把当前客户和既有保存命令接到 `GeneratedArticlesView`；未新增第二套客户或文章数据 owner。
- 未修改账号 Session、队列、Lieju selector、发布结果、图片、付费媒体或文章生命周期。

## 数据流

```text
ContentWorkbench 当前客户
  -> GeneratedArticlesView
  -> ClientLiejuPublicationProfileEditor
  -> content.commands.saveClientLiejuPublicationProfile
  -> 既有 client.json / customer.publicationProfiles.lieju
```

普通平台 preparation 继续按 claim 的文章 `clientId` 读取客户档案，并只把准备后的 `city/contact/phone` 传给 Adapter；Thread 3 未改变该 owner。

## 验证 evidence

环境：Windows / PowerShell，Node `v24.16.0`。

- `node --test tests/renderer-lieju-publication-profile.test.js tests/renderer-article-management-flow.test.js tests/architecture-seams.test.js tests/renderer-encoding.test.js tests/client-knowledge.test.js tests/ai-content-ipc.test.js tests/phase-06-content-workbench-feature.test.mjs tests/article-lifecycle-ticket-08.test.js`：75/75 PASS。
- `node --test tests/phase-06-production-ipc-fixture-matrix.test.js`：36/36 PASS；131/131 production capabilities TypeChecker identity 与 registry/event guards 通过。
- `npm run lint`：PASS。
- `npm --prefix media-workbench run lint`：PASS。
- `npm --prefix media-workbench run typecheck:strict`：PASS。
- `npm --prefix media-workbench run build`：PASS；仅有既有的 chunk 大小 warning。
- `git diff --check`：PASS。

新增渲染测试验证文章管理页面展示当前客户、城市、联系人、电话和客户档案说明；既有 client knowledge / content feature 测试验证持久化与客户隔离；`article-lifecycle-ticket-08` 验证 preparation 使用所属客户档案。

## 未解决问题

以下不属于 Thread 3，未在本线程修改：

- Thread 1：列举网账号 / Session 自动暂停；
- Thread 2：移出队列后的文章生命周期缓存失效；
- Thread 4：Lieju runtime 与输入适配；
- Thread 5：列举网远端结果识别；
- Thread 6：真实端到端发布验收；
- Thread 7：需处理页面整理。

