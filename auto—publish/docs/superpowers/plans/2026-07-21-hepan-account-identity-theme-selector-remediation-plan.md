# AutoPublish 蓝色河畔账号名称未识别修复计划

## 一、结论与复现证据

蓝色河畔登录、栏目权限和配置界面均已正常，当前缺陷只发生在 Python 的账号身份提取阶段。

使用当前已授权 Cookie 对栏目 121 做只读检查，连续 3 次均得到：

```text
ok=true
authenticated=true
publishAccess=true
code=HEPAN_AUTH_OK
account=missing
```

同一响应中实际存在明确的账号节点：

```html
<div id="toptb">
  <strong class="yonghuming">
    <a href="home.php?mod=space&amp;uid=987654321">fixture-user</a>
  </strong>
</div>
```

页面中同时存在指向同一 UID 的头像空链接和“我的空间”导航链接。当前 `extract_account_identity()` 仅识别旧 Discuz 结构 `#um .vwmy a[href*='uid=']`，真实页面没有 `#um` 或 `.vwmy`，所以账号节点在选择器阶段即被排除。

已用真实响应建立红色反馈回路：当前提取器对已认证页面返回 `None`，而受限选择器 `#toptb .yonghuming a[href*='uid=']` 能得到账号名称及数字 UID。响应编码和推测编码均为 UTF-8，因此不是时区、字符集、Node DTO 或 Renderer 显示问题。

## 二、修复边界

本次只修复蓝色河畔账号身份识别，并补齐真实主题结构的回归测试。

不修改：

- Cookie 登录和栏目权限判定；
- 图片上传上下文判定；
- Node 成功/失败 DTO 规则；
- 配置保存、确认对话框和焦点修复；
- 文章发布、队列、客户资料或本地工作区数据；
- 服务端或远端任何写操作。

账号名称仍是可选诊断信息。提取失败只能显示“登录有效，账号名称未识别”，不得把成功登录改判为失败。

## 三、设计要求

### 1. 使用受信账号容器，不扫描任意 UID 链接

在 `src/platforms/hepan/hepan_publish.py` 中集中定义账号容器选择器，按明确程度排序：

```python
ACCOUNT_IDENTITY_SELECTORS = (
    "#um .vwmy a[href*='uid=']",
    ".vwmy a[href*='uid=']",
    "#toptb .yonghuming a[href*='uid=']",
    ".yonghuming a[href*='uid=']",
)
```

保留旧 Discuz 主题兼容，同时支持当前河畔桌面主题。禁止增加以下宽泛 fallback：

- 页面中第一个 `home.php?mod=space&uid=` 链接；
- 头像空文本链接；
- “我的空间”“我的主页”“设置”或“退出”等导航链接；
- 正则扫描整页 HTML 猜测名称；
- 从 Cookie、上传 uid/hash 或页面标题推导账号名。

### 2. 身份字段继续独立校验

复用一个内部候选解析函数，对每个受信容器执行：

- 名称使用节点可见文本，去除首尾空白和 Unicode 控制字符；
- 名称长度为 1-80 个 Unicode 字符；
- UID 只从链接查询参数 `uid` 读取；
- UID 必须为 1-20 位十进制数字；
- 单个候选无效时继续检查下一受信容器；
- 所有候选无效时返回 `None`，不影响认证结果。

不要把账号提取和 `is_login_page()`、formhash 或上传参数重新耦合。

### 3. 不增加额外网络请求

当前栏目响应已经包含账号节点。账号识别必须继续在同一个只读响应内完成，不额外请求首页、个人空间或账号接口，避免增加延迟、负载和新的失败点。

### 4. 现有 Node 与 Renderer 契约保持不变

`desktop/services/platform-settings/hepan-settings-adapter.js` 的 `safeAccount()` 已能接受合法 `{ displayName, uid }`，并会在账号无效时仅丢弃账号字段。

`media-workbench/src/components/settings/HepanProviderSettings.tsx` 已能在 `lastTest.account` 存在时显示“登录账号：名称（UID）”。本次不增加兼容字段、第二套用户名状态或 UI 侧 HTML 解析。

## 四、实施任务

### Task 0：把真实缺陷固化为红色测试

**Modify:**

- `tests/hepan-login-check.test.js`

新增脱敏的当前主题 fixture，至少包含：

- `#toptb strong.yonghuming > a` 中的 `fixture-user`；
- 合成的合法 `uid=987654321`；
- 同 UID 的头像空链接；
- 同 UID 的“我的空间”导航链接；
- 有效栏目 formhash。

修复前必须稳定断言失败于：

```python
assert result["account"] == {"displayName": "fixture-user", "uid": "987654321"}
```

测试不能访问真实网络，也不能包含真实 Cookie、真实账号名称或完整线上 HTML。

### Task 1：扩展结构化账号提取器

**Modify:**

- `src/platforms/hepan/hepan_publish.py`

要求：

- [ ] 增加当前主题的 `.yonghuming` 受限选择器。
- [ ] 保留 `.vwmy` 旧主题兼容。
- [ ] 将候选解析和校验集中在一个内部 helper，避免每个主题复制逻辑。
- [ ] 当前主题优先返回真实账号文本，不返回头像空文本或“我的空间”。
- [ ] 相对 URL 和绝对 URL 中的标准 `uid` 查询参数均可解析。
- [ ] 账号缺失或非法时仍返回认证与栏目成功。
- [ ] 不输出页面正文、Cookie、请求头或原始账号节点到日志。

### Task 2：补齐反例和跨层契约测试

**Modify:**

- `tests/hepan-login-check.test.js`
- `tests/hepan-provider-settings.test.js`（仅在现有覆盖不足时）
- `tests/renderer-hepan-settings.test.js`（仅在现有覆盖不足时）

Python 测试至少覆盖：

1. 当前 `.yonghuming` 主题成功提取名称和 UID。
2. 旧 `.vwmy` 主题继续成功。
3. 页面只有头像空链接和“我的空间”时返回 `None`。
4. `.yonghuming` 名称为空、超长、含控制字符或 UID 非数字时不返回非法 identity。
5. 同页出现多个普通空间链接时不会误选。
6. 账号无法识别时 `authenticated=true`、`publishAccess=true` 和 `HEPAN_AUTH_OK` 保持不变。

Node/Renderer 已有测试应继续证明：

- Python 返回合法 `account` 后，Node 保留安全字段；
- 成功 DTO 不携带失败 `errorCode`；
- UI 显示名称和 UID；
- 缺少 `account` 时只显示“账号名称未识别”。

不要新增读取源码后用正则判断选择器存在的伪测试；测试必须执行真实解析函数或跨层 DTO 行为。

### Task 3：删除错误假设和重复实现

- 删除“线上页面一定使用 `#um .vwmy`”这一测试假设，fixture 必须同时覆盖旧主题和当前主题。
- 不保留另一个独立用户名解析器、UI fallback 或 Node 侧页面解析。
- 如果实施中产生临时网络诊断脚本、响应快照或调试日志，验收前全部删除。
- 不把真实页面 HTML、真实用户名、UID 或 Cookie 写入仓库 fixture。

## 五、验证命令

### 聚焦回归

```powershell
node --test tests/hepan-login-check.test.js tests/hepan-provider-settings.test.js tests/renderer-hepan-settings.test.js
```

### 类型与全量验证

```powershell
python src/platforms/hepan/hepan_publish.py --help
npm run typecheck:renderer
npm test
npm run verify
```

### 打包版验收

```powershell
npm run pack:alpha:dirty
```

打包后从 `release-alpha/win-unpacked/AutoPublish.exe` 启动验证，不接受只验证源码或开发模式。

## 六、手工验收

1. 保持当前已保存 Cookie，不重新录入。
2. 点击“测试登录”，仍显示登录有效、栏目 121 可发文。
3. 同一结果中显示正确的“登录账号：名称（UID）”，不再显示“账号名称未识别”。
4. 连续测试 3 次，账号信息稳定且没有旧值闪回。
5. 换用另一个有效账号后显示新账号，不保留上一次 identity。
6. 使用有效但页面没有受信账号节点的脱敏 fixture，仍判定登录成功并显示“账号名称未识别”。
7. 使用明显无效 Cookie，仍按认证失败处理，不能因账号提取逻辑而误判成功。
8. 测试过程不创建远端文章、上传图片、写发布记录或修改本地文章。
9. 日志、IPC、测试输出和仓库文件中不出现 Cookie 或完整响应 HTML。

## 七、完成标准

- [ ] 当前河畔桌面主题的账号名称和 UID 能从同一栏目响应中识别。
- [ ] 旧 `.vwmy` 主题仍兼容。
- [ ] 头像和导航空间链接不会被误认为账号名。
- [ ] 账号识别失败不改变登录与栏目结论。
- [ ] 没有新增网络请求、远端写操作或跨层兼容字段。
- [ ] 真实主题 fixture 修复前红、修复后绿。
- [ ] 聚焦测试、类型检查、全量测试、verify 和 alpha 打包验收通过。
- [ ] 临时诊断物、重复 helper 和调试日志已清理。
