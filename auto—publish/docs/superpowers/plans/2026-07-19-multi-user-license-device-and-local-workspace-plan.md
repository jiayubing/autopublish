# 多用户账号、授权期限、设备名额与本地工作区隔离计划

**日期：** 2026-07-19

**桌面项目：** `F:\官媒投稿\auto—publish`

**认证服务：** `F:\官媒投稿\auto—publish\auth-server`

**认证域名：** `https://auth.jiayubing.xyz`

**部署服务器：** J4125（约 7GB 总内存，现有 Docker + Cloudflare Tunnel）

**前置实现：** 软件启动登录门禁、主进程业务 IPC 认证、单管理员账号、access/refresh token、固定认证域名已经实现。

**目标：** 将当前单管理员、JSON 文件存储的认证容器升级为适合对外销售 AutoPublish 的轻量多用户授权中心；支持账号启停、授权期限、设备名额、会话撤销和基础审计，同时确保客户资料、文章、模板、投稿队列、发布记录和平台凭证始终只保存在用户本地。

**主方案：** 继续使用并深化现有 `autopublish-auth` Docker，不引入 Authentik、Keycloak 或云端工作区。当前单管理员认证数据无需迁移；切换时备份旧文件并重新创建管理员和用户。

本计划只定义实现、测试、部署和回滚步骤，不直接连接或修改真实 J4125，不操作真实账号、文章、工作区或投稿数据。

---

## 1. 结论摘要

| 当前事实/需求 | 风险或缺口 | 计划结论 | 优先级 |
| --- | --- | --- | --- |
| 账号存储在 `auth.json` | 整文件读写不适合多用户、并发登录和可靠备份；损坏时当前实现会回落为空数据库。 | 替换为 SQLite，启用事务、外键、WAL、busy timeout 和显式损坏失败。 | P0 |
| 当前只创建 `admin` | 无法销售给多个独立用户。 | 增加普通 `user` 账号；管理员通过 SSH CLI 创建、禁用、续期、重置密码和撤销设备。 | P0 |
| `deviceId` 每次进程启动重新生成 | 同一电脑重启软件会被误认为新设备，设备名额不可用。 | 创建持久化随机安装身份；不使用 MAC、硬盘序列号等硬件指纹。 | P0 |
| 当前只做 250ms 内存节流 | 对公网登录不足，重启后状态丢失，无法抵御密码撞库。 | 增加账号+来源限速、失败计数、暂时锁定和安全审计。 | P0 |
| refresh token 轮换但无 token family | 被重复使用的旧 token 只会失败，不能主动撤销整个可疑会话链。 | 增加 token family 和重复使用检测；发现复用时撤销该设备全部会话。 | P0 |
| 用户准备在以后销售软件 | 只校验密码无法限制共享账号和授权期限。 | 增加 `enabled`、授权到期、设备名额、设备撤销和管理员备注。 | P0 |
| 工作区必须完全本地 | 多用户功能容易被误解为云同步。 | 认证请求严格字段白名单；服务器永远不接收工作区路径、客户、文章、模板、队列或发布记录。 | P0 |
| J4125 只有约 7GB 内存 | Authentik 等完整身份平台常驻多个容器，增加维护和资源开销。 | 保持单 Node 容器 + SQLite；限制资源并使用现有 Tunnel。 | P1 |

---

## 2. 已确认的现状与问题

### 2.1 当前服务端实现

当前 `auth-server` 已具备：

- 固定 `/v1/auth/login`、`refresh`、`logout`、`session`、`entitlements`；
- scrypt 密码哈希；
- access/refresh token 哈希存储；
- refresh token 轮换；
- 单用户启停、修改密码和撤销会话；
- Docker 容器、J4125 本机回环端口和健康检查；
- 客户端固定访问 `auth.jiayubing.xyz`；
- 未认证业务 IPC 返回 `AUTH_REQUIRED`。

但当前 `auth-store.js` 仍：

- 将 users、sessions、audit 全部写入一个 JSON；
- 使用同步 `scryptSync` 阻塞服务器事件循环；
- `readJson()` 对缺失和损坏使用同一个空库回退，存在误建新库风险；
- 只有 `createAdmin`，没有普通用户生命周期；
- session 上限逻辑没有按用户/设备形成明确不变量；
- 没有设备表、授权期限管理、账号备注和持久限速状态。

### 2.2 当前客户端实现

`desktop/services/auth-service.js` 已做到：

- access token 只保存在主进程内存；
- refresh token 使用 `safeStorage` 加密保存在 `userData`；
- Renderer 不直接接触 token；
- AuthGate 通过后才挂载工作区；
- 所有业务 IPC 在主进程检查认证。

当前主要缺口是：

```js
const deviceId = opts.deviceId || crypto.randomUUID();
```

这会在每次启动时生成新的设备身份，无法支持可靠的设备名额。

### 2.3 本轮明确不使用 Authentik

用户只需要：

- 多账号；
- 登录验证；
- 启用/禁用；
- 授权到期；
- 基础设备限制；
- 本地内容不上传。

因此 Authentik 的 OIDC、浏览器回调、PostgreSQL、Worker、组织/联合身份能力不是当前必要复杂度。继续使用现有登录接口可以避免重写 Electron 登录协议。

---

## 3. 数据与隐私边界

### 3.1 J4125 允许保存的数据

- 应用账号 ID 和登录名；
- 密码哈希和密码更新时间；
- 账号启用状态、角色、备注；
- AutoPublish 产品授权和到期时间；
- 设备名额和随机设备身份哈希；
- access/refresh token 哈希；
- 会话创建、刷新、撤销和过期时间；
- 登录成功/失败、账号管理和设备撤销的最小审计事件；
- 客户端应用版本和安全的设备显示名。

### 3.2 J4125 禁止接收的数据

- 工作区路径；
- 客户名称和客户资料；
- 文章 ID、标题、正文和模板；
- Prompt、调研回答和参考链接；
- 投稿队列、发布目标和发布账本；
- 平台 Cookie、浏览器 profile、AI Key；
- 本地文件列表和绝对路径；
- 远端平台完整响应。

### 3.3 认证请求字段白名单

登录请求只允许：

```json
{
  "loginName": "customer-001",
  "password": "仅在 HTTPS 登录请求中出现",
  "deviceId": "随机稳定安装身份",
  "deviceName": "用户可识别的安全显示名",
  "appVersion": "1.0.1"
}
```

refresh 只允许 refresh token、deviceId 和 appVersion；业务工作区 DTO 不得进入认证模块。

---

## 4. 领域规则

### 4.1 应用账号

账号类型：

```text
admin：管理认证服务，也可以使用 AutoPublish
user：只能登录和使用 AutoPublish
```

第一版不增加代理商、组织、部门、文章查看者等角色。

账号必须同时满足：

```text
密码正确
+ enabled=true
+ AutoPublish 产品授权有效
+ 未处于登录锁定
+ 当前设备已登记或仍有设备名额
= 允许建立会话
```

### 4.2 产品授权

每个账号拥有一个 AutoPublish entitlement：

- `enabled=true/false`；
- `expiresAt=null` 表示永久授权；
- 有日期时由 J4125 的 UTC 时间判断是否过期；
- 客户端显示期限，但不得自行延长或决定授权有效；
- 到期后阻止新会话和 refresh，不删除用户本地工作区；
- 管理员续期后用户重新登录即可恢复使用。

### 4.3 已登记设备与设备名额

- 每次安装生成一个随机 `deviceId`，在本机保持稳定；
- 默认普通用户 `maxDevices=1`，管理员可设 1～10；
- 同一 deviceId 重复登录不占用新名额；
- 新 deviceId 登录且名额已满时返回 `AUTH_DEVICE_LIMIT_REACHED`；
- 管理员撤销设备时，同时撤销该设备所有会话；
- 用户卸载或重装导致 deviceId 丢失时，由管理员释放旧设备；
- 不采集 MAC、CPU、主板、硬盘序列号等硬件指纹；
- deviceId 是基础授权控制，不宣称能抵御恶意复制本机配置文件。

### 4.4 密码与首次登录

- 管理员创建用户时设置一次性临时密码；
- 账号初始 `mustChangePassword=true`；
- 用户首次登录后只能进入修改密码流程，不能挂载业务界面；
- 修改密码成功后撤销其他会话，并建立新会话；
- 忘记密码由管理员重置，不做邮件找回；
- 密码不出现在命令行参数、环境变量、日志或数据库明文中。

### 4.5 会话与 token family

- access token 短期有效，默认 15 分钟；
- refresh token 默认 30 天，按续期策略可配置；
- 每次 refresh 轮换 access/refresh token；
- session 绑定 userId、deviceId 和 token family；
- 旧 refresh token 被再次使用时，视为可能泄漏，撤销整个 token family；
- 禁用账号、授权到期、修改密码和撤销设备都立即撤销相关 refresh 会话；
- 已开始的投稿远端调用不被认证刷新失败强杀，任务完成后禁止新业务操作。

---

## 5. 深模块与接口设计

### 5.1 `AuthDomain` 模块

这是认证服务的核心深模块。HTTP、SSH CLI 和测试只通过它的接口操作账号、授权、设备和会话，不直接读写 SQLite。

外部接口保持为五个能力：

```text
login(input) -> AuthSessionResult
refresh(input) -> AuthSessionResult
inspect(accessToken) -> AuthPrincipal
logout(input) -> LogoutResult
changePassword(input) -> AuthSessionResult
```

模块实现隐藏：

- 密码验证与异步 scrypt；
- 授权期限判断；
- 设备登记和名额；
- 会话创建与 token 轮换；
- token reuse detection；
- 登录失败锁定；
- SQLite 事务；
- 审计记录。

删除这个模块后，上述复杂度会散落到每个 HTTP 路由，因此该模块具有足够深度和局部性。

### 5.2 `AuthAdministration` 模块

管理员 CLI 使用独立的深模块接口：

```text
execute(command) -> AdminCommandResult
query(query) -> AdminQueryResult
```

`command.type` 仅允许：

```text
create-user
enable-user
disable-user
reset-password
set-expiry
set-device-limit
revoke-device
revoke-sessions
update-note
```

`query.type` 仅允许：

```text
list-users
show-user
list-devices
list-audit
```

CLI 只负责收集输入和格式化输出，不复制账号、设备或会话规则。

### 5.3 存储 seam

内部定义一个存储 interface，由两个 adapter 实现：

- 生产 `SqliteAuthRepository` adapter；
- 测试 `InMemoryAuthRepository` adapter。

测试通过 `AuthDomain` 和 `AuthAdministration` 的接口验证行为，不测试 SQLite 私有查询细节。只有 repository adapter 自身的契约测试直接检查事务、约束和备份恢复。

### 5.4 传输 adapter

- `HttpAuthAdapter`：将 `/v1/auth/*` 请求映射到 `AuthDomain`；
- `AdminCliAdapter`：将 SSH 命令映射到 `AuthAdministration`；
- 不增加第二套业务规则；
- Electron 客户端保持现有 HTTPS 协议，只增加错误码和首次改密流程。

---

## 6. SQLite 数据模型

### 6.1 `users`

```text
id                  TEXT PRIMARY KEY
login_name          TEXT UNIQUE NOT NULL
password_hash       TEXT NOT NULL
role                TEXT NOT NULL CHECK(admin|user)
enabled             INTEGER NOT NULL
must_change_password INTEGER NOT NULL
max_devices         INTEGER NOT NULL
note                TEXT
failed_login_count  INTEGER NOT NULL
locked_until        TEXT
created_at          TEXT NOT NULL
updated_at          TEXT NOT NULL
last_login_at       TEXT
password_changed_at TEXT NOT NULL
```

### 6.2 `entitlements`

```text
user_id             TEXT NOT NULL
product             TEXT NOT NULL
enabled             INTEGER NOT NULL
expires_at          TEXT
created_at          TEXT NOT NULL
updated_at          TEXT NOT NULL
PRIMARY KEY(user_id, product)
FOREIGN KEY(user_id) REFERENCES users(id)
```

### 6.3 `devices`

```text
id                  TEXT PRIMARY KEY
user_id             TEXT NOT NULL
device_key_hash     TEXT NOT NULL
display_name        TEXT
app_version         TEXT
first_seen_at       TEXT NOT NULL
last_seen_at        TEXT NOT NULL
revoked_at          TEXT
UNIQUE(user_id, device_key_hash)
FOREIGN KEY(user_id) REFERENCES users(id)
```

服务端只保存 deviceId 的哈希，不保存原值。

### 6.4 `sessions`

```text
id                  TEXT PRIMARY KEY
family_id           TEXT NOT NULL
user_id             TEXT NOT NULL
device_id           TEXT NOT NULL
access_token_hash   TEXT NOT NULL UNIQUE
refresh_token_hash  TEXT NOT NULL UNIQUE
access_expires_at   TEXT NOT NULL
refresh_expires_at  TEXT NOT NULL
created_at          TEXT NOT NULL
last_seen_at        TEXT NOT NULL
rotated_at          TEXT
revoked_at          TEXT
revoke_reason       TEXT
FOREIGN KEY(user_id) REFERENCES users(id)
FOREIGN KEY(device_id) REFERENCES devices(id)
```

### 6.5 `used_refresh_tokens`

保存已轮换 refresh token 的短期哈希和 familyId，用于发现旧 token 重放；保留时间不超过对应 refresh TTL。

### 6.6 `audit_events`

```text
id                  TEXT PRIMARY KEY
event_code          TEXT NOT NULL
user_id             TEXT
device_id           TEXT
source_fingerprint  TEXT
result_code         TEXT
created_at          TEXT NOT NULL
```

审计不得保存密码、token、工作区、文章标题、请求体或完整 IP。来源信息使用受控摘要或截断值。

### 6.7 SQLite 运行参数

- `PRAGMA foreign_keys=ON`；
- `journal_mode=WAL`；
- `busy_timeout` 明确设置；
- 每个账号/授权/设备/会话变更使用事务；
- schema 版本记录在 `schema_migrations`；
- 数据库损坏或未知 schema 必须启动失败，不能回退为空库；
- 使用参数化语句，不拼接 loginName 或用户输入。

---

## 7. 服务端接口与错误契约

### 7.1 保持兼容的认证端点

```text
GET  /healthz
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/auth/session
GET  /v1/auth/entitlements
POST /v1/auth/change-password
```

旧桌面客户端仍可使用前六个端点；新增字段必须向后兼容。

### 7.2 新增安全错误码

```text
AUTH_ACCOUNT_DISABLED
AUTH_ACCOUNT_LOCKED
AUTH_LICENSE_EXPIRED
AUTH_NOT_ENTITLED
AUTH_DEVICE_LIMIT_REACHED
AUTH_DEVICE_REVOKED
AUTH_PASSWORD_CHANGE_REQUIRED
AUTH_INVALID_CREDENTIALS
AUTH_SESSION_EXPIRED
AUTH_TOKEN_REUSE_DETECTED
AUTH_RATE_LIMITED
AUTH_SERVICE_UNAVAILABLE
```

HTTP 和 Electron IPC 只返回稳定错误码和固定中文文案，不返回 SQLite、堆栈、数据目录、token 或服务器内部异常。

### 7.3 登录响应

```json
{
  "accessToken": "opaque",
  "refreshToken": "opaque",
  "accessExpiresAt": "UTC ISO",
  "refreshExpiresAt": "UTC ISO",
  "user": {
    "id": "opaque",
    "loginName": "customer-001",
    "role": "user",
    "mustChangePassword": false
  },
  "entitlements": [
    {
      "product": "AutoPublish",
      "enabled": true,
      "expiresAt": "UTC ISO or null"
    }
  ],
  "device": {
    "displayName": "Windows device",
    "registered": true,
    "deviceCount": 1,
    "maxDevices": 1
  }
}
```

---

## 8. 管理员账号管理

### 8.1 第一版使用 SSH CLI

管理入口只在 J4125 SSH 中执行：

```text
authctl user create
authctl user list
authctl user show
authctl user enable
authctl user disable
authctl user reset-password
authctl user set-expiry
authctl user set-device-limit
authctl user set-note
authctl device list
authctl device revoke
authctl session revoke-all
authctl audit list
```

Docker 调用形式由 README 给出，但密码不放进命令参数或环境变量。创建/重置密码使用隐藏交互输入，一次性密码只显示一次。

### 8.2 创建用户默认值

```text
role=user
enabled=true
mustChangePassword=true
maxDevices=1
AutoPublish entitlement enabled=true
expiresAt=管理员明确输入，不静默永久
```

管理员必须明确选择永久授权或到期日期。

### 8.3 禁用、到期和删除

- 禁用账号：立即撤销全部会话，数据保留；
- 到期：阻止 refresh 和新登录，数据保留；
- 第一版不提供物理删除用户，避免丢失审计和误复用登录名；
- 不再出售的账号使用 disabled；
- loginName 创建后不可修改，显示名称以后可单独增加。

### 8.4 网页管理后台

第一版不实现网页管理后台。原因：

- SSH CLI 已满足基本多账号管理；
- 避免增加公开管理端点、浏览器 refresh cookie、CSRF 和 XSS 风险；
- 用户规模增长后，可以让新管理页复用 `AuthAdministration` 模块，而不是直接操作数据库。

将网页后台列为后续独立计划，不阻塞本轮多用户销售授权。

---

## 9. 桌面客户端调整

### 9.1 持久化安装身份

**Create：** `desktop/device-identity-store.js`

保存位置：Electron `userData`，与工作区分离。

记录：

```json
{
  "version": 1,
  "deviceId": "random UUID",
  "createdAt": "UTC ISO"
}
```

规则：

- 首次运行原子创建；
- 后续启动读取同一 ID；
- 损坏时明确报错或创建新设备前提示，不静默频繁换 ID；
- deviceId 不进入工作区、安装包或日志；
- 不使用 localStorage；
- 不读取硬件序列号。

### 9.2 登录和首次修改密码

- 登录遇到 `AUTH_PASSWORD_CHANGE_REQUIRED` 时进入修改密码页面；
- 修改完成后建立新会话并挂载工作区；
- 显示授权期限和设备用量；
- `AUTH_DEVICE_LIMIT_REACHED` 显示“联系管理员释放旧设备”；
- 账号禁用/到期不会删除本地 refresh token 以外的任何文件；
- 重新授权后用户可以继续使用原工作区。

### 9.3 认证请求零内容数据

在主进程 HTTP adapter 做字段白名单，测试拦截全部认证请求并断言不存在：

```text
workspacePath
clientId
articleId
title
content
queue
publication
cookie
apiKey
prompt
```

---

## 10. 安全与可靠性

### 10.1 密码计算

- 保留 scrypt 或升级到 Argon2id，但第一版优先继续使用 Node 异步 scrypt，减少依赖；
- 将 `scryptSync` 改为异步 `crypto.scrypt`，避免阻塞所有登录请求；
- 参数和版本写入编码后的 password hash，便于以后渐进升级；
- 登录成功时发现旧参数，后台重新哈希；
- 限制并发密码计算数量，保护 J4125 CPU 和内存。

### 10.2 限速和锁定

- 按规范化 loginName + 可信来源摘要限速；
- 连续失败使用递增延迟；
- 达到阈值写入 `locked_until`；
- 登录成功清零失败计数；
- 不因不存在的账号返回不同时间或不同文案；
- 只在服务来自本机 Cloudflare Tunnel 时信任受控转发头。

### 10.3 容器加固

- 固定 Node 基础镜像和依赖版本，不使用 `latest`；
- 多阶段构建；
- 非 root 用户运行；
- 根文件系统只读，只有 `/data` 可写；
- `no-new-privileges`；
- 删除不需要的 Linux capabilities；
- 回环监听 `127.0.0.1:3180`；
- Cloudflare Tunnel 提供唯一公网入口；
- 资源上限建议从 512MB 内存、1 CPU 开始压测后调整；
- 健康检查只返回服务和数据库可用性，不返回账号数量。

### 10.4 审计和日志

允许记录事件码：

```text
LOGIN_SUCCEEDED
LOGIN_FAILED
ACCOUNT_LOCKED
PASSWORD_CHANGED
ACCOUNT_CREATED
ACCOUNT_DISABLED
ENTITLEMENT_UPDATED
DEVICE_REGISTERED
DEVICE_REVOKED
DEVICE_LIMIT_REJECTED
SESSION_REVOKED
TOKEN_REUSE_DETECTED
```

禁止日志字段：密码、token、文章、工作区、Cookie、完整请求体、数据库路径。

### 10.5 备份

- SQLite 数据目录使用独立 Docker volume/bind mount；
- 使用 SQLite 在线 backup/checkpoint，不在 WAL 未处理时直接复制单一 `.db`；
- 保留每日和每周备份；
- 备份加密，密钥不与备份同目录；
- 每次 schema 升级前创建可恢复快照；
- 定期在临时目录执行恢复测试；
- 备份只包含认证数据，不包含任何用户工作区。

---

## 11. 分阶段实施任务

### Task 0：保护当前工作树并建立红色回归

**Create：**

- `auth-server/tests/multi-user-auth.test.js`
- `auth-server/tests/device-limit.test.js`
- `auth-server/tests/session-family.test.js`
- `auth-server/tests/admin-cli.test.js`
- `auth-server/tests/sqlite-repository.test.js`
- `tests/device-identity-store.test.js`
- `tests/auth-local-data-boundary.test.js`

**Modify：**

- `auth-server/tests/auth-api.test.js`
- `tests/auth-service.test.js`
- `tests/auth-gate.test.js`
- `tests/auth-protected-ipc.test.js`
- `scripts/verify.js`

实施：

- [ ] 先提交或快照当前已实现的登录验证和投稿进度改动。
- [ ] 创建两个用户，证明当前只有 `createAdmin`、无法管理普通用户，先 RED。
- [ ] 重启桌面 AuthService 两次，证明 deviceId 改变，先 RED。
- [ ] 同一账号设备名额为 1，第二设备当前仍能创建会话，先 RED。
- [ ] 模拟并发保存 JSON，证明当前接口缺少事务保护，先 RED。
- [ ] 模拟损坏 auth.json，断言当前错误回退为空库，先 RED。
- [ ] 拦截认证请求，建立“零工作区内容字段”回归。

### Task 1：建立 `AuthDomain` 和 `AuthAdministration` 深模块

**Create：**

- `auth-server/src/auth-domain.js`
- `auth-server/src/auth-administration.js`
- `auth-server/src/repositories/in-memory-auth-repository.js`

**Modify：**

- `auth-server/src/server.js`
- `auth-server/tests/auth-api.test.js`

实施：

- [ ] HTTP adapter 只做输入校验、调用模块和错误映射。
- [ ] 账号、授权、设备、会话和审计规则集中到两个深模块。
- [ ] 使用 in-memory adapter 先实现全部领域测试。
- [ ] 删除穿透内部存储的旧测试，保留通过模块接口验证的行为测试。
- [ ] 保持现有 `/v1/auth` 端点向后兼容。

### Task 2：实现 SQLite repository adapter

**Create：**

- `auth-server/src/repositories/sqlite-auth-repository.js`
- `auth-server/migrations/002-multi-user.sql`
- `auth-server/scripts/migrate.js`
- `auth-server/scripts/backup.js`

**Modify：**

- `auth-server/package.json`
- `auth-server/Dockerfile`
- `auth-server/docker-compose.yml`
- `auth-server/src/auth-store.js`（过渡后删除或只保留明确导出工具）

实施：

- [ ] 选择并固定 SQLite adapter 依赖；若使用原生依赖，Docker 改成可重复的多阶段构建。
- [ ] 实现 schema_migrations、事务、外键、WAL 和 busy timeout。
- [ ] 未知 schema、数据库损坏和不可写目录启动失败。
- [ ] 所有 token 和 deviceId 只存哈希。
- [ ] SQLite adapter 通过与 in-memory adapter 相同的契约测试。
- [ ] 用户已确认不迁移旧单管理员数据；保留只读备份后初始化新数据库。

### Task 3：实现普通用户、授权期限和首次改密

**Modify：**

- `auth-server/src/auth-domain.js`
- `auth-server/src/auth-administration.js`
- `auth-server/src/server.js`
- `auth-server/src/token-service.js`
- `auth-server/tests/multi-user-auth.test.js`

实施：

- [ ] 支持 admin/user 两个角色。
- [ ] 支持 enabled、expiresAt、mustChangePassword、note。
- [ ] 增加 `/v1/auth/change-password`。
- [ ] 临时密码首次登录只返回改密要求，不开放业务授权。
- [ ] 过期、禁用和无 entitlement 使用不同稳定错误码。
- [ ] 修改密码撤销其他设备会话。
- [ ] 服务端时间是授权期限的唯一判断来源。

### Task 4：实现设备登记、名额和会话 family

**Modify：**

- `auth-server/src/auth-domain.js`
- `auth-server/src/token-service.js`
- `auth-server/tests/device-limit.test.js`
- `auth-server/tests/session-family.test.js`

实施：

- [ ] 同一 user+device 重复登录复用设备身份。
- [ ] 新设备超过 maxDevices 返回 `AUTH_DEVICE_LIMIT_REACHED`。
- [ ] 已撤销设备不能 refresh。
- [ ] refresh token 每次轮换并记录 token family。
- [ ] 已轮换 token 重放触发 family 撤销。
- [ ] 每用户/每设备会话数量有上限和明确清理规则。
- [ ] 审计不保存原始 deviceId 或 token。

### Task 5：扩展 SSH 管理 CLI

**Modify：**

- `auth-server/scripts/admin.js`
- `auth-server/package.json`
- `auth-server/README.md`

**Create：**

- `auth-server/scripts/authctl.js`
- `auth-server/tests/admin-cli.test.js`

实施：

- [ ] 实现用户创建、列表、启停、重置密码、续期、设备名额和备注。
- [ ] 实现设备列表/撤销和全部会话撤销。
- [ ] 密码使用隐藏交互输入，不接收命令行明文参数。
- [ ] 列表输出不显示密码哈希、token 哈希和完整来源信息。
- [ ] 所有管理操作写入安全审计。
- [ ] 提供 J4125 Docker 内执行示例。

### Task 6：修复桌面设备身份和多用户错误流程

**Create：**

- `desktop/device-identity-store.js`

**Modify：**

- `desktop/main.js`
- `desktop/services/auth-service.js`
- `desktop/ipc/auth-ipc.js`
- `media-workbench/src/auth-store.tsx`
- `media-workbench/src/components/AuthGate.tsx`
- `media-workbench/src/types.ts`
- `media-workbench/src/electron-api.ts`

实施：

- [ ] deviceId 改为 userData 中稳定、原子保存的随机安装身份。
- [ ] 登录传递安全 deviceName 和 appVersion。
- [ ] 支持首次改密界面。
- [ ] 显示账号到期时间和设备用量。
- [ ] 设备满、账号禁用、授权过期、账号锁定使用明确中文错误。
- [ ] 登录另一个账号时清除前一账号 token，不改变工作区文件。
- [ ] 客户端不缓存管理员备注和无关账号列表。

### Task 7：J4125 新认证容器部署与切换

**只有用户明确授权服务器部署后执行。**

**Modify：**

- `docs/j4125-auth-deployment-checklist.md`
- `auth-server/docker-compose.yml`
- `auth-server/.env.example`

实施：

- [ ] 在本地和临时容器完成全部测试后构建固定版本镜像。
- [ ] 备份旧 `auth.json` 和旧镜像，但不导入新 SQLite。
- [ ] 新容器先绑定临时回环端口，创建 admin 和测试 user。
- [ ] 验证多用户、设备名额、到期、禁用、refresh 和撤销。
- [ ] 确认认证请求不包含任何工作区内容。
- [ ] 使用同一 `auth.jiayubing.xyz` 做受控切换，不新增公网端口。
- [ ] 客户端重新登录；旧 refresh token 预期失效。
- [ ] 观察 CPU、内存、SQLite 锁和登录延迟。
- [ ] 验收后保留短期回滚窗口，再删除旧容器和旧 JSON secret。

### Task 8：备份、负载和故障演练

**Create：**

- `auth-server/tests/concurrent-login.test.js`
- `auth-server/scripts/restore-check.js`

实施：

- [ ] 构造至少 100 个账号的列表和授权测试。
- [ ] 模拟 10 个并发登录，确认异步密码哈希不阻塞健康检查。
- [ ] 模拟 refresh 并发和旧 token 重放。
- [ ] 在 J4125 记录空闲和登录突发时的 `docker stats`。
- [ ] 验证容器 512MB 初始限制下不 OOM；不足时以测量结果调整。
- [ ] 执行 SQLite 在线备份和临时恢复。
- [ ] 模拟数据库只读、磁盘满、WAL 损坏和未知 schema，确认服务失败关闭。
- [ ] 模拟 J4125 不可达，确认桌面只锁定业务，不删除本地工作区。

### Task 9：全量验证、文档和打包

**Modify：**

- `docs/desktop-workbench.md`
- `docs/clean-machine-installation.md`
- `docs/alpha-packaging-checklist.md`
- `docs/j4125-auth-deployment-checklist.md`
- `CONTEXT.md`
- `scripts/verify.js`
- `tests/desktop-packaging.test.js`
- `tests/electron-security.test.js`

实施：

- [ ] 更新单管理员说明为多用户授权中心。
- [ ] 记录账号、授权、设备和会话的管理命令。
- [ ] 明确所有工作区内容仅在本地。
- [ ] verifier 检查安装包不含 SQLite 数据库、账号、密码、token、J4125 secret 和工作区内容。
- [ ] 运行服务端专项、桌面专项、全量测试、Renderer build、verify 和 alpha 打包。

---

## 12. 测试矩阵

### 12.1 多用户账号

| 场景 | 预期 |
| --- | --- |
| 创建 user-a 和 user-b | ID、密码、会话完全独立 |
| 重复 loginName | 唯一约束阻止，不覆盖旧用户 |
| user-a 密码错误 | 不影响 user-b 的失败计数 |
| 禁用 user-a | user-a 全部会话撤销，user-b 不受影响 |
| user-a 到期 | 登录/refresh 拒绝，本地工作区不删除 |
| 管理员续期 | user-a 重新登录后恢复 |
| 临时密码首次登录 | 只能改密，不能进入 App |
| 重置密码 | 旧会话全部失效 |

### 12.2 设备名额

| 场景 | 预期 |
| --- | --- |
| maxDevices=1，设备 A 登录 | 成功并登记 A |
| 软件在设备 A 重启 | 使用稳定 deviceId，不占第二名额 |
| 设备 B 登录 | 返回设备名额已满 |
| 管理员撤销 A | A 会话失效，B 可登记 |
| 同 deviceId 复制到两台机器 | 视为同一基础设备身份；明确这是轻量限制而非硬件 DRM |
| 设备被撤销后 refresh | 返回设备已撤销 |

### 12.3 会话安全

| 场景 | 预期 |
| --- | --- |
| access token 到期 | 使用 refresh 正常轮换 |
| 旧 refresh token 再次使用 | 撤销 token family 并记录审计 |
| 账号禁用 | access 检查和 refresh 均拒绝 |
| 修改密码 | 其他设备会话撤销 |
| 并发 refresh | 只有一个成功；重放策略不制造多个有效链 |
| logout | 当前会话撤销，其他设备按策略保留 |

### 12.4 本地数据边界

| 检查 | 预期 |
| --- | --- |
| 登录请求 | 只有账号、密码、设备、版本字段 |
| refresh 请求 | 只有 token、设备和版本 |
| J4125 数据库 | 无客户、文章、队列、发布记录和 Cookie |
| 登录另一个用户 | 不上传、不重命名、不删除本地工作区 |
| 账号到期/禁用 | 本地工作区完整保留 |
| 安装包 | 不含服务端数据库和账号 secret |

### 12.5 SQLite 和容器

| 场景 | 预期 |
| --- | --- |
| 两个登录并发写会话 | 事务完成，无 JSON 覆盖问题 |
| 数据库损坏 | 启动失败，不创建空库覆盖 |
| 未知 schema | 启动失败并提示运维迁移 |
| 只读数据卷 | 健康检查失败，登录不返回假成功 |
| 在线备份恢复 | 用户、授权、设备、会话撤销状态一致 |
| 容器重启 | 账号和设备保留，内存限速状态按设计恢复/重置 |

---

## 13. 验证命令

认证服务专项：

```powershell
node --test `
  auth-server/tests/auth-api.test.js `
  auth-server/tests/multi-user-auth.test.js `
  auth-server/tests/device-limit.test.js `
  auth-server/tests/session-family.test.js `
  auth-server/tests/admin-cli.test.js `
  auth-server/tests/sqlite-repository.test.js `
  auth-server/tests/concurrent-login.test.js
```

桌面认证专项：

```powershell
node --test `
  tests/auth-service.test.js `
  tests/auth-ipc-boundary.test.js `
  tests/auth-gate.test.js `
  tests/auth-protected-ipc.test.js `
  tests/device-identity-store.test.js `
  tests/auth-local-data-boundary.test.js
```

全量：

```powershell
npm test
npm run build:renderer
npm run verify
npm run pack:alpha
```

J4125 授权部署后：

```bash
docker compose ps
docker compose logs --tail 100 autopublish-auth
docker stats --no-stream autopublish-auth
curl --fail https://auth.jiayubing.xyz/healthz
```

不得把真实密码或 token 写进 curl 历史、脚本或仓库。

最终专项信号：

```text
GREEN multi-user: isolated accounts and sessions
GREEN entitlement: enable, expiry, renewal
GREEN device-limit: stable device id and revocation
GREEN refresh-family: rotation and reuse detection
GREEN sqlite: transactional, fail-closed, restorable
GREEN local-data-boundary: zero workspace content sent
GREEN J4125: resource-bounded container behind Tunnel
GREEN package: no auth database, password, token, or server secret
```

---

## 14. 部署与回滚顺序

### 部署

1. 提交/快照当前已实现的单管理员登录版本。
2. 在本地临时目录完成 SQLite 多用户测试。
3. 构建带版本号的 Docker 镜像。
4. 备份 J4125 当前认证容器、配置和 `auth.json`。
5. 使用临时回环端口启动新容器。
6. 创建新 admin、临时 user 和设备限制 fixture。
7. 完成登录、续期、禁用、设备撤销和恢复测试。
8. 切换 `auth.jiayubing.xyz` 到新容器。
9. 发布兼容新错误码和稳定 deviceId 的桌面包。
10. 观察一轮登录和 refresh 后再清理旧容器。

### 回滚

- Tunnel 指回旧认证容器；
- 恢复旧镜像和只读备份的 `auth.json`；
- 新多用户 token 不兼容时要求重新登录，不尝试伪造旧会话；
- 回滚不触碰任何用户本地工作区；
- 保留失败的新 SQLite 数据库用于诊断，但不得上传或输出账号哈希。

---

## 15. 建议提交顺序

1. `test: reproduce multi-user storage and device identity gaps`
2. `refactor: deepen authentication domain behind one interface`
3. `feat: replace json auth storage with transactional sqlite`
4. `feat: add user entitlement expiry and first-password change`
5. `feat: enforce device slots and refresh token families`
6. `feat: add safe ssh account and device administration`
7. `fix: persist desktop installation identity across launches`
8. `docs: document local-only workspace and multi-user licensing`
9. `chore: package and verify multi-user auth deployment`

---

## 16. 最终验收标准

- [ ] 管理员可以创建、查看、启停、续期和重置多个普通账号。
- [ ] 每个账号的密码、授权、设备和会话互相隔离。
- [ ] 普通账号可以设置永久或明确到期授权。
- [ ] 默认设备名额为 1，可由管理员调整和释放。
- [ ] 软件重启不会生成新设备身份或重复占用名额。
- [ ] 禁用、到期、改密和撤销设备能立即阻止后续 refresh。
- [ ] refresh token 轮换和重放检测不会产生多个有效会话链。
- [ ] JSON 存储已由事务型 SQLite 替代；损坏时失败关闭，不回退空库。
- [ ] J4125 仅保存账号、授权、设备、会话和安全审计。
- [ ] 客户资料、文章、模板、队列、发布记录、Cookie 和工作区路径从未进入认证请求。
- [ ] 账号失效不会删除、修改或上传用户本地工作区。
- [ ] 管理通过 SSH CLI 完成，第一版不增加公开网页后台。
- [ ] J4125 容器在约 7GB 总内存环境中经过空闲和登录突发测量，无 OOM。
- [ ] `auth.jiayubing.xyz` 继续通过 Cloudflare Tunnel 提供 HTTPS，不新增公网端口。
- [ ] 服务端专项、桌面专项、全量测试、Renderer build、verify 和 alpha 打包全部通过。

---

## 17. 非目标

- 不使用 Authentik、Keycloak、Authelia 或其他完整身份平台。
- 不实现云端工作区、文章同步、队列同步或发布账本同步。
- 不上传客户资料、文章、Prompt、Cookie 或本地路径。
- 不开放公共注册。
- 不实现邮箱验证、找回密码、支付和自动开通授权。
- 不实现组织、代理商、部门或复杂 RBAC。
- 不使用硬件序列号做强 DRM。
- 不物理删除已售账号和审计记录。
- 不在第一版实现公开网页管理后台。
- 不在未获得用户明确服务器授权前修改 J4125、Tunnel、DNS、Docker 或防火墙。
