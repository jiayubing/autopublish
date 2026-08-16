# 新增代码内置发布平台实施合同

本文说明如何在不修改文章生命周期、普通队列状态机、attention、IPC 或 Renderer 业务 owner 的前提下接入发布平台。当前只支持随应用代码发布的平台；不支持第三方插件、远端代码、在线安装或用户自定义 adapter。

## 标准普通平台

标准普通平台使用既有普通队列和平台账号档案，没有专属设置 UI、客户资料字段、额外 runtime 或额外打包资产。最小接入范围是：

1. 在 `auto—publish/src/platforms/<platform-id>/` 提供 `definition.js`、`platform.js` 和平台远端协议实现。
2. `definition.js` 必须满足 exact `PlatformDefinitionV1`，声明稳定 ID、展示名、`publicationTargetKind: "platform"`、安全 `scanDir`、能力和 code-owned external hosts。
3. `platform.js` 只按声明提供窄 port。标准平台通常提供：
   - `regularSubmission.preparePlatformSubmission(claim, imagePlan)`；
   - `loginSession.open/check/save/close`；
   - `accountInspection.prepare/inspect`。
4. 在 `auto—publish/config/platforms.json` 的 enabled ID 中加入该平台。配置只启用代码内置定义，不得复制展示名、host、capability 或 executable metadata。
5. 增加平台协议专项测试，并通过通用 loader、目录、账号、队列、投稿中心、IPC、Renderer 和 package gate。

声明 `imagePublishing: true` 的平台消费 `ImagePlanV1` 和进程内 `imageAssetReader`，并由平台 owner 负责槽位、表单/API 字段、平台大小限制和 best-effort 降级。不得直接依赖 `client-image-*` 内部路径、scanner、cache 或 metadata 文件。声明为 `false` 时，非零 `imageCount` 必须 fail-closed。

标准平台不应要求实现者理解或修改文章冻结、队列事务、订单、attention、Renderer badge、publication writer 或 recovery internals。若接入需要这些改动，应先判断它是否其实是特殊平台或产品边界发生了变化。

## 特殊普通平台

平台确实需要专属能力时，只在相应真实 owner 接入具名 contribution：

- 专属设置使用 `settingsContribution`，设置 schema、密钥和 UI 仍由 settings owner 管理；
- 客户投稿资料使用 `clientProfileContribution`，字段持久化和校验仍由 content/profile owner 管理；
- Python、二进制或额外运行文件使用 `runtimeArtifactContribution`，只声明 code-owned、repo-relative、exact artifact；
- 平台专属协议、临时凭据和 cleanup 保留在该平台模块中。

共享 composition 只遍历已声明的 port/contribution，不增加 `platformId` 条件分支。不得通过通用 capability bag、环境变量、workspace 配置或远端响应扩大可执行能力、安全 host 或打包范围。网站媒体的资源、价格、订单、付费确认和人工核对继续属于独立 paid/resource application，不接入普通平台 port。

## 验收与外部授权

本地自动验收必须使用合成账号、合成文章和假 transport，至少覆盖：目录展示名、登录和账号核验、admission/FIFO/claim、prepared evidence、accepted/rejected/group-blocked/uncertain、图片能力两态、投稿中心 snapshot/badge、生产 IPC、workspace 隔离及 shutdown cleanup。远端请求结果不确定时只记录 uncertain 并进入人工核对，禁止自动重试。

真实登录、发布、图片上传、付费、取消、生产数据或生产迁移都需要当次明确授权。真实外部验收还必须预先约定账号、目标文章、是否允许图片、停止条件、可见副作用和费用边界；本地 gate 通过不能替代这些授权。

## 打包要求

- JS-only 标准平台应由现有 `src/**/*` 边界进入 ASAR，不自动增加 `asarUnpack` 或 `extraResources`。
- 额外 runtime/asset 必须在平台 definition/contribution、builder 配置、artifact contract、离线 smoke 和缺失/额外文件验证中显式闭合；禁止无约束 glob。
- `externalHosts` 只影响显式外链策略，不授权平台导航或 HTTP endpoint，也不得从用户配置或远端 URL 学习。
- 测试 fixture、私有运行数据、Cookie、日志、workspace、客户内容和迁移 operator tool 不得进入 production package。
- package gate 必须证明启用 definition 与对应 runtime/required assets 完整；未启用平台不得在运行时执行。

接入完成后记录实际测试、未运行的真实验收及原因、剩余风险和 Git source state。只有公开行为、打包和安全边界在同一最终 source state 通过，才可宣称平台接入完成。
