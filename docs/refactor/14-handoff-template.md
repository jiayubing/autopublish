# 阶段交接模板

每个阶段完成或跨任务暂停时，在`docs/refactor/handoffs/phase-XX.md`创建交接。交接用于替代聊天历史，必须足以让新的Codex任务在不读取旧对话的情况下继续。

```md
# 阶段XX交接：阶段名称

## 1. 状态

- 状态：IN_PROGRESS / BLOCKED / COMPLETE / PENDING_HUMAN
- 开始分支与commit：
- 当前分支与commit：
- 工作区状态：
- 执行日期与环境：

## 2. 已完成结果

- 以可观察结果列出，不写“完成了重构”。

## 3. 权威interface与schema

| 名称 | 文件 | Caller | 不变量/错误模式 |
|---|---|---|---|

## 4. Production调用图

从真实入口列到domain/application、store、adapter和外部结果；明确唯一writer和生命周期owner。

## 5. 修改文件

- 本阶段新增：
- 本阶段修改：
- 本阶段删除：
- 用户已有但未触碰：

## 6. 已删除旧路径

| 旧seam/writer | 删除/替代证据 | 静态0引用检查 |
|---|---|---|

## 7. 数据与迁移

- Schema版本：
- Dry-run fixture：
- 正式迁移演练：
- Backup/restore：
- 冲突/人工项：
- 回滚结果：

## 8. 测试证据

| 命令 | 结果 | 测试数量 | Skip | 环境/fixture |
|---|---|---:|---:|---|

列出故障注入点及每个可观察结果。

## 9. 偏差与决定

- 相对阶段计划的偏差：
- 更新的CONTEXT/ADR：
- 为什么没有扩大interface：

## 10. 未完成与阻塞

- 代码未完成：
- 自动验证未完成：
- PENDING_HUMAN：
- 触发的停止条件：

## 11. 下一任务入口

- 必读文件：
- 首个production symbol：
- 首个失败测试：
- 允许修改范围：
- 禁止修改范围：
- 下一阶段是否READY：
```

## 交接质量门

- 不依赖“见上个聊天”“如前所述”等外部上下文。
- 每个结论有文件、symbol、测试或报告证据。
- 不包含Cookie、API key、客户正文、生产路径或原始DOM。
- `COMPLETE`交接必须逐条回答阶段完成条件。
- `IN_PROGRESS`交接必须指出下一个最小可执行动作，而不是只描述总体方向。

