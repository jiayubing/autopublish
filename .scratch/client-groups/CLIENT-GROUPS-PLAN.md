# 客户分组与选择

## 范围与基线

用户授权：建立功能分支并实施已讨论的客户分组；提交 PR，不自动合并。
基线 master：`069b88cf213a2216f08fc16361cb7fa3cfdf14fe`。
分支：`feat/client-groups`。

单层、自定义、单一归组，未分组可正常使用。采集、批量生成和当前客户选择共享分组资料，但各自的选择独立。不做自动排期、发文统计、多级目录、多标签或文章库跨客户聚合。

## Owner 与行为

- `src/content/client-group-store.js`：内容库 `.autopublish/client-groups.json` 的唯一 owner；分组及成员关系同文件原子写入。使用客户稳定 ID，不移动目录，不改 client.json、文章、发布档案或豆包会话。
- 既有 AI content service / typed IPC / bridge：只增加读取和具名分组操作入口。版本校验防止旧界面覆盖新分组；坏文件不以空表覆盖。
- 既有 content sources feature：拥有内容库作用域查询及命令，换库丢弃迟到结果。
- 共用选择组件：分组与搜索取交集；“全选当前结果”只增补当前结果，不清除其他组的勾选；查看已选、逐项取消与清空选择可见；筛选不自动选择客户或启动任务。
- 当前客户选择保持单选；筛选外的当前客户保持可见，不自动切换。批次以具体客户 ID 启动，不让组成员变化改写已启动任务。
- 删除组后成员回到未分组。管理面板仅维护分组和批量归组，不新增 CRM 主页面。

## 验证与收口

先验证存储重开、批量归组/删组、不触碰客户内容、旧版本/非法输入、写失败及坏文件；再验证真实 service/typed IPC；UI 验证组+搜索、跨组保留、隐藏已选、空态/错误态/禁用态、单选，以及采集/生成入口实际提交的客户 ID。

跑直接回归、lint/typecheck/build；使用现有 CI，不削弱门禁。仅一次范围内审查及已知问题有界复审。测试只用临时合成内容库和假外部 transport。

## 进度与证据

- 已核对入口文档、直接源码及当前 master；原有定向回归 61/61 通过（Node 24.20.0，Linux）。
- 本地不能直接联网；临时 branch-only workflow 导出精确 Git archive、锁定依赖和 Node 24，取回后的 Git tree 已核对为 `4accd9fe99156a3db405518cc69f5d6b032848a9`。临时 workflow 在实施提交中移除，不进入最终 PR diff。
- 实现完成，待分支 CI 与人工合并；不包含真实账号、采集、生成供应商或投稿操作。
- 后端/feature 新增 10 个行为测试，覆盖重开、独占归组、删组内容不变、旧版本冲突、坏文件、写失败、路径边界、真实 service/typed IPC/preload、换库与迟到响应。连同生产 IPC 全能力 fixture 矩阵，`node --test tests/client-groups.test.js tests/client-groups-feature.test.mjs tests/phase-06-production-ipc-fixture-matrix.test.js` 为 16/16 PASS。
- `node --test tests/client-groups.test.js tests/client-groups-feature.test.mjs tests/phase-06-content-core-typed-ipc.test.js tests/ai-content-service.test.js tests/ai-content-ipc.test.js` 为 52/52 PASS。
- 新增 4 个真实 Renderer 合成场景：60 客户跨页/跨组选择、真实分组 service 经 typed IPC 的管理操作与重开、采集/生成实际提交名单、错误/重试与空内容库。另复跑生成并发与问题编辑交互。Linux 容器浏览器策略禁止所有 URL，标准 HTTP harness 在此环境不能执行；本地仅用临时 inline-content adapter 将同一构建脚本渲染到 about:blank（只为该脚本加 CSP hash、内存 UI storage），无网络请求或浏览器策略修改，11/11 PASS。该结果不替代 Windows 标准 HTTP harness；adapter 不入库。
- `npm run lint`、`typecheck:bridge`、`typecheck:main`、`format:check`、`build:renderer`（包含 renderer typecheck）、`build:preload` PASS。构建仍有既有单 chunk >500 kB 提示，本轮不改构建拆包。
- 本地 `npm test` 实际运行：560 pass / 3 fail / 2 skip，不能报告全绿。失败为 Electron 二进制缺失相关的 runtime/skip 门禁，以及 Linux 目录重建身份断言；Windows casing 两项按原测试跳过。相同定向测试已在未改动基线副本重跑，均可复现相应失败（基线还有另一目录重建竞争断言失败）。不改这些未涉及文件，完整门禁交给原 Windows CI；本地未宣称全量 integration 或打包实测通过。

## 范围内审查与有界复审

Scope：分组持久化 → AI content service → typed IPC/preload/bridge → 既有 content sources feature → 客户选择组件及直接三条入口；不扫描其他业务。

确认：一个持久 owner；分组名和关系原子保存；旧 revision 拒绝覆盖；同步 read/check/write 无中间 await；非法文件/写失败保真；客户身份与内容不变；分组 mutation 不进入采集/生成 runner；批次继续传具体 IDs；切库使旧查询/命令失效，筛选/勾选随内容库重新建立。

修复的本轮问题（INTRODUCED_BY_CHANGE，P2，均已关闭）：
- 主请求使用顶层 oneOf 与既有 registry 的 object request 合同不符。改为 exactObject 包裹 change 的具名联合，不修改全局 registry；真实 typed IPC/preload 与完整 fixture roundtrip 已复验。
- 新筛选控件 accessible name 与既有“当前客户”选择器发生模糊匹配冲突。筛选入口改为“客户分组/搜索客户”，保留“当前客户”原语义；原问题编辑切换客户回归通过。

有界复审：仅重查上述修复、直接传递链和行为测试。无剩余已知本轮阻塞 finding；Windows CI 状态另记录在 PR，未通过前不作为可合并交付。
