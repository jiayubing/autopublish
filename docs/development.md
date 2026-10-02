# 开发与验证

应用代码在 [auto—publish](../auto—publish)，首次启动见[根 README](../README.md)。鉴权服务独立安装与验证，见[服务 README](../auto—publish/auth-server/README.md)。以当前 [CI](../.github/workflows/ci.yml) 的 Node 基线为准，不用本机能跑代替跨环境证据。

## 改哪里

先按[架构 owner](architecture.md)定位业务规则，再读直接调用方、公开合同和行为测试。生成看 src/content 与 desktop/services；投稿运行事实看 OperationalStore 公共门面及对应 service；页面看 media-workbench/src 的 feature、bridge 和 component。不要从历史 Ticket 编号猜运行时边界。

主进程、preload 与 renderer 是不同构建边界。renderer 修改运行 build:renderer（包含类型检查），preload 修改运行 build:preload，bridge/main 修改选择 typecheck:bridge/typecheck:main；后者仅覆盖其 tsconfig 指定范围，不代表全部 CommonJS 已静态校验。

## 按风险选择测试

命令完整定义以 [package scripts](../auto—publish/package.json)为准；分组唯一配置为 [test-suites.json](../auto—publish/scripts/test-suites.json)，未显式归组的新文件进入 integration。test:discover 或分组附加 -- --list 查看真实集合。

| 改动 | 主要检查 |
| --- | --- |
| 局部业务修复 | 最小反例、直接 node --test 文件、npm test；按影响增加集成 |
| 普通/付费投稿 | test:submission 及变动 owner 的 uncertain、冻结、续租、恢复用例 |
| 文件、事务、迁移 | test:storage、test:migration；容量变动才增加 test:capacity |
| renderer/bridge | 相关浏览器交互、加载/空态/错误/禁用态、build:renderer 和 bridge 检查 |
| 鉴权 | auth-server 全套临时 SQLite/HTTP/子进程测试 |
| 广泛桌面集成 | test:desktop-regression；排除项分别由 CI 风险任务承担 |
| 打包边界 | test:packaging；实际候选还需对应产物与离线 smoke |

lint、相关格式检查和 git diff --check 按改动运行。纯文档检查链接、引用、格式及消费者，无需全套业务测试。verify 已去掉其定向与 core 重复文件执行；不要在同一证据中把重叠测试相加成唯一总数。

Electron focus 要求 Windows 和 RUN_ELECTRON_FOCUS_TESTS=1；解包导航需要 RUN_UNPACKED_NAVIGATION_SMOKE=1 与 AUTO_PUBLISH_UNPACKED_EXECUTABLE 指向当前候选产物。前置条件缺失就如实记未验，不能把 skipped/todo 算通过。

## 完成与文档维护

先主审查，修阻塞项后仅有界复查。验收应覆盖公开行为、持久事实、并发和失败恢复；不靠源码行数、私有函数名或 regex 证明业务正确。最终源码变化后更新受影响验证，交付说明实际命令、结果、未验项和 Git 状态。

一条长期事实只在一个主题维护：产品行为在 product、实现理由在 architecture、运行操作在 operations、扩展合同在 extensions。work 只保留剩余事项，不抄测试数量。复杂仍活跃的任务使用 docs/plans；完成后迁回稳定事实并删除过程文档，不新增 archive 或多套 PLAN/AUDIT/HANDOFF。Git 历史用于追溯已提交过程；未提交证据在用户检查前保留。

提示词、模板、fixture Markdown、acceptance JSON 及其历史来源不是普通文档。当前保留范围见[资产说明](architecture.md#保留的验收资产)，不要因其位于 .scratch 就删除。运行内容库、build、日志、缓存和 dist 不手改或提交。
