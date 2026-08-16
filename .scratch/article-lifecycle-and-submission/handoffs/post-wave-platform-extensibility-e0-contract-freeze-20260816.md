# Post-Wave E0 实时消费者清单与扩展合同冻结

**工作包：**`E0 — 实时消费者清单与扩展合同冻结`

**实施基线：**`codex/jiagou @ 7747e64743ad3441097df1294874bc120772a1ad`

**源码根：**`auto—publish/`

**实施方式：**先按 Manual Dispatch 完成 inventory/合同/baseline；用户随后授权继续，已完成 E0 Primary Audit、blocking remediation 与 bounded re-audit。未执行 E1、commit、merge、push 或真实外部操作。

**结论：**E0 `COMPLETE`；审计 closure 见 `post-wave-platform-extensibility-e0-audit-closure-20260816.md`，下一 gate 为 `E1 READY`。

## 1. 实时事实摘要

- `config/platforms.json` 只保存 enabled ID，但 `src/core/platforms.js` 仍按宽 adapter 形状校验并返回完整 adapter。
- 当前四个平台真实差异不能由 `contentQueueImport + publicationTarget + method existence` 准确表达：
  - Lieju：普通投稿、浏览器登录、账号检查、客户投稿资料、图片交付；当前没有 legacy scan/parse/publish port；
  - Toutiao：普通投稿、legacy queue、浏览器登录、账号检查，当前 text-only；
  - Hepan：普通投稿、legacy queue、settings-backed runtime/账号检查、Python 与 vendor 资产，当前没有 login-session port；
  - media：`resource`/付费应用路线和专属 settings，不属于普通队列或通用 legacy workbench。
- Renderer 仍在 `media-workbench/src/bridge/platform.ts` 维护 `lieju/toutiao/hepan` display-name 平行表。
- `workspace-runtime-composition.js` 仍含 Hepan preparation 和 Lieju client profile 的平台 ID 分支；`platform-account-runtime.js`、`desktop-task-service.js`、worker cleanup 也含 Hepan/平台数组特例。
- 客户图片只有 `src/content/client-image-library.js` 一个实例 owner；production 只有 selection 与 Lieju asset delivery 两条调用链。
- `listImages`、`listAvailableImages`、`scanMany` 和 positional alias `select` 没有 production consumer；`selectImages` 与 `resolveImage` 各有一个 production consumer。

## 2. 平台 ID occurrence ledger

以下按 owner/语义分类；同一文件若承担两种语义，分别列入对应分类。平台实现内部固定 ID、远端 URL 和诊断标识属于该平台的具名 owner，不算共享层扩展散点。

### 2.1 `STATIC_PLATFORM_METADATA`

| 位置 | 当前事实 | E1/E2 disposition |
| --- | --- | --- |
| `config/platforms.json` | enabled IDs：`lieju/toutiao/hepan/media` | 保留，只保存启用 ID |
| `src/publication/publication-targets.js` | 四平台 target-kind 平行声明 | 由 code-owned definitions 投影；publication target parser 保持唯一合同 owner |
| `src/infrastructure/workspace/storage-paths.js`、`workspace-paths.js` | `mediaInput/liejuInput/toutiaoInput/hepanInput` | E2 按 consumer 移除运行时重复字段；`input/<scanDir>` 成为通用路径 |
| `media-workbench/src/bridge/platform.ts` | 三个普通平台 display-name map | E2 删除，由主进程 definition read model 投影 |
| `desktop/services/desktop-task-service.js` | `PLATFORM_SESSIONS` 固定数组 | E2 改为 loaded login-session ports |
| `desktop/main.js` | `www.toutiao.com/www.lieju.com` 外链 allowlist | E2 从 enabled definitions 的 `externalHosts` 生成并与固定应用 host 合并 |
| `scripts/config.js` | 旧 `articleDir: 'lieju'` | legacy owner；E2 核对 consumer 后保留或删除 |

### 2.2 `GENERIC_RUNTIME_CONSUMER`

| 位置 | 当前消费 |
| --- | --- |
| `src/core/platforms.js` | module load、宽 adapter validation、enabled filter、image capability projection |
| `src/app/publish-batch.js` | scan/parse queue snapshot |
| `desktop/services/submission-target-catalog.js` | ID/display/target/queue/image projection |
| `desktop/services/regular-queue-application.js` | 普通 admission 与 image capability |
| `desktop/services/regular-platform-preparation-port.js` | `preparePlatformSubmission` |
| `desktop/services/platform-account-inspector.js` | readiness + `inspectAccount` |
| `desktop/services/platform-session-service.js` | `openLogin/checkLogin/saveSession`，并猜测 `ensureSession` |
| `desktop/services/platform-workbench-application.js`、`platform-workbench/queue-reader.js`、`command-preparer.js` | legacy scan/parse/command preparation；当前以 `media` ID 排除 resource |
| `desktop/worker/publisher-executor.js`、`desktop/worker/run-task.js` | legacy parse/session/publish/cleanup；当前以 `media` ID阻断 resource |
| `desktop/services/submission-maintenance-service.js` | `contentQueueImport` 筛选 |
| `desktop/composition/workspace-runtime-composition.js` | loader、目录、admission、account、preparation 和 workbench 装配 |

上述 consumer 在 E1/E2 后只能获得对应窄 port collection，不得再读取完整平台实现或用 `typeof adapter.method` 推断 capability。

### 2.3 `BESPOKE_PLATFORM_CAPABILITY`

| 平台 | 位置 | 唯一 owner / 后续归位 |
| --- | --- | --- |
| Hepan | `desktop/services/platform-settings/hepan-settings-adapter.js`、`platform-settings-service.js`、settings IPC/Renderer | settings owner；保留专属 schema/UI，通过 `settings` contribution 接入 |
| Hepan | `desktop/services/hepan-regular-preparation-adapter.js`、`platform-account-runtime.js`、`desktop-task-service.js`、worker runtime setup/cleanup | 移到 Hepan module 的具名 contribution；不得留共享 ID branch |
| Hepan | `src/infrastructure/runtime/playwright-runtime-resolver.js`、`runtime-diagnostics-service.js` | optional Python runtime/diagnostic owner，通过 `runtimeArtifacts` contribution 投影 |
| Lieju | `src/content/client-knowledge.js`、content IPC/contracts/bridge/types、`ClientLiejuPublicationProfileEditor.tsx` | 客户资料事实继续由 content owner 持久化；Lieju 只声明并消费 `clientProfile` contribution |
| Lieju | `workspace-runtime-composition.js` 的 profile resolver、`src/platforms/lieju/*` | E3 把 resolver 接线移入 Lieju contribution；E4 图片只消费 `ImagePlanV1 + imageAssetReader` |
| media | media settings、media resource/order/preflight/application/IPC/Renderer | 独立 paid/resource application owner；definition 只提供身份、display、target kind 与 settings contribution |

### 2.4 `SECURITY_OR_PACKAGING_GATE`

- `desktop/main.js`：外链 host fail-closed allowlist。
- `electron-builder.alpha.yml`：`src/**/*`、`config/**/*`、Hepan Python/vendor 显式包含；敏感/运行期内容显式排除；Hepan/Playwright 仅必要文件 `asarUnpack`。
- `electron-builder.production.yml`、`electron-builder.production-smoke.yml`：继承 alpha 文件边界并增加 production manifest/smoke gate。
- `scripts/production-artifact-contract.js`、`create-production-artifact-manifest.js`、`verify-production-package.js`：生产 artifact 白名单、哈希和缺失/额外文件验证。
- `scripts/verify-alpha-package.js`、`offline-smoke-checks.js`、CI 的 `HEPAN_VENDOR_DIR`：Hepan script/vendor/runtime 具名 gate。
- `scripts/verify-phase-08-gates.js`：当前平台 adapter 与敏感配置 absence gate。
- `src/platforms/*` 的远端 URL/host parser：平台协议安全 owner；不得由 workspace 或远端内容覆盖。

### 2.5 `MIGRATION_ONLY`

- `scripts/migrate-operational-store-v1.js` 与 `src/content/legacy-migration-planner.js` 中 `kind: "media"`、`media-resource:*`、旧 platform ID：历史 payload 解释与一次性导入，不是运行时平台 registry。
- `scripts/migrate-content-library-v2.js` 中 `work/playwright-cli/profiles/toutiao`：旧浏览器 profile 搬迁路径。
- legacy sidecar/source/target platform IDs 由 migration contract 原样解析；不得从 definitions 获得 executable capability，也不得因平台停用而无法解释历史事实。

### 2.6 `TEST_FIXTURE`

平台 ID fixture 分为两组：

- **公开行为/状态 fixture（保留）：**`ticket-25-b/c/d/e`、regular outcomes、publication target/evidence、account binding/inspection、platform session/workbench、Hepan/Lieju/media 协议与 settings、workspace/migration/packaging 测试。
- **架构形状 fixture（随 surface 处置）：**`adapter-workspace-injection.test.js` 的宽 loader 返回值、`platform-account-runtime.test.js` 的 Hepan ID override、`platform-workbench-service.test.js` 的宽 adapter fixture、Renderer display-name map fixture、named workspace input path fixture。

测试内 platform ID 只可作为 synthetic/历史 fixture；不得把测试 fixture 反向变成 production definition owner。

### 2.7 exhaustive occurrence coverage manifest

以下 manifest 覆盖 `src/`、`desktop/`、`media-workbench/src/`、`scripts/`、`config/`、builder config 与 CI 中四个 built-in ID 的 production/package/migration occurrence。平台目录内部的固定 ID、URL、诊断和协议字段按目录整体登记，避免逐行复制同一 owner；未列入 production owner 的硬编码示例归 `TEST_FIXTURE`。

| 分类 | exhaustive files / owned groups |
| --- | --- |
| `STATIC_PLATFORM_METADATA` | `config/platforms.json`; `src/publication/publication-targets.js`; `src/infrastructure/workspace/{storage-paths,workspace-paths}.js`; `desktop/main.js`; `desktop/services/desktop-task-service.js`; `media-workbench/src/bridge/platform.ts`; `scripts/config.js` |
| `GENERIC_RUNTIME_CONSUMER` | `src/core/platforms.js`; `src/core/playwright.js`; `src/app/publish-batch.js`; `desktop/services/{submission-target-catalog,regular-queue-application,regular-platform-preparation-port,platform-account-inspector,platform-session-service,platform-workbench-application,submission-maintenance-service}.js`; `desktop/services/platform-workbench/{queue-reader,command-preparer}.js`; `desktop/worker/{publisher-executor,run-task}.js`; `desktop/composition/workspace-runtime-composition.js` |
| Lieju `BESPOKE_PLATFORM_CAPABILITY` | `src/platforms/lieju/**/*`; `src/content/client-knowledge.js`; `desktop/ipc/{ai-content-ipc,contracts/content-library-contracts}.js`; `desktop/preload.js`; `desktop/services/{ai-content-service,platform-account-runtime}.js`; `media-workbench/src/bridge/content.ts`; `media-workbench/src/types/content.ts`; `media-workbench/src/features/content/{content-sources-feature,use-content-workbench-feature}.js`; `media-workbench/src/components/{ContentWorkbench,content/ClientLiejuPublicationProfileEditor,content/GeneratedArticlesView,content/GeneratedArticlesView.types}.tsx` |
| Hepan `BESPOKE_PLATFORM_CAPABILITY` | `src/platforms/hepan/**/*`; `desktop/services/hepan-regular-preparation-adapter.js`; `desktop/services/platform-settings/hepan-settings-adapter.js`; `desktop/services/{platform-account-runtime,platform-settings-service,runtime-diagnostics-service,runtime-diagnostics-probes,desktop-task-service}.js`; `desktop/ipc/contracts/settings-contracts.js`; `desktop/runtime-config.js`; `src/infrastructure/runtime/playwright-runtime-resolver.js`; `media-workbench/src/components/{SettingsView,settings/SettingsNavigation,settings/SettingsOverview,settings/HepanProviderSettings}.tsx`; `media-workbench/src/features/settings/{settings-context.tsx,settings-feature.js}` |
| media `BESPOKE_PLATFORM_CAPABILITY` | `src/platforms/media/**/*`; `src/domain/{paid-media-order-contract,publication-evidence-contract,publication-target,regular-publication-contract}.js`; `src/content/{article-lifecycle-facts,internal/article-mutation-admission}.js`; `src/infrastructure/operational-store/internal/{operational-store-fact-reader,operational-store-order-aggregate,operational-store-order-observation-aggregate,operational-store-outcome-writer,operational-store-paid-execution-aggregate,operational-store-publication-aggregate,operational-store-publication-archive-query,operational-store-queue-admission-transaction}.js`; `desktop/services/{desktop-publisher-router,media-publisher,media-workbench-application,media-resource-service,media-order-service,paid-media-preflight-service,platform-settings-service}.js`; `desktop/services/platform-settings/{media-settings-adapter,media-settings-projection,media-risk-confirmation-adapter}.js`; media/settings IPC contracts and Renderer media/settings/history components/features/types |
| `SECURITY_OR_PACKAGING_GATE` | `electron-builder.{alpha,production,production-smoke}.yml`; `.github/workflows/ci.yml`; `scripts/{production-artifact-contract,create-production-artifact-manifest,verify-production-package,verify-alpha-package,verify-phase-08-gates,offline-smoke-checks,offline-smoke-runner,create-alpha-smoke-workspace.ps1}.js`; platform-owned host/runtime-path policies under `src/platforms/{lieju,toutiao,hepan,media}/` |
| `MIGRATION_ONLY` | `scripts/{migrate-operational-store-v1,migrate-content-library-v2}.js`; `src/content/{legacy-migration-planner,legacy-migration-reader}.js`; `src/domain/migration-import-contract.js`; operational-store migration import owner |
| production-file `TEST_FIXTURE` | hard-coded example payloads in `desktop/ipc/contracts/{submission-regular-contracts,submission-maintenance-contracts}.js`; `src/domain/publisher-contract.js` fake publisher; benchmark-only IDs in `scripts/run-ticket-25-f-benchmark.js` |

`media` 同时是历史 domain target kind；这些 occurrence 仍归 paid/resource 或 migration owner，不得机械迁入 ordinary platform definition。设置 UI 中的 `media/hepan` section ID 是具名 contribution consumer，不是标准平台 display metadata。

## 3. 当前 adapter 方法 consumer map

| 当前字段/方法 | production consumer | disposition |
| --- | --- | --- |
| `id`, `scanDir`, `publicationTarget`, `contentQueueImport`, `imagePublishingCapability` | loader、target catalog、regular admission、workbench、worker | 移入 definition/directory projection |
| `ensureSession`, `ensureLoggedIn`, `closeSession` | worker executor/cleanup；account/session fallback | 按 `legacyQueue` 或 `loginSession/accountInspection` port 明确拥有；删除 method guessing |
| `openLogin`, `checkLogin`, `saveSession` | `platform-session-service` | `loginSession` port；close 也纳入该 port |
| `ensureAccountInspectionReady`, `inspectAccount` | `platform-account-inspector` | `accountInspection.prepare/inspect` |
| `preparePlatformSubmission` | `regular-platform-preparation-port`；Hepan wrapper | `regularSubmission.preparePlatformSubmission(claim, imagePlan)` |
| `scanArticles`, `parseArticleFiles`, `publishArticle` | publish-batch、legacy workbench、worker | `legacyQueue.scan/parse/publish`；仅声明 capability 的平台可达 |
| `setRuntimeConfig`, `clearRuntimeConfig`, `resolveHepanRuntime` | worker `run-task` / Hepan legacy runtime | Hepan settings/runtime contribution；不进入通用 port |
| media `createMediaAdapter/createMediaSupplierAdapter` | media application/services 的直接具名 owner | 不进入 loaded ordinary-platform record |
| post-processing | `publication-recovery-composition` / `publication-post-processor` | 不是 platform adapter capability；保持 publication recovery owner |
| settings | `platform-settings-service` 的 media/hepan adapters | named `settingsContribution`，不并入普通 submission port |
| shutdown | workspace composition disposers、worker close、desktop task session close | 只遍历已装载 `loginSession`/legacy cleanup ports；cleanup failure 只安全诊断 |

## 4. `PlatformDefinitionV1` exact contract

Definition 是随应用打包的代码常量。顶层 exact keys 固定为：

```text
schemaVersion: 1
id: builtin platform identifier
displayName: non-empty safe display text
publicationTargetKind: "platform" | "resource"
scanDir: one safe relative path segment
capabilities: {
  regularSubmission: boolean
  legacyQueueImport: boolean
  loginSession: boolean
  accountInspection: boolean
  imagePublishing: boolean
}
contributions: {
  settings: boolean
  clientProfile: boolean
  runtimeArtifacts: boolean
}
externalHosts: readonly hostname[]
```

Exactness/invariants：

- 顶层、`capabilities`、`contributions` 和 runtime ports 均拒绝未知 key；所有 boolean key 必须显式存在。
- `id`/`scanDir` 仅允许小写 ASCII `[a-z][a-z0-9-]{0,63}`，不得为 `.`/`..`、绝对路径、分隔路径或含控制字符；所有 loaded definitions 的 `id` 唯一。
- `displayName` trim 后 1–80 Unicode scalar，不含 control/bidi override；不得由配置或远端响应覆盖。
- `externalHosts` 只接受小写 ASCII DNS hostname，去重、无 scheme/port/path/wildcard/IP/localhost；只扩大显式外链 allowlist，不授权 platform webview/navigation/HTTP target。
- `publicationTargetKind === "resource"` 时 `regularSubmission/loginSession/accountInspection/imagePublishing` 必须为 false；付费 media application 不经普通 loader port 执行。
- `imagePublishing === true` 必须同时 `regularSubmission === true`；平台只通过 `ImagePlanV1` 与注入的 `imageAssetReader` 读取资产。
- workspace/env/remote/config 只能选择 enabled built-in ID，不能增加 definition、host、capability、port 或 artifact。

### 4.1 capability / contribution → required port matrix

| 声明 | required immutable port / invariant |
| --- | --- |
| `regularSubmission` | `regularSubmission.preparePlatformSubmission(claim, imagePlan)` |
| `legacyQueueImport` | exact `legacyQueue` port：`scan()`、`parse(items)`、`publish(article, options)`、`close()`；全部方法必须存在，`close()` 可以是具名 no-op |
| `loginSession` | `loginSession.open()`、`check()`、`save()`、`close()` |
| `accountInspection` | `accountInspection.prepare(context)`、`inspect()` |
| `imagePublishing` | requires `regularSubmission`; platform factory 必须声明/接收 `imageAssetReader`，不得导入图片库内部文件 |
| `contributions.settings` | `settingsContribution.create(options)`，只交 settings owner |
| `contributions.clientProfile` | `clientProfileContribution.requirement` + `createReader(contentProfilePort)`，只交 content/profile owner |
| `contributions.runtimeArtifacts` | exact `runtimeArtifactContribution.describe()`；只交 package/diagnostic owner，不能修改 builder include rules |

声明为 false 时对应 port/contribution 必须不存在；声明为 true 时缺失、类型错误或额外 port 均在 composition/load 阶段 fail-closed。普通 consumer 只得到所需 port collection。

### 4.2 当前四个平台定义投影

| id | display | kind | regular | legacy | login | inspect | image | contributions | external hosts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lieju` | 列举网 | platform | yes | no | yes | yes | yes | clientProfile | `www.lieju.com` |
| `toutiao` | 头条 | platform | yes | yes | yes | yes | no | none | `www.toutiao.com` |
| `hepan` | 蓝色河畔 | platform | yes | yes | no | yes | no | settings, runtimeArtifacts | none |
| `media` | 付费媒体 | resource | no | no | no | no | no | settings | none |

`mp.weixin.qq.com` 保持应用级固定外链 host；media 供应商返回 URL 继续由 media order/endpoint policy 校验，不能反向写入 definition。

Lieju 当前 `contentQueueImport: true` 只被普通 admission 复用，并不证明 legacy worker 能执行：其 adapter 没有 `scanArticles`、`parseArticleFiles` 或 `publishArticle`。因此 definition 必须把 `regularSubmission=true` 与 `legacyQueueImport=false` 分开；E2 应停止把 Lieju 暴露给 legacy worker 路线，而不是伪造 compatibility publish port。

### 4.3 exact contribution port shapes

所有 contribution object 自身 exact、immutable；声明为 false 时 module 不得导出同名 contribution。

```text
settingsContribution = {
  createSettingsAdapter(context) -> SettingsAdapter
}

clientProfileContribution = {
  requirement: { profileKey, requiredFields },
  createProfileReader(contentProfilePort) -> { read({ clientId }) }
}

runtimeArtifactContribution = {
  describe() -> {
    platformId,
    requirements: [{
      artifactId,
      kind: "file" | "directory-sentinel",
      packagedPath,
      required,
      smokeCheck
    }]
  }
}
```

- `profileKey`、`requiredFields`、`artifactId`、`smokeCheck` 均为短 code-owned token；profile reader 只通过 content owner 读取，不接收 workspace path。
- `packagedPath` 是 normalized POSIX app-relative path，只允许 `src/platforms/<definition.id>/...`、`resources/<definition.id>/...` 或既有显式 runtime-tools root；禁止绝对路径、`..`、glob、workspace/env substitution。
- `directory-sentinel` 只验证一个具名已打包文件，不授权递归 include。实际 `files`、`asarUnpack`、`extraResources` 仍必须在 package owner 显式加入并接受 package audit。
- `runtimeArtifactContribution` 是 requirements/diagnostic projection，不是 executable installer，也不能把远端或 workspace 文件带入包。

### 4.4 stable loader error codes

```text
PLATFORM_DEFINITION_SCHEMA_UNSUPPORTED
PLATFORM_DEFINITION_UNKNOWN_FIELD
PLATFORM_DEFINITION_ID_INVALID
PLATFORM_DEFINITION_ID_DUPLICATE
PLATFORM_DEFINITION_DISPLAY_NAME_INVALID
PLATFORM_DEFINITION_TARGET_KIND_INVALID
PLATFORM_DEFINITION_SCAN_DIR_INVALID
PLATFORM_DEFINITION_CAPABILITIES_INVALID
PLATFORM_DEFINITION_CONTRIBUTIONS_INVALID
PLATFORM_DEFINITION_EXTERNAL_HOST_INVALID
PLATFORM_DEFINITION_INVARIANT_VIOLATION
PLATFORM_MODULE_LOAD_FAILED
PLATFORM_PORT_REQUIRED
PLATFORM_PORT_UNDECLARED
PLATFORM_PORT_INVALID
```

诊断 outer fields 使用稳定 `code/module/category/operationId`。metadata exact allowlist 为 `platformId`、`action`、`schemaVersion`、`capability`、`port`；值必须是已验证的短 token。禁止记录 definition 原对象、未知字段值、host/path 原值、Cookie、Token、页面正文、绝对敏感路径或供应商异常。

## 5. 标准普通平台 extension contract

新增 synthetic standard platform 只允许业务性修改：

1. 新平台目录中的 code-owned definition 与实现；
2. `config/platforms.json` enabled ID（仅启用选择）；
3. 新平台自身协议/公开行为测试。

启用后必须自动出现：submission directory identity/display/target/image flag、普通 admission、账号检查（若声明）、登录入口（若声明）、regular preparation/execution、投稿中心展示、workspace isolation、shutdown cleanup 和通用 synthetic acceptance。

以下共享文件不得因标准平台新增而出现该平台 ID 或业务分支：

- `src/core/platforms.js` 与 publication lifecycle/queue/OperationalStore owners；
- `desktop/composition/workspace-runtime-composition.js`；
- platform/regular submission IPC、preload、bridge/types；
- `media-workbench/src/bridge/platform.ts` 及共享 Renderer feature/components；
- `desktop/main.js` 手写平台 host 表、`desktop-task-service.js` session 数组；
- workspace path owner 的 named input fields；
- package gate 的“当前平台文件名数组”。

专属 settings/profile/runtime/artifact 是特殊平台真实 owner 变更，不计入“标准平台只改实现+启用配置”预算。

## 6. 图片库 ledger 与冻结合同

### 6.1 方法与生产消费者

| `client-image-library` method | production consumer | disposition |
| --- | --- | --- |
| `selectImages(clientId, options)` | `regular-image-plan-service.js` | E4 替换为 object-input `imageSelectionPort.select` |
| `resolveImage(clientId, imageId)` | composition 注入 → Lieju multipart | E4 替换为 `imageAssetReader.read` |
| `scan`, `invalidate` | library 内部职责/测试，无外部 production consumer | 保持 internal，不从 production port 暴露 |
| `listImages`, `listAvailableImages`, `scanMany`, `select` | 无 production consumer | `DELETE_WITH_RETIRED_SURFACE`；E4 同步删除旧 surface 测试 |

两条 production 调用链：

```text
claim → regular-queue-group-orchestrator → regular-image-plan-service
      → client-image-library.selectImages → ImagePlan

ImagePlan + claim → Lieju adapter → image-multipart-preparation
                  → imageResolver.resolveImage → metadata/read bytes
```

Lieju 当前直接依赖 ledger：

- `src/platforms/lieju/image-multipart-preparation.js` 直接 import `client-image-reference` 与 `client-image-metadata`；
- composition 直接投影 `clientImageLibrary.resolveImage`；
- Lieju 自己重复 `ImagePlan` shape parser、metadata 校验、文件读取和 fingerprint。

以上在 E4 必须收敛为 `ImagePlanV1 + imageAssetReader`；Lieju 继续拥有 4 槽位、1 MiB 平台限制、multipart charset/field 和 best-effort warning。

### 6.2 `ImagePlanV1`

Exact immutable shape：

```text
{
  version: 1,
  requestedCount: integer 0..5,
  selectedCount: integer 0..requestedCount,
  textOnly: boolean === (selectedCount === 0),
  images: [{ imageId, name, extension, mimeType, width, height, size }],
  warnings: [{ code, stage }]
}
```

- 所有层级 exact keys；images 数量等于 `selectedCount`，`imageId` 唯一。
- `imageId` 是 opaque safe reference；不暴露路径。name 不含 separator/NUL；extension/mime/dimensions/size 合法且有上限。
- warning code/stage 使用稳定 allowlist；不带原异常、路径或正文。
- parser 是唯一 plan shape owner；selection service 和平台不得各自复制 parser。

### 6.3 `imageSelectionPort`

```text
select({ clientId, count, random? })
  -> { version: 1, clientId, requestedCount, images: SafeImageReference[], warnings: SafeImageWarning[] }
```

输入 exact；`count` 为 0..5；`random` 只允许进程内函数注入且不跨 IPC。结果不含 absolute/relative path、bytes、scanner/cache/diagnostic detail。可恢复扫描错误映射为安全 warning，选择失败继续自动降级，不创建 retry/人工 decision。

### 6.4 `imageAssetReader`

```text
read({ clientId, imageId })
  -> { name, extension, mimeType, width, height, size, bytes, assetFingerprint }
```

- 每次 read 重新验证 client identity、path containment、symlink、文件类型、metadata/extension/mime/size；不能信任 selection 时的旧 metadata。
- `bytes` 必须是进程内 Buffer，`assetFingerprint` 为读取 bytes 的 SHA-256 hex。
- 返回值 immutable，定义 `toJSON` 和 inspect redaction，禁止跨 IPC、持久化或安全日志化。
- 通用 reader 只执行图片库安全边界；平台大小/槽位/远端字段仍归平台。

## 7. 测试 disposition

| 测试 | disposition | 理由 |
| --- | --- | --- |
| `adapter-workspace-injection.test.js` | `REPLACE_WITH_PUBLIC_BEHAVIOR` | 保留 workspace isolation；不锁宽 adapter/default export |
| `platform-account-inspector.test.js` | `KEEP` + port fixture 更新 | 账号绑定/失败关闭为公开行为 |
| `platform-account-runtime.test.js` | `REPLACE_WITH_PUBLIC_BEHAVIOR` | 删除共享 Hepan ID override，改验 settings contribution |
| `platform-browser-session-lifecycle.test.js` | `KEEP` | session lease/save/close owner 行为稳定 |
| `platform-settings-service.test.js` | `KEEP` | settings owner 行为；adapter 注册方式可更新 |
| `platform-workbench-service.test.js` | `KEEP` + legacy port fixture 更新 | queue/file/path 行为保留，不锁宽 adapter |
| `regular-platform-adapter-outcomes.test.js`、`regular-platform-outcomes.test.js`、`ticket-25-c-regular-platform-acceptance.test.js` | `KEEP` | accepted/rejected/group-blocked/uncertain 与 queue 语义不可回归 |
| `client-image-library.test.js` | `KEEP` internal owner；alias cases `DELETE_WITH_RETIRED_SURFACE` | path/scan/cache/read safety 保留；无 consumer alias 删除 |
| `client-image-selector.test.js` | `KEEP` | 随机无放回与 count 规则 |
| `regular-image-plan-service.test.js` | `REPLACE_WITH_PUBLIC_BEHAVIOR` | 改测 selection port + unique parser，不再 import path/reference internals |
| `lieju-image-multipart-preparation.test.js` | `REPLACE_WITH_PUBLIC_BEHAVIOR` | 改测 `ImagePlanV1 + imageAssetReader`；保留 slots/limit/degrade |
| `ticket-18-a/b` | `KEEP` | 持久 imageCount/admission contract 不变 |
| `workspace-paths.test.js` | `KEEP`；named platform path assertion 按 E2 disposition 更新 | workspace boundary 保留，扩展不新增 named path |

E1–E5 必须迁移/替换旧 architecture tests，不能让新旧 surface 同时成为长期合同。

## 8. package/build/security 影响与 gate

- Definition 模块必须位于现有 `src/**/*` 打包边界，生产 manifest/verify gate 需要证明 enabled definition、实现和 required ports 同时存在。
- runtime artifact contribution 只能返回 code-owned、repo-relative、normalized exact entries；禁止 glob、绝对路径、`..`、workspace/env/remote 注入。
- Hepan `hepan_publish.py` 与 `resources/hepan/vendor-pure` 继续显式 `files + asarUnpack + artifact contract + offline smoke`；definition 不能替代这些 gate。
- Playwright/Node runtime 继续由 runtime-tools manifest、`extraResources` 和 resolver owner 验证。
- 新标准 JS-only 平台不得自动扩大 `asarUnpack` 或 `extraResources`。
- 外链 host 只从已启用、已验证的 built-in definitions 投影；固定应用 host 单独合并。平台 HTTP/session 内部 host policy 与 Renderer external-link policy 不互相授权。
- migration scripts 继续在 installed app files 中排除或作为具名 operator resource；definition 不得使 migration-only code 可执行。
- private runtime data、clients、workspace、browser、provider config、Cookie、logs、tests fixtures 的现有排除必须保持。

## 9. 验证与 Git evidence

首次从仓库根运行计划中的相对命令时，Node 将全部测试参数视为不存在的根路径；真实应用根为 `auto—publish/`。随后在真实应用根按原测试集合重跑：

```text
node --test tests/adapter-workspace-injection.test.js tests/platform-account-inspector.test.js tests/platform-account-runtime.test.js tests/platform-browser-session-lifecycle.test.js tests/platform-settings-service.test.js tests/platform-workbench-service.test.js tests/regular-platform-adapter-outcomes.test.js tests/regular-platform-outcomes.test.js tests/ticket-25-c-regular-platform-acceptance.test.js tests/client-image-library.test.js tests/client-image-selector.test.js tests/regular-image-plan-service.test.js tests/lieju-image-multipart-preparation.test.js tests/ticket-18-a-queue-image-count-persistence.test.js tests/ticket-18-b-queue-image-config-surface.test.js tests/workspace-paths.test.js
```

结果：`101 passed / 0 failed / 0 skipped / 6762.5676 ms`。

验证绑定：

- HEAD：`7747e64743ad3441097df1294874bc120772a1ad`
- production source/schema/test：未修改
- E0 文档改动：本 handoff + Post-Wave plan closure record
- 已运行：Primary Audit、F1–F3 remediation、bounded re-audit；最终 baseline 为 `101 passed / 0 failed / 0 skipped / 6761.1968 ms`
- 未运行：full `npm test`、typecheck/build/package smoke（E0 无 production 改动且合同最低 gate 只要求 101-test baseline）
- 未执行：真实登录、投稿、图片上传、付费、取消、生产迁移（无本次授权，且 E0 不需要）

## 10. Closure 与下一 gate

- E0 Primary Audit 的 F1–F3 已修复，bounded re-audit `PASS`；E0 标记 `COMPLETE`。
- 下一串行 gate 为 **E1 READY**；本次授权没有启动 E1 implementation。
- 当前主要风险是 E1/E2 若保留 default adapter export、method guessing 或平台 named workspace paths，会形成兼容双 surface；本合同明确禁止。
- media 的付费 application 与普通 loader port 必须继续隔离；migration-only ID 解释不能因 definition 启用状态改变。
