# Post-Wave 发布平台扩展性与图片库边界收敛计划

**Status:** `RUNNING`

**当前 gate：**`E2 READY`

**职责：**在已完成 `POST-WAVE-SUBMISSION-ARCHITECTURE-CLOSEOUT-PLAN.md` 的基础上，降低新增普通发布平台的通用接入成本，并把客户图片库稳定为高内聚、窄接口、应用内模块。本文是独立的后续实施计划，不重开已完成的 Wave/Ticket/Maintenance，不回填既有 closeout，不代表已授权执行真实登录、发布、上传、付费或生产迁移。

## 1. 事实基线

- **核对分支：**`codex/jiagou`
- **核对 HEAD：**`7747e64743ad3441097df1294874bc120772a1ad`
- **核对工作树：**clean
- **前置完成事实：**Post-Wave 投稿架构收尾 C0～C5 已完成；统一投稿中心、收窄文章库 read model、具名 maintenance/recovery、临时投稿选择会话均已进入当前分支。
- **产品真源：**根 `CONTEXT.md`、`ARTICLE-LIFECYCLE-AND-SUBMISSION-SPEC.md`，尤其 §4.2、§5、§9.4、§9.8、§11、§12。
- **本计划范围、顺序、gate 与 closure 真源：**本文件。
- **执行协议与审计方法：**继续遵守当前 `EXECUTION-PROTOCOL.md`、`AUDIT-PROTOCOL.md`；默认流程为 Implementation → Primary Audit → blocking remediation → bounded re-audit → closure。

实施前实际运行：

```text
node --test tests/adapter-workspace-injection.test.js tests/platform-account-inspector.test.js tests/platform-account-runtime.test.js tests/platform-browser-session-lifecycle.test.js tests/platform-settings-service.test.js tests/platform-workbench-service.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-platform-outcomes.test.js tests/ticket-25-c-regular-platform-acceptance.test.js tests/client-image-library.test.js tests/client-image-selector.test.js tests/regular-image-plan-service.test.js tests/lieju-image-multipart-preparation.test.js tests/ticket-18-a-queue-image-count-persistence.test.js tests/ticket-18-b-queue-image-config-surface.test.js tests/workspace-paths.test.js
```

结果：`101 passed / 0 failed / 0 skipped`。该结果只证明上述 HEAD 的实施前基线，不证明本计划执行后的 source state。

## 2. 当前问题与保留优势

### 2.1 已有优势

1. `loadPlatforms` 已能从启用配置装载平台实现，普通队列、投稿入口目录、账号检查和工作台可复用同一批 loaded platform。
2. 普通队列拥有 admission、FIFO、claim、冻结、结果分类和 uncertain resolution；平台实现不拥有生命周期或人工核对状态机。
3. 客户图片只有一套 `client-image-library` owner，内部已有路径边界、扫描、元数据、缓存、安全引用、随机选择和重新校验。
4. 普通投稿链已经通过 `regular-image-plan-service` 生成进程内 `imagePlan`；平台只负责自己的图片交付协议。
5. 当前普通平台结果合同、账号绑定、图片 best-effort 降级和 workspace 隔离已有行为测试。

### 2.2 需要收敛的问题

1. 当前 adapter surface 同时承载 session、登录、账号检查、旧文件扫描/worker、普通投稿准备和平台协议；loader 校验的能力与真实调用者要求并不完全一致。
2. 平台静态知识散落在配置、Renderer display-name map、external-host allowlist、worker session、workspace path、package gate 和 composition 分支中。
3. `workspace-runtime-composition.js` 对 Hepan settings-backed preparation 和 Lieju 客户投稿资料存在平台 ID 分支；新增相似平台会继续扩大共享 composition。
4. 专属设置、客户资料、额外 runtime/asset 与普通发布 capability 没有统一的显式声明方式，调用者只能通过平台 ID 或方法存在性猜测。
5. `client-image-library` 对生产调用者实际只需少量能力，但公开对象仍带多组列表/扫描/别名方法；平台图片交付还直接依赖 `client-image-reference`、`client-image-metadata` 等实现文件。
6. 当前图片库是独立代码内核，但没有必要也没有产品授权把它升级为独立 UI、独立数据库或独立服务。

## 3. 目标与非目标

### 3.1 目标

1. 为代码内置平台建立一个 exact、versioned、fail-closed 的平台定义合同，成为平台身份、展示名、target kind、通用能力与安全静态元数据的唯一 owner。
2. loader 根据平台声明的 capability 校验并投影窄 ports；普通调用者不再拿到一个包含所有平台能力的宽 adapter。
3. 标准普通平台只需新增自己的平台实现/定义并加入启用配置，即可进入投稿入口、账号检查、普通队列、投稿中心展示和通用测试链；不修改生命周期、队列、IPC、Renderer 或 workspace composition。
4. 带专属设置、客户资料、额外 runtime/packaged assets 或图片协议的平台，通过显式 optional capability 接入对应 owner；允许有平台专属实现，但不得把 ID 分支散回共享层。
5. 保持 `client-image-library` 为唯一图片库 owner；向选择链和交付链分别暴露窄 port，平台不得依赖图片库内部文件布局。
6. 新增一个纯合成 reference platform acceptance，证明扩展 seam，而不是依赖源码行数或文件数量宣称“易扩展”。
7. 保持普通/付费事实 owner、持久 schema、事务、不确定结果和人工核对语义不变。

### 3.2 非目标

- 不建立第三方插件市场、动态下载/执行、用户自定义 adapter 或远端代码加载。
- 不建立通用 workflow engine、万能 `PlatformManager`、事件总线或多层 compatibility facade。
- 不把网站媒体订单流程并入普通平台；`target.kind === "resource"` 继续由付费媒体应用拥有。
- 不让 platform adapter 拥有文章冻结、队列状态、重试、订单、attention 或发布成功事实。
- 不借本计划重写 Toutiao、Hepan、Lieju 的远端 DOM/HTTP/Python 协议。
- 不新增图片池 UI、图片 CRUD、独立数据库、使用次数、去重业务状态或独立进程服务。
- 不承诺所有特殊平台都只改一个文件；专属设置、客户字段、额外 runtime 和打包资产仍需修改其真实 owner。
- 不执行真实登录、投稿、图片上传、付费、取消、订单核对或生产数据迁移。

## 4. 方案取舍

| 方案 | 结论 | 理由 |
| --- | --- | --- |
| 保持现状，只补一份新增平台 checklist | 不采用 | 能降低遗漏概率，但平台静态知识和 ID 分支仍会继续散落。 |
| 建立运行期第三方插件框架 | 不采用 | 当前只有代码内置平台，没有签名、权限、升级、兼容和沙箱需求；会显著扩大安全与打包边界。 |
| 新增中央大表，列出所有平台方法和特殊分支 | 不采用 | 只是把散落分支搬到一个浅 registry，新增平台仍需同时理解所有调用者。 |
| 每个平台提供代码内置 definition，loader 校验 capability 并输出窄 ports | 采用 | 复用已有具体 variation，平台知识与实现同地，调用者只依赖所需角色。 |
| 把图片库变成独立服务 | 不采用 | 当前依赖是本地可替代 I/O，独立进程不会增加业务价值，反而增加 transport、生命周期和错误状态。 |
| 保持单一图片库，在 composition 暴露 selection/read 两个窄 port | 采用 | 隐藏路径、扫描、缓存和元数据实现，同时让多个图片平台复用安全读取能力。 |

## 5. 目标边界与合同

### 5.1 平台类型分层

本计划区分两类新增平台：

1. **标准普通平台**：使用现有普通队列和账号档案；没有专属设置 UI、客户资料 schema、额外 runtime 或额外打包资产。目标是只修改平台实现/定义和启用配置。
2. **特殊普通平台**：除标准能力外，需要专属设置、客户投稿资料、Python/二进制、额外安全 host、特殊图片协议或其他真实平台依赖。允许增加相应 owner，但共享 composition/Renderer 不出现新的平台 ID 分支。

网站媒体保持独立类别，不用“标准普通平台”验收预算衡量。

### 5.2 `PlatformDefinitionV1`

E0 必须冻结 exact code-owned contract；目标最小字段为：

```text
schemaVersion: 1
id
displayName
publicationTargetKind: platform | resource
scanDir
capabilities:
  regularSubmission
  legacyQueueImport
  loginSession
  accountInspection
  imagePublishing
externalHosts
```

约束：

- definition 来自随应用打包的代码，不接受 workspace、环境变量、远端响应或用户配置增加 executable capability/host。
- `id`、host、路径片段和 capability object 必须 exact validate；未知字段、重复 ID、能力与方法不匹配均使该平台 fail-closed，输出安全诊断。
- `displayName` 从 definition 投影到主进程 read model、IPC 和 Renderer；删除 Renderer 平行平台名表。
- `externalHosts` 只用于显式外链安全策略；不能成为任意导航白名单，也不能从远端 URL 自动学习。
- 启用配置只决定装载哪些内置 definition，不复制 display/capability 等元数据。

### 5.3 Loaded platform 的窄 ports

loader 只向调用者暴露其需要的角色，不暴露完整实现对象：

| 调用者 | 允许依赖的 port |
| --- | --- |
| 投稿入口/普通 admission | `submissionDirectoryEntry`（identity、display、target、image capability） |
| 普通 claim/execution | `regularSubmission.preparePlatformSubmission(claim, imagePlan)` |
| 账号绑定 | `accountInspection.prepare/inspect` |
| 登录 UI | `loginSession.open/check/save/close` |
| 旧文件工作台 | `legacyQueue.scan/parse/publish`，仅真实 consumer 保留 |
| 设置应用 | optional `settingsContribution`，只进入 settings owner |
| 客户投稿资料 | optional `clientProfileContribution`，只进入 content/profile owner |
| 打包/诊断 | optional code-owned runtime/artifact metadata，保持显式安全 gate |

`loadPlatforms` 或其后继 owner 负责把平台模块标准化为上述 ports。禁止调用者继续用 `typeof adapter.someMethod` 猜测业务能力；未声明 capability 的方法不可达。

### 5.4 平台模块合同

每个平台模块拥有自己的 definition、远端协议实现和必要的 optional contribution factory。共享 composition 只遍历声明，不写 `platform.id === "..."` / `switch(platformId)`。

平台专属 contribution 必须满足：

- Hepan settings-backed runtime、临时 Cookie/Python 和 account inspection 仍属于 Hepan owner；只把装配入口从共享 composition 移回 Hepan 模块。
- Lieju 城市/联系人/电话仍属于 content profile owner；Lieju 只声明并消费窄 profile reader，不复制客户资料持久化。
- 特殊资产和 runtime smoke 仍可有平台专属 gate；不能为了“零接触”把安全/打包验证改成无约束 glob。
- migration-only 平台 ID 允许保留在 migration owner，但必须进入 E0 ledger，不能被误认作运行时扩展点。

### 5.5 图片库边界

图片库继续位于 `src/content/`，只拥有客户图片文件事实与安全读取，不拥有投稿或平台事实。

面向 production caller 冻结两个窄角色：

1. `imageSelectionPort.select({ clientId, count, random? })`：返回安全图片引用和安全 warning，不返回绝对路径或文件 bytes。
2. `imageAssetReader.read({ clientId, imageId })`：在读取时重新验证 client/path/symlink/metadata 边界，返回进程内、不可序列化的可信资产 `{ name, extension, mimeType, width, height, size, bytes, assetFingerprint }`。

要求：

- `regular-image-plan-service` 只依赖 selection port，不直接 import path-policy、selector 或 reference 内部模块。
- 平台图片交付只依赖稳定 `ImagePlanV1` parser 和 `imageAssetReader`；`src/platforms/*` 不直接 import `client-image-reference`、`client-image-metadata`、scanner、cache 或 path-policy。
- 平台仍拥有自己的槽位数量、multipart/DOM/API 字段、平台大小限制和 best-effort 降级映射。
- 图片库拥有 path boundary、文件读取、通用 metadata 验证和 fingerprint；不得让多个 adapter 各自重建一套安全文件解析。
- image selection/read failure 不创建新的 retry 或人工 decision 状态；继续按既有规则自动减量直至纯文本。
- 只在 E0 consumer ledger 证明无 production consumer 后，才删除 `listAvailableImages` / `select` 等重复 alias；不能为了缩小接口删除仍有真实调用者的能力。

## 6. 串行工作包

固定顺序：

`E0 → E1 → E2 → E3 → E4 → E5 → E6`

`core/platforms`、workspace composition、platform IPC/types、图片合同和 package gate 属于共享边界，不并行修改。每包基于上一个已验证 source state 开始。

### E0 — 实时消费者清单与扩展合同冻结

**目的：**写 implementation 前固定真实 owner、平台 ID 散点、当前 adapter 方法消费者与标准平台扩展预算。

必须产出：

1. 所有 production/package/migration 平台 ID 出现点 ledger，分类为：
   - `STATIC_PLATFORM_METADATA`
   - `GENERIC_RUNTIME_CONSUMER`
   - `BESPOKE_PLATFORM_CAPABILITY`
   - `SECURITY_OR_PACKAGING_GATE`
   - `MIGRATION_ONLY`
   - `TEST_FIXTURE`
2. 当前 adapter 方法逐项 consumer map，至少覆盖 loader、session、account inspector、regular preparation、legacy workbench、worker、post-processing、settings 和 shutdown。
3. `PlatformDefinitionV1` exact schema、capability-to-required-port matrix、stable error codes 和 diagnostic metadata allowlist。
4. 标准普通平台 extension contract：新增一个 synthetic definition 时，哪些公开行为必须自动出现，哪些源文件不得被业务性修改。
5. 图片库方法 ledger、两条 production 调用链和 Lieju 直接依赖 ledger；冻结 `ImagePlanV1`、selection 和 asset reader 合同。
6. 现有测试 disposition：`KEEP`、`REPLACE_WITH_PUBLIC_BEHAVIOR`、`DELETE_WITH_RETIRED_SURFACE`；不得只叠加新旧架构测试。
7. package/build/security 影响清单；确认 definition 与额外资产不会绕过生产打包白名单。

**最低验证：**重新运行 §1 的 101-test baseline，并记录 `HEAD + diff/status`。

**完成门槛：**合同可以表达 Toutiao、Hepan、Lieju 和 media 的当前真实差异；没有通过 `any capability bag` 或平台 ID 特例掩盖无法表达的行为。

### E1 — 平台 definition 与 capability-aware loader

**目的：**建立唯一静态元数据 owner，并让 loader fail-closed 地输出窄角色。

实施要求：

1. 新增 exact `PlatformDefinitionV1` parser/validator；未知字段、重复 ID、非法 host/scanDir、声明与 port 不一致均返回稳定安全错误。
2. 将现有四个内置平台迁入 definition contract；启用配置继续只存 ID。
3. loader 输出 normalized loaded-platform record；definition 和运行时 port 均不可变，workspace runtime 之间不共享 mutable adapter/session 状态。
4. capability 未声明时对应 port 不存在；capability 声明为 true 时缺 port 必须在装配阶段失败，不能迟到首次发布才暴露。
5. 迁移现有 direct default-adapter export consumer；没有 repo 外真实消费者时不保留 compatibility export。
6. diagnostics 只记录安全 platform ID/action/code，不记录 Cookie、页面正文、绝对敏感路径或供应商异常。

最低测试：

- exact definition parsing、重复 ID、非法 capability/host/path、missing/extra port；
- 两个 workspace runtime adapter/session 隔离；
- declared/undeclared capability matrix；
- 当前四个平台定义投影与启用过滤；
- loader failure 安全诊断且不影响其他合法平台；
- package includes definition/runtime files，不执行未启用平台。

**完成门槛：**调用者不需要读取宽 adapter 来判断能力；新增标准 synthetic platform 不修改 loader。

### E2 — 通用消费者迁移与静态知识去重

**依赖：**E1 的 loaded-platform roles 稳定。

实施要求：

1. 投稿入口目录、regular preparation、account inspector、login session、platform workbench、post-processing 和 shutdown 分别只接收自己的窄 port collection。
2. 平台 `displayName` 从 definition 贯穿主进程 read model、IPC/bridge/types 到 Renderer，删除 Renderer 平行 display-name map。
3. external-host policy 从 code-owned enabled definitions 生成，并与固定应用级 host 合并；禁止 workspace/环境/远端内容扩大 allowlist。
4. worker/session cleanup 只遍历 loaded login/session ports，不维护平台 ID 数组。
5. workspace 输入继续使用受控 `input/<scanDir>`；对 `liejuInput/toutiaoInput/hepanInput` 做 consumer-led disposition。migration/package 的真实命名路径保留在其 owner，运行时无消费者的重复字段删除。
6. package/architecture gate 从“硬编码当前平台文件列表”改为“验证启用 definition 与对应 runtime/required asset 完整”，同时保留特殊资产的显式验证。
7. 不修改普通队列、文章生命周期、订单、attention 或 publication writer。

最低测试：

- definition display name 端到端 query/IPC/Renderer；
- login available、账号检查、queue directory、image capability 来自同一 definition；
- shutdown 关闭全部已装载 session；单个平台 cleanup failure 不覆盖主错误；
- external host allow/deny 安全矩阵；
- workspace/client 切换不复用 adapter/session/cache；
- current platform workbench、post-processing、package smoke 回归；
- legacy/migration-only path 保留或删除均有公开合同证据。

**完成门槛：**共享 Renderer、main security policy、worker session 和 workspace composition 不再复制普通平台静态元数据。

### E3 — 特殊平台 contribution 归位

**目的：**清除共享 composition 中现存的平台 ID 分支，同时不把特殊行为伪装成通用能力。

实施要求：

1. Hepan definition 暴露 settings-backed runtime/preparation/account-inspection contribution；现有 settings service、secret store、临时 Cookie、Python 和 cleanup owner 不变。
2. Lieju definition 暴露 client-profile requirement/reader contribution；城市、联系人和电话仍由 content/profile owner 持久化与校验。
3. media 保持 resource/paid application 路线；只提供当前通用消费者真实需要的 definition projection，不进入普通 regular submission port。
4. 删除 `workspace-runtime-composition.js`、`platform-account-runtime.js` 等共享文件中的平台 ID 条件分支；若仍有必要分支，必须定位到具名平台 contribution owner 并记录原因。
5. optional contribution 缺失或配置无效时 fail-closed，不回退到全局配置、旧环境路径或默认账号。
6. 不新增 generic contribution manager；definition loader 只识别冻结的具名 optional ports。

最低测试：

- Hepan settings/env/application precedence、account inspection、temporary secret cleanup；
- Lieju profile completeness、client isolation、browser/HTTP preparation；
- media 不被普通队列误识别；
- composition 无平台 ID branch 的 architecture absence gate；
- current Toutiao/Hepan/Lieju accepted/rejected/group-blocked/uncertain 行为不变。

**完成门槛：**新增特殊平台只修改该平台模块和它真实需要的 settings/profile/runtime/package owner，不修改共享普通投稿状态机。

### E4 — 图片库窄 port 与交付边界

**依赖：**E1～E3 已提供稳定平台 image capability 与 runtime dependency 注入点。

实施要求：

1. 冻结并实现 `ImagePlanV1` parser；selection service 的输出统一由该 parser 验证，平台不得复制通用 plan shape validation。
2. composition 从唯一 `client-image-library` 实例投影 `imageSelectionPort` 与 `imageAssetReader`；两个 port 不暴露 cache、scanner、绝对路径或 invalidate-all 实现细节。
3. `regular-image-plan-service` 改为只依赖 selection port；可恢复错误映射保持稳定且不泄漏原始文件异常。
4. `client-image-library` 的 asset read 在每次交付前重新执行 client/path/symlink/metadata boundary，并生成 fingerprint；返回对象不可序列化、不可安全日志化。
5. Lieju 图片交付迁移到 `ImagePlanV1 + imageAssetReader`，删除对 `client-image-reference` 和 `client-image-metadata` 的直接依赖；槽位、multipart charset、平台大小限制和 best-effort warning 仍属于 Lieju。
6. Toutiao/Hepan 当前继续 text-only；未声明 image capability 时 admission 只能保存 `imageCount=0`，不得静默接受非零配置。
7. consumer ledger 允许后删除重复 aliases；内部 scanner/cache/metadata 仍可保留职责清楚的内部测试。

最低测试：

- 多 client 隔离、symlink/path escape、损坏/超大/删除后读取、cache stale 后 recheck；
- 随机无放回、0～5、图片不足、扫描失败、读取失败自动减量/纯文本；
- asset reader 返回 bytes/metadata/fingerprint 一致且不可序列化；
- Lieju 0/1/多图、槽位不足、部分失败、charset、browser/HTTP 两条 transport；
- unsupported platform 非零 imageCount fail-closed；
- `src/platforms/*` 对 `client-image-*` implementation 的 dependency absence gate；
- 0 次真实图片上传和 0 个新持久 writer。

**完成门槛：**图片库的删除测试成立：删除 library 后，路径安全、扫描、缓存、选择和 asset read 复杂度会重新散回多个调用者；保留 library 时，平台只理解稳定 plan 与 reader。

### E5 — 新平台扩展验收与文档

**目的：**用公开行为证明扩展成本下降，而不是以源码字符串或行数替代业务证据。

实施要求：

1. 增加纯合成 `reference-standard-platform` fixture，只用于测试，不进入 production enabled config，不访问网络。
2. 通过正式 definition/loader seam 装载 fixture，验证：
   - 自动进入投稿入口目录并显示 definition display name；
   - 自动获得 login/account inspection 能力；
   - 普通 admission、FIFO、claim、prepared evidence、accepted/uncertain 进入既有 owner；
   - image capability true/false 两种定义驱动 UI/queue config/plan 行为；
   - 投稿中心 snapshot 与 badge 无平台特例；
   - 不修改 lifecycle、queue、attention、IPC 或 Renderer production owner。
3. 创建“新增平台实施合同”短文档，区分标准平台与特殊平台，并列出真实授权、外部验收和 package asset 要求。
4. architecture gate 只验证依赖方向、公开 capability、hardcoded metadata absence 和 package contract；业务正确性由 fixture 的公开行为验证。
5. 不把 reference fixture 打入 production package。

**标准平台成功判据：**实现者只需理解平台 definition、所声明的窄 ports、远端协议和平台专项测试；不需要理解文章冻结、队列事务、订单、attention、Renderer badge 或 recovery internals。

最低测试：

- reference platform public behavior matrix；
- production package absence；
- production IPC capability matrix；
- Renderer typecheck/build；
- existing Toutiao/Hepan/Lieju/media direct regression；
- query/scan budget 不随平台数量之外的实体数量增长，0 external transport。

### E6 — Combined audit 与 closure

1. 对 E1～E5 最终组合边界执行一次 Primary Audit，不重审已完成历史 Wave。
2. finding 分类为 `INTRODUCED_BY_CHANGE`、`EXPOSED_PREEXISTING`、`CROSS_COMPONENT_INTERACTION`、`PROCESS_EVIDENCE_GAP`。
3. P0/P1 必须关闭；直接影响当前 acceptance、唯一 owner、安全 host/path、uncertain、公开合同或 package 的 P2 阻塞，其余登记未来 owner。
4. remediation 后只做 bounded re-audit：finding 修复 diff、平台 definition/loader、直接 consumers、图片 ports、reference fixture、package/security 和直接回归。
5. 只有修改 schema、公开产品语义、事实 writer、事务/远端副作用边界或引入新 P0/P1 时才扩大审计。
6. 最终 production/contracts/tests/package/doc 进入同一 source state 后运行完整 gate并记录 `HEAD + diff/status`；旧 101-test baseline 不能替代最终验证。

## 7. 最终验收矩阵

- [ ] `PlatformDefinitionV1` 是平台静态元数据与 capability 的唯一 owner。
- [ ] loader 对 exact contract、重复 ID、非法 host/path 和 capability/port mismatch fail-closed。
- [ ] 标准 reference platform 无共享层平台 ID 特例即可进入普通投稿公开链路。
- [ ] Renderer 不保留平台 display-name 平行表。
- [ ] workspace composition、account runtime、worker session 不保留普通平台 ID 条件分支。
- [ ] security/package 的显式平台差异有 code-owned definition 或具名平台 owner，不来自用户/远端配置。
- [ ] 普通队列、付费媒体、文章生命周期、attention、publication writer 数量均未增加。
- [ ] accepted/rejected/group-blocked/uncertain 与禁止自动 retry 行为不变。
- [ ] 图片库仍只有一个实例和一个权威文件边界 owner。
- [ ] regular image selection 只依赖 selection port；平台图片交付只依赖 `ImagePlanV1 + imageAssetReader`。
- [ ] `src/platforms/*` 不依赖 `client-image-*` 内部实现文件。
- [ ] 图片扫描/读取失败继续 best-effort 自动降级，不新增 retry/人工 decision 状态。
- [ ] 不新增图片 IPC/UI/数据库/使用状态。
- [ ] reference fixture 不进入 production package，真实平台所需资产完整进入 package。
- [ ] targeted、typecheck、build、packaging、完整测试与最终 smoke 在同一 source state PASS。
- [ ] 未执行的真实外部验收及原因明确记录。

## 8. 验证阶梯

每个工作包先跑最接近风险的定向测试，再逐级扩大：

1. definition/parser/loader 与 platform isolation tests。
2. account/session/settings/profile/regular preparation tests。
3. client image library、plan、asset reader、Lieju delivery tests。
4. regular platform acceptance、submission center、article lifecycle、attention/recovery direct regression。
5. production IPC fixture matrix、main/bridge/Renderer typecheck。
6. Renderer build 与 architecture/package gates。
7. `npm test`；需要 Electron 合成 focus fixture时按 runner 合同显式启用，不允许 skip 冒充通过。
8. `npm run test:packaging` 与 dirty production ASAR smoke；只使用本地合成输入。
9. `git diff --check`、最终 `HEAD + diff/status` 与 test evidence。

禁止通过真实网站 POST、图片上传、付费或生产账号证明本地架构 gate；真实外部验收必须另行逐次授权。

## 9. 风险与控制

| 风险 | 控制 |
| --- | --- |
| definition 变成万能 capability bag | exact versioned schema、冻结具名 roles、未知字段拒绝，不接受任意键/任意 factory。 |
| 只是把 ID 分支搬进浅 registry | 特殊行为与平台实现同地；共享调用者只拿窄 ports；reference platform 验证无需改共享 owner。 |
| 动态 external host 放宽安全边界 | 只读取 code-owned enabled definition，严格 hostname 校验，用户/环境/远端不可扩展。 |
| loader 重构导致 workspace 间共享 session | 每 workspace 构造 runtime ports；并发 workspace isolation 和 cleanup tests。 |
| 特殊设置被过度通用化 | settings/profile/runtime 保持各自 owner，只统一注册入口，不统一业务 schema/UI。 |
| media 被误并入普通平台 | target kind 与 capability exact gate；paid application direct regression。 |
| 图片 reader 把敏感路径/bytes 泄漏到 IPC/日志 | process-local non-serializable capability、safe diagnostics、contract/inspection tests。 |
| 图片读取集中后增加内存压力 | 保持 0～5 上限、逐项读取、平台大小 gate；不建立全库 bytes cache。 |
| 为绿灯长期保留新旧 adapter surface | consumer-led replace-and-delete；没有真实消费者不保 compatibility layer。 |
| package glob 漏带或多带平台资产 | definition-to-artifact manifest 验证；特殊 runtime 继续显式 allowlist/smoke。 |

## 10. 必须停止并询问

只有出现以下情况才停止请求用户决策：

- 发现 repo 外消费者依赖当前 default adapter export 或具体宽 adapter shape；
- 用户希望支持第三方动态插件、在线安装或不受信代码执行；
- 需要新增/迁移持久 schema、删除运行事实或改变文章/投稿产品语义；
- 需要把新的平台专属客户字段纳入持久内容 schema，但产品定义尚未确定；
- 需要真实账号、真实发布、图片上传、付费、生产迁移或不可逆外部操作；
- media 与普通平台的 target/订单边界无法在当前 SPEC 下保持。

普通文件移动、接口命名、测试失败、平台方法较多、package gate 更新或局部重构不构成停止理由。

## 11. 完成定义

本计划只有在以下条件全部成立后才能标记 `COMPLETE`：

- E0～E5 串行完成，E6 combined audit 与 bounded closure PASS；
- 标准 reference platform 通过正式 seam 完成公开行为验收；
- 平台静态知识、特殊 contribution 和图片 owner 均只有一个权威来源；
- 没有新增 writer、状态机、自动 retry、兼容 facade 或未经授权的远端路线；
- 所有 blocking finding 关闭；
- production、contracts、tests、package 和文档进入同一可识别 source state；
- 最终完整验证、package smoke、`git diff --check` 与 `HEAD + diff/status` 有真实 evidence；
- 未运行的真实外部验收、剩余风险、Git/merge/push 状态明确记录；
- 完成后停止，不继续把图片库拆成独立服务或为假想插件扩展范围。

## 12. Closure record（实施时填写）

- **Execution status:** `RUNNING`
- **Current gate:** `E2 READY`
- **Implementation source state:** `6c1641ea89acfacd3c9877b6f92bfffb28d54763`（E0/E1 integration commit）
- **Completed packages:** `E0, E1`
- **Commands and results:** E1 最终定向矩阵 `167 passed / 0 failed`；packaging contracts `49 passed / 0 failed`；Phase 1 + Phase 8 architecture/package gate `8 passed / 0 failed`；定向 ESLint 与 `git diff --check` PASS。详细命令、finding 与 closure evidence 见 `handoffs/post-wave-platform-extensibility-e1-audit-closure-20260816.md`
- **Audit findings and disposition:** E0 Primary Audit F1–F3 已关闭；E1 Primary Audit F1–F5 均已最小修复，bounded re-audit PASS，无 deferred finding
- **Unrun acceptance and reasons:** full `npm test`、Renderer typecheck/build 与真实 electron-builder package smoke 不属于 E1 工作包 closure gate；真实登录/发布/上传/付费/迁移未授权且本工作包禁止执行
- **Remaining risks:** E2 尚未开始；Renderer display-name、external-host、named workspace path、共享 composition 中的特殊平台 contribution 等静态知识仍按 E2/E3 gate 保留
- **Final Git status:** E0/E1 已进入本地 integration commit `6c1641ea89acfacd3c9877b6f92bfffb28d54763`；未 merge/push
