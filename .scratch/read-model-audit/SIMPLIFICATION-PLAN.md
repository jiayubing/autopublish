# 文章库产品简化

状态：COMPLETE / bounded re-review PASS。

用户确认已发布文章只保留发布详情，不需要正文查看；文章搜索不再需要。

范围：删除文章库全文搜索及无消费者的 store/service/IPC/bridge/feature 链路；发布详情直接展示现有摘要中的发布事实，移除历史正文读取能力。保留状态、批次、日期筛选和未发布文章编辑。完整持久发布证据、生命周期校验与原文章文件不变。

验证：定向文章摘要、发布事实、typed IPC、Renderer 交互回归；类型检查、构建、lint；Primary Review 后只做直接受影响范围的有界复审。证据绑定最终代码，不执行提交、推送或真实发布。

## 实现与复审

- 文章库删除搜索输入、搜索状态与全文扫描；清理 ArticleStore、ContentStore、snapshot、IPC 请求/返回 DTO、bridge 和 feature 的无消费者入口。
- 发布详情只使用已有摘要，保留平台、账号、投稿标题、时间、结果、链接及核对信息；删除正文展示、异步加载与完整档案 IPC 能力。点击已发布文章标题同样打开发布详情，不触发编辑器正文读取。
- 保留未发布文章编辑、状态/批次/日期筛选、投稿、回收站和详情链接；没有变更原文章、发布证据、生命周期事实读取及授权规则。
- Primary Review 检查删除链路、直接消费者和公开合同；浏览器证明无正文请求、标题不打开编辑器、日期过滤/空态与原编辑/投稿行为。完整证据损坏仍由内部查询拒绝，原生成到发布集成保留完整证据比对。
- 首轮 UI 回归暴露测试依赖旧搜索定位及 fixture 缺少正文读取计数，改为直接定位/状态筛选并增加实际调用计数，18 项通过。
- 全量回归唯一失败是布局测试仍等待已删除的文章搜索框；移除该过时分支，保留订单与资源搜索几何断言，并通过有界布局复跑。没有重新扩大审计。

## 最终验证

- 定向摘要/生命周期/生成到发布/typed IPC/发布详情：48/48，simplification-targeted.log。
- 文章库浏览器交互：18/18，simplification-ui-final.log；批次导航5项在 simplification-ui.log 中通过，随后全量运行也通过。
- 完整桌面回归：1760项，1759通过、1项旧布局测试失败，0 skip/cancel/todo，退出码1；见 simplification-desktop-final.log。该日志不冒充全绿。
- 唯一失败修复后，仅修改上述布局测试，完整布局文件12/12通过，退出码0，simplification-layout-final.log。未再次跑全量；其余源码/测试与全量运行时保持一致。
- packaging 49/49、production IPC matrix 6/6；lint、main/renderer/bridge typecheck、renderer/preload build、format check 通过。renderer build保留已有体积警告。
- 最终 git diff --check 通过。22份源码/测试 SHA-256 清单见 simplification-source-state.json，集合为 a5c80b34c840640078380dfc36f06e966ffd4ac6f3e0807229aa60c11dcab472。最终布局测试后未再变更源码/测试。

基线 HEAD：828ab1eff9bb137bbeed698d2bb0bb379f27e29f。本轮未 commit/push、远端CI、生成安装包或执行真实发布。该改变移除展示正文和全文搜索成本，不声称消除生命周期内部证据读取、首次摘要重建或全客户摘要枚举成本。历史 REMEDIATION/FOLLOWUP 记录已加当前产品行为引用。
