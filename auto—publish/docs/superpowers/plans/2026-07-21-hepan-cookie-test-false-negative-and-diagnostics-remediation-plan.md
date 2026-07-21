# AutoPublish 蓝色河畔登录诊断、账号识别与配置焦点修复计划

**日期：** 2026-07-21
**唯一计划入口：** 本文档
**范围：** 蓝色河畔 Cookie 登录检查、栏目权限、图片上传上下文、账号身份显示、配置中心确认交互、Electron 窗口焦点生命周期、错误实现清理与 alpha 打包验收
**目标：** 修复有效 Cookie 被误报为登录失败的问题；登录成功后显示河畔账号名称和 UID；彻底修复保存、测试或清除配置后 input/select 无法操作、必须最小化再恢复的问题。测试全过程不得发布文章、上传图片、创建订单或记录 Cookie。

---

## 一、已确认事实与根因

### 1. 当前 Cookie 可以登录并访问栏目 121

2026-07-21 已使用当前 Cookie 对栏目 121 做只读请求。真实响应证据：

```text
HTTP status: 200
最终 URL: https://www.hepan.com/portal.php?mod=portalcp&ac=article&catid=121
重定向次数: 0
存在 formhash: true
存在密码输入框: false
存在登录表单: false
```

因此当前 Cookie 身份有效，且账号可以访问栏目 121 的发文表单。北京时间、Python、栏目 ID 和 Cookie 过期均不是本次假失败的原因。

### 2. 当前登录页识别会把正常发文页误判为登录页

当前 `is_login_page()` 扫描整页 HTML，并使用类似以下条件：

```python
"login" in response.text.lower() and (
    "password" in response.text.lower() or "登录" in response.text.lower()
)
```

正常发文页包含通用脚本单词 `login`，页面导航又包含“登录”文字，于是错误返回：

```text
HEPAN_AUTH_REDIRECTED
```

实际页面没有重定向、密码框或登录 form。临时将判断收紧为“明确登录 URL，或真实登录 form + password input”后，同一 Cookie 返回：

```json
{
  "ok": true,
  "authenticated": true,
  "publishAccess": true,
  "uploadContext": "changed",
  "stage": "upload_context",
  "errorCode": "HEPAN_UPLOAD_CONTEXT_CHANGED"
}
```

这证明登录身份和栏目权限均通过；`uploadContext=changed` 是独立的图片上传页面兼容性问题，不能覆盖登录成功结论。

### 3. 初始登录测试错误地耦合了完整发布上下文

旧实现的 `check_login()` 直接执行完整 `load_publish_context()`，除 formhash 外还强制解析图片上传所需的：

```text
"uid":"数字","hash":"十六进制"
```

图片上传 token 不是登录身份的必要条件。页面脚本格式变化时，正确 Cookie 会因 `image upload uid/hash not found` 被误报为无效。当前修复不得重新引入这条耦合。

### 4. 错误映射曾把所有检查失败都变成 Cookie 无效

栏目无权限、页面结构变化、HTTP 5xx、超时、依赖错误、解析错误和上传参数缺失都曾统一映射成 `HEPAN_LOGIN_INVALID`。必须保留分阶段错误，只有明确的登录证据失败才能提示用户更新 Cookie。

### 5. 账号名称可以从结构化登录节点稳定提取

当前登录页面的明确账号节点为：

```text
selector: #um .vwmy a
displayName: yoyo逛吃
uid: 2093208
```

同页还有“我的空间”链接并指向相同 UID，但它是导航文案，不是账号名称。不能取页面中第一个 `home.php?mod=space&uid=` 链接作为用户名。

### 6. 配置操作后的不可点击不是 DOM 禁用或残留遮罩

已在 `release-alpha/win-unpacked/AutoPublish.exe` 中稳定复现：

1. 测试请求结束，结果文案已经渲染。
2. input、select 和按钮在 Accessibility tree 中均没有 `disabled`。
3. 页面没有 Portal backdrop、`aria-modal=true`、`inert` 或 `pointer-events:none` 残留。
4. 点击 select 不展开，点击 input 不获得焦点。
5. 焦点停留在 Chromium `RootWebArea`。
6. 最小化后立即恢复，不刷新页面、不重新挂载组件，同一 select 立即展开，同一 input 立即获得焦点。

因此此前“残留全屏 Preflight Portal 拦截点击”的结论已被真实复现推翻。最小化/恢复改变的是 BrowserWindow/WebContents 的激活与输入命中状态，不会改变 React `busy` 数据。

### 7. 原生 `window.confirm()` 是已确认的高风险触发器

蓝色河畔测试、清除 vendor、清除配置，以及 AI、付费媒体、旧配置导入等设置动作直接调用 Renderer `window.confirm()`。在当前 Electron/Windows 打包环境中，原生对话框关闭后出现：

```text
业务 Promise 已完成
DOM controls enabled
BrowserWindow 仍显示
焦点停留 RootWebArea
真实鼠标点击无法激活 input/select
最小化 -> 恢复后立即正常
```

不能通过刷新 React、重置 `busy`、清除 Portal 或要求用户最小化来修复。

“保存配置”本身没有确认框，因此实施时必须在全新窗口中单独验证首次保存：

- 首次保存也冻结：存在第二条通用 command/focus 生命周期缺陷。
- 首次保存正常，先执行测试/清除后再保存才冻结：保存报告属于原生确认框遗留状态。

在完成该隔离实验前，不能把三个按钮笼统归因于同一个 React `busy` 问题。

### 8. 现有测试存在两个盲区

`tests/hepan-login-check.test.js` 的已登录 fixture 只有 formhash 和用户链接，没有线上页面实际存在的通用 `login` 脚本词和导航“登录”，所以无法捕获真实假失败。

`tests/renderer-clear-platform-interaction.test.js` 只读取源码并正则断言存在 `setConfirmation(null)`、`currentView === 'workbench'` 和 `finally { setBusy(false) }`。它没有启动 Electron、关闭原生确认框、执行设置 IPC 或真实点击 input/select。这是伪回归测试，必须删除并替换。

---

## 二、设计原则

1. **登录、栏目、上传三项独立。** 登录成功不等于栏目可发文，上传参数变化也不能推翻登录成功。
2. **登录页依据结构化证据判断。** 只接受明确登录 URL，或真实登录 form、密码框和提交控件的组合；禁止扫描整页通用文字猜测。
3. **账号名称是可选能力。** 提取失败不影响认证与栏目结论。
4. **测试与发布共享基础运行环境。** Python、vendor、Cookie 规范化、站点和 HTTP 会话构造必须一致，但测试不得执行发布和上传。
5. **确认交互属于 Renderer 确认模块。** 配置调用者只提出确认请求，不了解 BrowserWindow、Portal 或焦点恢复实现。
6. **禁止原生确认框 fallback。** 保留 `window.confirm()` 会继续触发同一打包版焦点缺陷。
7. **局部忙碌只锁局部命令。** 任何成功、失败、取消、超时和卸载路径都必须归还，不能设置应用根节点 `inert` 或 `pointer-events:none`。
8. **时间只影响展示。** IPC 保留 ISO 时间；Renderer 按北京时间或系统本地时区显示，时区不参与 Cookie 判断。
9. **敏感信息最小化。** Cookie、完整 HTML、请求头、临时路径和页面正文不得进入日志、错误 DTO、测试 fixture 或计划。

---

## 三、目标模块与接口

### 1. Python 分阶段检查

```python
check_authentication(cookie) -> AuthCheck
check_publish_access(cookie, category_id) -> PublishAccessCheck
check_upload_context(cookie, category_id) -> UploadContextCheck
extract_account_identity(soup) -> AccountIdentity | None
```

配置中心默认检查身份与栏目。上传上下文可以同时诊断，但失败只能形成 warning。

### 2. 登录页判断

`is_login_page()` 必须按以下优先级判断：

1. HTTP 401/403。
2. 重定向历史或最终 URL 命中河畔明确登录路由，例如 `member.php?mod=logging`/`action=login`。
3. DOM 同时存在登录 form action、password input 和登录提交控件。
4. 栏目发文 URL + 有效 formhash 必须判定身份和栏目通过。

正常页面中的 JS 标识、导航“登录”、隐藏模板或帮助文本不能单独作为登出证据。

### 3. 账号身份提取

```python
extract_account_identity(soup) -> {
    "displayName": str,
    "uid": str
} | None
```

选择器优先级：

1. `#um .vwmy a[href*="uid="]`
2. `.vwmy a[href*="uid="]`
3. 经真实 fixture 证明的同类 Discuz 账号节点

禁止：

- 任意空间链接的第一个文本；
- “我的空间”“设置”“退出”等导航文字；
- 正则扫描整页 HTML 猜用户名；
- 从 Cookie、页面标题或 uid/hash 上传参数推导用户名。

### 4. 安全能力 DTO

```json
{
  "ok": true,
  "code": "HEPAN_AUTH_OK",
  "authenticated": true,
  "publishAccess": true,
  "uploadContext": "changed",
  "stage": "upload_context",
  "warnings": ["HEPAN_UPLOAD_CONTEXT_CHANGED"],
  "account": {
    "displayName": "yoyo逛吃",
    "uid": "2093208"
  }
}
```

成功 DTO 使用 `code` 和 `warnings[]`；失败 DTO 才使用 `errorCode`。禁止 `ok=true` 与错误字段并存，否则 Renderer 和调用者容易再次把上传 warning 当成 Cookie 失败。

Node 适配器必须重新校验：

- `displayName` 去除首尾空白和控制字符，限制为 1-80 个 Unicode 字符；
- `uid` 只允许 1-20 位数字；
- identity 非法时整体丢弃，但不覆盖认证结果；
- `account` 仅存在于进程内 `lastTest`，不写 provider JSON；
- Renderer 通过普通 React 文本节点显示，禁止 `dangerouslySetInnerHTML`。

### 5. 状态代码

- `HEPAN_AUTH_OK`
- `HEPAN_COOKIE_REJECTED`
- `HEPAN_AUTH_REDIRECTED`
- `HEPAN_CATEGORY_ACCESS_DENIED`
- `HEPAN_PUBLISH_FORM_CHANGED`
- `HEPAN_UPLOAD_CONTEXT_CHANGED`
- `HEPAN_REMOTE_TIMEOUT`
- `HEPAN_REMOTE_HTTP_ERROR`
- `HEPAN_DEPENDENCY_MISSING`
- `HEPAN_CHECK_RUNTIME_FAILED`

只有 `HEPAN_COOKIE_REJECTED` 和具有真实重定向/登录 form 证据的 `HEPAN_AUTH_REDIRECTED` 可以提示更新 Cookie。

### 6. Cookie 规范化

建立测试与发布共享的规范化函数：

- 去除首尾空白和可选 `Cookie:` 前缀；
- 拒绝 NUL 和 CRLF 请求头注入；
- 保留合法值中的 `=`、百分号编码、Unicode 编码和多个键值；
- 不擅自更改 Cookie 值；
- 临时 Cookie 文件在所有成功/失败路径删除。

### 7. 统一 Renderer 确认模块

新增：

- `media-workbench/src/components/ConfirmationHost.tsx`
- `media-workbench/src/confirmation.tsx`

调用者接口保持很小：

```ts
const { confirm } = useConfirmation();
const approved = await confirm({
  title,
  message,
  confirmLabel,
  tone,
});
```

模块实现内部统一负责：

- Renderer Portal/backdrop；
- `role="dialog"`、`aria-modal="true"`；
- Escape、取消、确认；
- Tab 焦点循环；
- 打开时聚焦取消按钮；
- 关闭后通过保存的 trigger ref 和 `requestAnimationFrame` 归还焦点；
- 同时只允许一个确认请求；
- Host 卸载时以 `false` 结束未完成 Promise；
- 确认期间只禁用对话框命令，不修改应用根节点交互状态。

---

## 四、必须删除的错误实现

### 1. 登录与错误映射

1. 删除登录检查对完整 `load_publish_context()` 的依赖。
2. 删除登录测试对图片上传 uid/hash 的强制要求。
3. 删除“任意 Python 失败都映射为 Cookie 无效”的逻辑。
4. 删除 `is_login_page()` 对整页 `login`、`password`、中文“登录”的通用字符串组合匹配。
5. 删除单一相邻字段正则作为图片上传上下文唯一来源。
6. 删除 Renderer 中“所有失败都请更新 Cookie”的统一文案。

### 2. 原生确认框

删除以下设置流程的 `window.confirm()`/裸 `confirm()`：

- `HepanProviderSettings.tsx`：测试登录、清除 vendor、清除配置；
- `MediaProviderSettings.tsx`：测试连接、清除配置；
- `AiProviderSettings.tsx`：测试连接、清除配置；
- `SettingsOverview.tsx`：导入旧配置；
- `SettingsView.tsx`：工作区切换确认。

全部改用统一 Renderer 确认模块。不能保留 native confirm fallback。

### 3. 上一轮错误的 App 级补丁

删除 `App.tsx` 中为本缺陷加入的三层重复逻辑：

```text
changeView() 中 setConfirmation(null)
监听 currentView 的重复 useEffect
PreflightModal 的 currentView === 'workbench' 条件
```

这些修改处理的是付费媒体 Preflight 所有权，不能修复原生对话框后的 WebContents 焦点。Preflight 应移动到 `workbench` 视图所有者内部，依靠单一视图生命周期卸载，不再堆叠三个补丁。

### 4. 静态伪测试

删除 `tests/renderer-clear-platform-interaction.test.js` 当前“读取源码 + 正则匹配”的实现。不能保留并声称它覆盖交互冻结。

### 5. 错误的清除 timeout

删除 `HepanProviderSettings.clear()` 中局部 `Promise.race(...15 秒 timeout...)`。本地配置清除不是河畔网络检查，超时不能伪装成 `HEPAN_CHECK_RUNTIME_FAILED`。

如共享 IPC 确实需要超时，应由共享命令模块返回 `PLATFORM_CONFIG_TIMEOUT` 并取消计时器，不能在一个 Renderer 调用者里制造平台检查错误。

保留正确实现：局部 `busy`、`try/catch/finally`、清除后重新读取安全 status。

---

## 五、实施任务

### Task 0：先建立真实红色反馈回路

#### A. 登录页误判测试

新增脱敏最小 fixture：

```html
<script>window.loginHelper = true;</script>
<nav>登录</nav>
<div id="um"><strong class="vwmy"><a href="home.php?mod=space&uid=2093208">fixture-user</a></strong></div>
<form action="portal.php?mod=portalcp&ac=article&catid=121">
  <input name="formhash" value="fixture-formhash">
</form>
```

当前实现必须先稳定失败为 `HEPAN_AUTH_REDIRECTED`；修复后必须返回 `authenticated=true`、`publishAccess=true`。再增加真实 `member.php?mod=logging` + password input 反例，证明没有放过真实登录页。

#### B. 原生确认框焦点测试

Windows Electron 测试必须：

1. 启动全新窗口和临时 userData。
2. 打开蓝色河畔设置，使用 mock IPC，不访问真实河畔。
3. 接受当前原生 `window.confirm()`。
4. 等待命令完成，断言控件在 DOM 中非 disabled。
5. 使用真实窗口输入点击 input/select，断言 input 获得焦点、select 展开。
6. 当前实现必须在第 5 步稳定失败；最小化/恢复后成功，证明捕获的是同一缺陷。

#### C. 首次保存隔离测试

1. 每次启动全新窗口，测试前不得触发任何 confirm。
2. 输入合法 mock 配置，首次点击保存。
3. IPC 完成后立即真实点击 input/select。
4. 记录 BrowserWindow active/focused、`document.hasFocus()`、`document.activeElement` 和控件 disabled；不得记录表单值。

只有 C 也失败，才允许为无确认的保存增加通用焦点恢复。否则保存报告按 native confirm 遗留状态处理。

建议入口：

```powershell
node --test tests/hepan-login-check.test.js tests/renderer-settings-window-focus.electron.test.js
```

### Task 1：修复 Python 登录、栏目和账号提取

**Modify:**

- `src/platforms/hepan/hepan_publish.py`
- `tests/hepan-login-check.test.js`
- 必要的脱敏 fixture

**要求：**

- [ ] 重写结构化登录页判断。
- [ ] `check_authentication()` 不要求 formhash 或上传 token。
- [ ] `check_publish_access()` 独立判断栏目 formhash/权限提示。
- [ ] `check_upload_context()` 独立返回 `available/changed`。
- [ ] `load_publish_context()` 继续服务正式发布，但按身份、栏目、上传阶段分类失败。
- [ ] 账号优先取 `.vwmy`，不把“我的空间”当用户名。
- [ ] 账号缺失不影响认证成功。
- [ ] HTTP 重定向、状态码和 DOM 特征只转成安全分类，不输出响应正文。

### Task 2：修复 Node 适配器和设置契约

**Modify:**

- `desktop/services/platform-settings/hepan-settings-adapter.js`
- `desktop/services/platform-settings-service.js`
- `desktop/ipc/platform-settings-ipc.js`
- `src/platforms/hepan/runtime-paths.js`
- `tests/hepan-provider-settings.test.js`
- `tests/hepan-settings-patch-contract.test.js`

**要求：**

- [ ] 解析并保留 Python 的安全 `code/errorCode`、`warnings[]`、`stage`、capability flags 和合法 account。
- [ ] 只有真实认证失败映射 Cookie 错误。
- [ ] `authenticated=true`、`publishAccess=true`、`uploadContext=changed` 时设置测试整体成功，使用 `code=HEPAN_AUTH_OK` 和 `warnings=[HEPAN_UPLOAD_CONTEXT_CHANGED]`，不得保留失败 `errorCode`。
- [ ] Python 非零退出但 stdout 有合法安全 JSON 时优先使用其错误码。
- [ ] identity 二次校验，非法值丢弃而不覆盖认证。
- [ ] 测试与发布共享 Python、scriptPath、vendor、PYTHONPATH、站点和 Cookie 规范化。
- [ ] 临时 Cookie 在所有路径清理。
- [ ] 测试不得创建文章、订单、发布记录或远端提交。

### Task 3：显示账号、分阶段状态与北京时间

**Modify:**

- `media-workbench/src/types.ts`
- `media-workbench/src/components/settings/HepanProviderSettings.tsx`
- `tests/renderer-hepan-settings.test.js`

**要求：**

- [ ] 显示 Python、依赖、登录身份、栏目权限、上传兼容性。
- [ ] 成功后显示“登录账号：名称（UID）”。
- [ ] 新一轮测试开始或测试失败时不显示陈旧账号。
- [ ] 无账号节点时显示“登录有效，账号名称未识别”，不显示失败。
- [ ] 登录/栏目成功、上传变化时主状态为成功，上传单独警告。
- [ ] 栏目失败、页面变化、网络超时和 5xx 给出不同可执行提示。
- [ ] `testedAt` 按 `Asia/Shanghai` 或系统本地时区显示，例如 `2026-07-21 19:37:53（北京时间）`。
- [ ] 不显示 Cookie 长度、片段、HTML 或临时路径。

### Task 4：实现统一 Renderer 确认模块

**Create/Modify:**

- 新增 ConfirmationHost/confirmation 模块
- 在认证成功后的应用子树、`App` 上方安装一次 Host；不得安装在登录页外层
- 修改所有配置中心原生确认调用者
- 新增 `tests/renderer-confirmation-host.test.js`

**要求：**

- [ ] 设置相关 Renderer 源码不再出现 `window.confirm`/裸 `confirm`。
- [ ] 确认、取消、Escape、Host 卸载均结束 Promise。
- [ ] 关闭后焦点归还触发按钮；触发按钮消失时聚焦设置区标题。
- [ ] 同时只处理一个确认请求。
- [ ] 注销、授权终结或工作区应用子树卸载时，待确认请求以 `false` 结束且不残留 Portal。
- [ ] 不调用主进程 focus/restore 或自动最小化作为补丁。
- [ ] 不改变保存、测试、清除的业务 IPC 和错误契约。

### Task 5：删除错误补丁并恢复单一所有权

- 删除 App 三层 Preflight 补丁。
- 将付费媒体 Preflight 放到其功能视图所有者内部，离开视图自然卸载。
- 删除静态伪焦点测试，替换为真实交互测试。
- 删除局部清除 timeout，保留局部 busy/finally 和安全 status 回读。
- 删除旧登录泛化错误码、整页文本判断和上传 token 登录依赖。
- 删除修复过程中产生的重复 helper、兼容 fallback 和无调用代码。

### Task 6：Windows/Electron 回归与 alpha 验收

必须在与打包版相同的 Electron 主进程上执行，不接受纯 Vite/浏览器测试替代：

1. 全新启动，首次保存后立即操作 input/select。
2. 测试登录确认后，成功、失败、超时三种结果均立即可操作。
3. 清除配置确认后立即可操作，不最小化、不切页。
4. 取消测试/清除后立即可操作。
5. 连续执行测试 -> 保存 -> 测试 -> 清除，焦点每次正确归还。
6. AI、付费媒体、旧配置导入和工作区切换确认同样不冻结。
7. 验证导航、普通按钮、input 和 select，排除只修某一种控件。
8. 验证不存在残留原生 `AutoPublish` confirm 子窗口。
9. 当前 Cookie 显示正确账号名称/UID，换号后不保留旧 identity。

---

## 六、验证命令

### 模块与合同

```powershell
node --test tests/hepan-login-check.test.js tests/hepan-provider-settings.test.js tests/hepan-settings-patch-contract.test.js tests/renderer-hepan-settings.test.js
node --test tests/renderer-confirmation-host.test.js tests/renderer-settings-window-focus.electron.test.js
```

### Python、类型和全量

```powershell
python src/platforms/hepan/hepan_publish.py --help
python -c "import requests; import bs4"
npm run typecheck:renderer
npm test
npm run verify
```

### Alpha

```powershell
npm run pack:alpha:dirty
```

打包后必须再次运行 Windows 焦点测试，不能只验证开发模式。

---

## 七、手工验收

1. 使用当前 Cookie 测试，不重新保存 Cookie。
2. 显示“登录有效、栏目 121 可发文、登录账号：yoyo逛吃（UID 2093208）”。
3. 允许单独显示图片上传结构变化警告，但不得提示更新 Cookie。
4. 使用明显无效的测试 Cookie，必须明确提示身份失败。
5. 修改为错误栏目 ID，必须提示栏目权限/栏目 ID，不得提示 Cookie 失败。
6. 断网和 5xx 分别提示网络问题，恢复后可重试。
7. 测试时间显示北京时间/本地时间，改变系统时区不改变认证结果。
8. 保存、测试、清除完成后立即点击 Python input、Cookie input、发布间隔 select 和左侧导航，全部正常。
9. 取消确认或按 Escape 后同样正常，焦点返回原触发按钮。
10. 不得通过最小化、恢复、刷新、切换页面或重启来恢复交互。
11. 测试全过程不创建文章、订单、发布记录或远端文章。
12. 日志、IPC、测试 fixture 和计划中不出现 Cookie、完整 HTML 或敏感响应。

---

## 八、完成标准

- [ ] 当前 Cookie 不再因通用 `login`/“登录”文字或上传参数缺失被误报无效。
- [ ] 登录、栏目、上传和网络故障具有独立结果。
- [ ] 登录成功显示安全账号名称和 UID；提取失败不覆盖认证成功。
- [ ] 保存、测试、清除后所有页面立即可操作，不需要最小化或重启。
- [ ] 配置相关 Renderer 不再使用原生 `window.confirm()`。
- [ ] App 三层 Portal 补丁、局部清除 timeout、静态伪测试和泛化 Cookie 错误逻辑已删除。
- [ ] 登录假失败和 Electron 焦点冻结均有修复前红、修复后绿的真实回归测试。
- [ ] 首次保存隔离场景已验证并按结果处理，没有凭猜测增加全局 focus 补丁。
- [ ] Cookie、完整 HTML、请求头、临时路径和敏感响应不进入日志、IPC、fixture 或计划。
- [ ] 模块测试、类型检查、全量测试、verify 和 alpha 打包验收全部通过。
