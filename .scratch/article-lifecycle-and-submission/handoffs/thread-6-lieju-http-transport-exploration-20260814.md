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
