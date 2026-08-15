# Thread 6 — 列举网 HTTP 内容/图片传输只读探索

日期：2026-08-14

## 范围

- 仅记录列举网当前投稿页的 HTTP 传输形态；不修改 production code，不新增 HTTP adapter，不上传图片，不提交文章。
- 使用当前已登录的 Playwright 会话只读打开投稿页并检查 DOM、表单属性和页面内联脚本。
- 本记录不改变 Issue 19 的 `deferred-until-core-complete` 状态，也不把探索结论视为真实带图能力验收。

## 已观察到的事实

投稿页：`https://post.lieju.com/117/239`

- 页面存在一个普通 HTML form：
  - `method=POST`
  - `enctype=multipart/form-data`
  - action origin 为 `https://post.lieju.com`
  - action path 为 `/117/239`
  - action 参数 `action=postnew`
- 正文与账号资料字段直接位于该 form：
  - `postdb[title]`
  - `postdb[content]`
  - `postdb[zone_id]`
  - `postdb[mobphone]`
  - `postdb[linkman]`
- 当前初始页面存在一个文件槽位：
  - 文件字段：`local_file1`，DOM id 为 `in_url1`
  - 隐藏字段：`photodb[1]`、`piddb[1]`、`ftype[1]`
  - 另有 `fid`、`top_photo`、`qxlriwz` 等隐藏字段，实际值未记录。
- 页面内联 `preview(file, m)` 逻辑使用 `FileReader.readAsDataURL()` 做本地预览，并校验 jpg/gif/png 与 1 MB 大小上限。
- 对当前页面内联脚本做了有界检查：未观察到 `fetch`、`XMLHttpRequest`、`FormData`、`$.ajax` 或 `$.post` 形式的独立图片上传调用；因此当前证据更像“图片与正文一起走 multipart form POST”，而不是先调用独立图片上传 API。
- 页面脚本会按 `totalnum` 动态生成 `local_fileN` / `photodb[N]` 等字段；可动态槽位数量、服务端实际图片数量限制尚未确认。

## 初步传输方案（仅记录，不实施）

若后续授权验证 HTTP 路径，候选流程是：

1. 使用同一账号 Session GET 投稿页，保留 Cookie、隐藏字段和当前 form action。
2. 以 multipart/form-data 一次提交标题、正文、城市、联系人、电话、隐藏字段和图片二进制。
3. 严格绑定固定 HTTPS origin/路径，禁止跟随未知重定向。
4. 解析响应中的明确成功、明确拒绝、登录失效、验证码/风控和不确定结果；提交请求已经发出但响应无法确认时不得自动重试。

## 结论与未决事实

当前结论：`INCONCLUSIVE`，不能宣称 HTTP 内容或图片传输已支持。

尚未证明：

- 直接 multipart POST 是否被服务端接受；
- `photodb[N]` 是必须为空、必须填 URL，还是仅用于已有图片；
- 多图片槽位的真实数量上限与正文中的落图位置；
- 响应成功信号、发布详情 URL/ID、登录失效和风控页面的稳定分类；
- HTTP 直传是否会绕过当前浏览器会话所处理的验证码、WAF 或其他页面状态。

## 后续授权门槛

- 需要单独的真实能力探索授权和专用测试文章/图片；不能使用本次普通平台验收文章直接试投。
- 探索期间仍不得把超时、断线或无明确响应当作失败后重试。
- 只有取得可重复的真实成功/失败证据后，才能由 Issue 19 决定 `SUPPORTED`、`UNSUPPORTED` 或继续 `INCONCLUSIVE`；本记录不触发 Issue 19 实施。

## 2026-08-15 授权后真实图文探索

### 授权和边界

- 用户对列举网真实登录、填写东爵专用测试文章 / 图片和一次真实发布分别明确授权。
- 未勾选付费推广，每个可见外部副作用均在 action-time 确认后执行；只发送一次 POST，未重试。
- 客户联系方式、Cookie、隐藏 token 和 state 原文未记录。

### 真实发布证据

- 客户：东爵。
- 标题：《河南幼教户外游乐设施与遮阳设备选购指南》。
- 客户档案城市为焦作；城市目录对应投稿路径 `/116/239`，二级区域最后一个非空项为“其他”，value `1019`。
- 提交前表单证据：标题 19 字，正文 2211 字，一张 JPEG 图片 201,723 bytes，预览 Data URL 已生成，付费推广未勾选。
- 提交后同一导航返回明确“发布成功！”及详情链接，无验证码、无明确拒绝、无超时或不确定状态。
- remote ID：`104776353`。
- remote URL：`https://jz.lieju.com/qitashenghuofuwu/104776353.html`。
- 图片已转存到 `image.lieju.com/upload/fenlei/...`，公开页实际显示尺寸 620×348；图片位于正文外 `.pic` 图集容器，不嵌入 `#box` 正文容器。
- 公开页默认只显示部分正文并提供“显示全部描述”；展开后正文恰为 2211 字，五个章节和结尾均存在，不是平台截断。
- 列举网不解析 Markdown，正文中 `**...**` 在公开页原样可见。
- 页面脚本明确 `limitnum=4`，当前账号最多 4 个文件槽；单图小于 1 MB，支持 jpg/gif/png。

### 城市与区域规则确认

- 客户城市不是 `postdb[zone_id]`。城市 ID 位于 `https://post.lieju.com/{cityId}/239`；`postdb[zone_id]` 是城市下的二级区域。
- 产品规则由用户确认为：客户城市去除首尾空格后，按城市链接 DOM 顺序做现有 `hasText` 语义的模糊匹配，取第一个匹配；无匹配回退北京。
- 每个目标城市的二级区域均选最后一个非空 option；不按“其他”文本建立特例。北京页的最后一项为“北京周边”，value `6`，与既有 Playwright 实际行为一致。
- HTTP 和 Playwright 必须消费同一份已冻结城市 / 区域决策；不得在两条 transport 中分别复制规则。

## 2026-08-15 无浏览器、无发布副作用验证

### 方法

- 使用 AutoPublish 本地运行状态中已保存的列举网 `storageState`，不读取或导出 Codex 内置浏览器 Cookie。
- 使用 Playwright 独立 `APIRequestContext`，未启动 Chromium。
- 仅执行三次 GET：会员页、`city.php?post=239` 城市目录、解析后的焦作投稿页。未 POST、未上传、未保存请求后 state。

### 结果

- 会员页 HTTP 200，已登录标志成功；证明应用专用 Session 可以在无浏览器进程下被独立 HTTP context 消费。
- 城市目录 HTTP 200，解析到 348 个投稿城市链接；“焦作”模糊匹配为 `/116/239`，HTTPS origin/path 校验通过。
- 焦作投稿页 HTTP 200，已登录表单成功；`POST multipart/form-data`，action `/116/239?action=postnew`，标题 / 正文 / 联系人 / 电话 / `local_file1` 和隐藏字段均存在，最后非空区域为“其他”=`1019`。
- 页面当前是 GBK；首次按 UTF-8 解码时中文城市和登录标志无法识别，按响应 charset 改为 GBK 后全部通过。
- 临时 regex 探针会把 `<script>` 内 `local_file'+totalnum+'` / `ftype['+totalnum+']` 模板误认为真实 control；正式实现必须使用结构化 HTML parser 并限定真实 form controls。

## 2026-08-15 Markdown 表示分析

- 已确认不能为列举网修改文章库 Markdown / JSON 原文；这会越过 content owner，并使其他投稿目标丢失 Markdown 语义。
- 列举网不解析 Markdown，也没有真实证据证明其正文字段安全支持 HTML；因此不应尝试 Markdown→HTML 提交。
- 推荐在列举网 adapter `prepare` 阶段生成一次性纯文本表示：去除 Markdown 展示符号，保留可见文字、段落、标题文字、编号和列表可读性；不使用 AI 重写，不写回文章库。
- 仓库已有 `src/core/article-text.js#markdownToPlainText`。对本次东爵文章的纯内存校验中：2211 字原文转为 2151 字纯文本，30 个 `**` 标记消失，段落数、五个章节、五个编号问题和末尾均保留。验证未修改文章文件。
- 上述结果只证明当前文章使用的强调 / 段落结构可安全转换。现有 helper 对 Markdown 图片、列表、表格、引用、代码块和 HTML 仍需平台专项测试；特别不得把 Markdown 图片的本地路径或 URL 转成远端正文。
- 准备证据必须记录实际纯文本 body 及其 fingerprint，不能记录 Markdown 原文却提交另一份内容。

## 当前结论（更新）

- 列举网真实 multipart 图文投稿能力：`SUPPORTED`。
- 无浏览器独立 HTTP Session 的认证 GET、城市解析和表单准备：`SUPPORTED`。
- 独立 `APIRequestContext` 真实 multipart POST：尚未验收；只能在 Issue 19 实施后、获得新的当次真实发布授权后执行一次。
- 本 evidence 满足 Issue 19 未来调度所需的列举网真实能力探索条件，但不豁免 Wave 12 `COMPLETE` 和当前 Wave Plan 的调度 gate，也不授权 production 实施、commit、merge 或后续真实发布。
