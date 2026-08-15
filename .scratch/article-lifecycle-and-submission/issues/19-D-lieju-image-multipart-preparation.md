# 19-D — 列举网图片交付与 Multipart 准备

**Goal:** 消费 Ticket 18 冻结 image plan，通过 Ticket 17 resolver 在准备期安全获取 0–4 张实际可交付图片，构建不可重放的冻结 multipart 计划，但不发送 POST。

**Blocked by:** 19-C `COMPLETE`。

## 主 owner / 允许修改

- 列举网 adapter 私有 image delivery / multipart preparation 模块。
- 18-D 提供的 imagePlan prepare seam 之列举网消费端。
- Ticket 17 resolver 仅作公开调用；不改其扫描 / 路径 owner。

## 本包职责

1. 每张候选在准备当下重新通过 Ticket 17 resolver 验证客户边界、常规文件、格式和当次 1 MB 限制。
2. 按 image plan 顺序处理，最多交付当次表单真实可用的 4 个槽；超出平台容量的候选按 best-effort 跳过。
3. 将成功图片连续映射到 `local_file1..N`；`photodb[N]` / `piddb[N]` / `ftype[N]` 按真实 form 当次合同保留，不猜测值。
4. 任一图片失败只产生安全 warning 并减少成功集；0 图继续文字准备，不生成 decision / retry / replace UI。
5. 最终 evidence 只记录实际准备成功图片 fingerprint 和 0-based 图集 `layoutSlot`；绝对路径和 bytes 只存活于不可序列化 capability。

## 禁止跨界

- 不修改 Ticket 17/18 选图、队列或通用 evidence schema。
- 不进行网络 POST，不轮询图片 URL，不为失败图片建立人工处理事项。
- 不因图片失败返回 `article_rejected` / `group_blocked`。

## Acceptance criteria / 最低验证

- [ ] 0/1/4/5、N>M、不足、缺失、越界、非常规文件、超 1 MB、部分 / 全部失败矩阵通过。
- [ ] 成功几张 evidence 就记录几张；0 张时 `text_only`，1–4 张时 `with_images`，`decisionKind=initial`。
- [ ] 槽位连续且顺序与 fingerprint/layoutSlot 一致；未实例化脚本模板槽不进 payload。
- [ ] 日志、inspect、JSON 和持久 evidence 不含绝对路径、buffer、Cookie 或 hidden values。

## 停止条件

若 imagePlan 未通过 18-D 传入、Ticket 17 resolver 不能在不暴露新公开 API 的情况下验证路径，或平台真实槽位与探索证据冲突，停止返回主任务。
