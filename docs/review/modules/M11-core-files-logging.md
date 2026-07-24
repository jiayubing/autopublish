# M11 核心文件、文章解析与日志深审

> 深度审查状态：已完成。

## 模块职责和边界

扫描普通平台输入、解析 Markdown/DOCX、规范文件名、失败复制、已发布文件与 sidecar 的分阶段归档，以及进程内/文件日志。

## 已检查的目录与关键文件

- `src/core/{files,articles,article-text,docx-text-extractor,logger}.js`。
- 直接调用的 workspace paths/config、publication worker/archive tests、DOCX fixture 与打包验证。

## 关键调用链

平台 snapshot/worker → adapter 自有扫描或 `scanArticles` → `parseArticleFiles` → adapter；远端确认后 → `archivePublishedArticle` 分阶段移动正文和 sidecar，失败时逆序回滚；日志同步追加 `publish.log` 并广播进程内 listener。

## 发现列表

未发现需要独立编号的产品缺陷。日志事件缺少 renderer 消费归入 M05；远端成功后 ledger/归档顺序问题归入 M24；`src → desktop` 反向依赖作为横向架构耦合记录，不重复建立模块 finding。

## 测试情况

DOCX、archive collision/rollback、路径注入和打包运行时定向测试通过；相关验证包含在 147 项通过结果中。

## 未覆盖区域

未对超大 DOCX/Markdown 做容量基准；未模拟跨卷 rename（生产队列和归档在同一内容库根）。

## 待验证问题

真实磁盘满、只读和杀毒锁文件下的恢复体验未现场验证。

## 模块审查结论

本模块失败语义总体明确，风险主要来自上层跨存储协调；M11 深审已完成，结论为通过。
