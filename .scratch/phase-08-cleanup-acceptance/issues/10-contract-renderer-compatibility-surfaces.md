# 10 — 收缩 Renderer 兼容出口

**What to build:** 在 Content/Generation 与 Platform/Media/Settings/Workspace 两批 caller 全部迁移后，删除旧共享类型 barrel、bridge re-export、动态 transport、重复 hooks/state 与无 consumer capability；Renderer 只保留分域稳定入口，且 package 内不存在旧接口副本。

**Blocked by:** 08 — 迁移 Content 与 Generation Renderer 切片；09 — 迁移 Platform、Media、Settings 与 Workspace Renderer 切片

**Status:** ready-for-agent

## 必读输入

- Tickets 07–09 的 symbol migration 表、remaining caller、feature owner 与验证证据。
- canonical capability inventory、Renderer root 可达性、production package/ASAR source inventory。
- 架构、bridge、typed IPC、renderer harness 和 legacy absence tests。

## 开始门禁

1. 确认 Tickets 08/09 均完成且旧 barrel remaining caller 清单为 0。
2. 对旧 imports、re-export、dynamic dispatch、native confirm、重复 subscription 和共享 busy 写 contract red tests。
3. 生成当前 source 与 production archive 命中基线。

## 执行过程

1. 删除纯迁移 re-export、旧 barrel 和对应 fixture imports；不再增加第二层兼容 wrapper。
2. 删除已由 domain feature 替代的 hooks、controller/state 和无真实 View consumer capability。
3. 合并浅 facade，保留能隐藏 transport、竞态或 domain projection 知识的深模块。
4. 收紧静态 reachability：每个 bridge export、feature command/query/event 都必须由 production root 可达并闭合到后端 owner。
5. 重新 build/pack，检查 source、preload 与 ASAR 中无旧路径/字符串/模块副本。
6. 对所有 Renderer 业务流进行一轮回归，确认 contract 阶段没有删除仍在使用的行为。

## 模块边界

- 本 ticket 是 expand–contract 的 contract 阶段，只删除过渡形式，不新增替代接口。
- 测试必须验证 symbol identity 和真实调用链，不能仅用文件字符串/同名函数推断 consumer。
- Generated bundle 不是源码 owner；必须先证明 source owner 唯一。

## 验收标准

- [ ] 旧共享类型/bridge barrel、动态 transport 和迁移 re-export 为 0 source/ASAR 引用并删除。
- [ ] 所有 capability 有唯一 production consumer/producer/application owner，无伪 UI consumer。
- [ ] 每个 event 有唯一 listener owner 和可验证 dispose；无重复 invalidation/shared busy/native confirm。
- [ ] Renderer 依赖保持 feature → bridge → preload，不能引用 desktop/Node/infrastructure。
- [ ] 完整 UI 行为、typed contract、preload 和 package smoke 保持绿色。
- [ ] 不存在为了旧测试保留的 wrapper。

## 必跑验证

- canonical inventory/reachability、bridge/typed IPC、architecture、renderer harness/behavior、legacy absence 定向测试。
- lint、三套 typecheck、Renderer/preload build、完整 root suite、production package/ASAR smoke、`git diff --check`。

## 交接与停止条件

- 记录删除清单、0 引用证据、最终 Renderer 模块图和 capability counts。
- 若任何旧出口仍有真实 production consumer，停止删除并回到 Ticket 08 或 09 修正，不在本 ticket 双轨兼容。
- 不自动提交。

