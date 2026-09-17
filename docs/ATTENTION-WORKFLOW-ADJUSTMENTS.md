# 需处理入口交互调整

状态：COMPLETE。基线：P2/P3 合并后主线 `9caf19ce`。

## 当前范围

- 批量重新生成仅导航到现有四步批量生成，去重预选客户，允许选择模板和来源；不在需处理页启动 AI 或呈现进度。
- 生成运行与原文章改投入队解耦；原队列应用、配置、账号和生命周期校验保留。
- 改投无可用目标时逐平台解释原平台冲突、配置和绑定问题，可刷新或进入设置。截图不足以断定真实账号配置，不能假设缺少绑定时可跳过验证。
- 无真实 AI、登录、投稿、生产数据操作；不改 `work/`。

## 验证与审查

- 已有需处理浏览器用例更新为导航、客户去重预选、可选模板、不创建生成任务，以及生成运行时仍可批量改投；保留原预检、部分结果、stale 和不确定入队回归。
- 验证对应代码提交 `f10949d3ec34ec013354eaaaef13e8071fb7ad1b`；其后只补本文档。测试启动后生产代码与测试文件未再修改。
- `npm test`：596/596；`npm run test:integration`：1244/1244，无失败、跳过或 todo。
- main/renderer/bridge typecheck、ESLint、renderer/preload build、`git diff --check` 通过。仅有已有 bundle-size 提示。
- Primary review 检查导航预选、客户端资料加载、运行批次与草稿分离、改投加载/配置/账号/stale/partial/uncertain 边界。修正草稿准备时客户选择仍被旧运行状态禁用、刷新后保留失效目标的问题；bounded re-review 及直接浏览器回归通过，无未关闭阻塞 finding。
- Playwright 技能用于执行既有临时 fixture 浏览器测试；没有连接真实应用或调用真实 AI/发布服务。未运行发布打包及真实账号验收，本任务不包含这些外部操作。
- 日志位于未提交的 `auto—publish/build/test-results/attention-adjust-core.log` 与 `attention-adjust-integration.log`。产品行为更新到根 SPEC；同步日常开发目录后重新构建使用。
