# 读模型审计与修复

- 范围：ArticleStore / ContentStore、标题、文章管理、投稿权限、attention、队列与 Renderer 的直接读取链。审计后按用户授权修复，不迁移生产存储/schema。
- 基线：8662e11dddfe43602b179c0afdbf38b4f11a2174。开始审计时工作树干净；此前 CI 修复已由工作区后续提交纳入。
- 最小阅读集：根 README、docs/AI-ENTRY、docs/WORK-INDEX、应用 AGENTS、AUDIT-PROTOCOL、SPEC 的权限复核条款及直接 owner/调用方/测试。
- 方法：一次 Primary Audit，公开接口合成探针与相关现有测试；区分事实 owner、纯投影、持久缓存、运行期缓存。只对有证据的问题定级，不预设统一缓存方案。
- 状态：COMPLETE。审计基线保留在 AUDIT.md；修复、测量、边界与最终验证见 REMEDIATION.md。

## 修复执行

1. R2：attention 只按候选文章查询，空结果不读内容；用真实存储组合回归验证。
2. R1/R3：共用 ArticleStore 派生摘要读取；标题按已知文章身份读取，列表与详情合同分离；保留正文搜索和正式写操作的权威正文复核。
3. R4：在 workspace invalidation owner 中收敛缓存依赖版本，不改变公开事件的单调 revision。
4. R5：媒体读取保持独立 owner，消除同版本资源文件重复解析。
5. 运行受影响行为/安全/类型与 UI 测试，按原 findings 做 bounded re-review；记录最终证据。

不迁移生产 schema、不执行真实外部操作、不提交或推送。新摘要只能是可丢弃重建的派生数据，不能成为投稿授权 owner。

## 最终结果

- R1–R5 已按本轮范围闭合；bounded re-review PASS。未增加数据库/后台线程或 UI 专属持久缓存。
- 最终桌面测试 1755/1755，打包合同 49/49，迁移 68/68，IPC 矩阵 6/6；lint/typecheck/renderer 与 preload build/format 全通过。
- 实测已知标题冷读从全库 4000 文件降为 1 份摘要；空 attention 0 读取；无关问题更新后 management 0 读取。
- 仍保留：老文件无缓存首次校验、显式全文搜索、不可变发布档案正文与同步 stat 成本。详细边界及未来 owner 见 REMEDIATION.md。
- Git：基线 HEAD 不变，未提交/推送；source-state.json 绑定最终修改文件。用户另增 pelican-bicycle.html 未触碰。
