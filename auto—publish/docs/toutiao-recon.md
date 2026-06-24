# 今日头条（头条号作者后台）平台勘探说明

> 状态：Stage 1 平台勘探完成，含真实成功提交验证。
> 目标平台：今日头条头条号作者后台（mp.toutiao.com），发文类型聚焦"图文"。
> Session 方案：per-platform 独立 session（`toutiao`），独立 profile/daemon/state，登录态已保存至 `work/playwright-cli/state/toutiao.json`。

## 平台基本信息

- 平台名称：今日头条 / 头条号作者后台
- 站点根：`https://mp.toutiao.com`
- 平台 id（本项目）：`toutiao`
- scanDir（本项目）：`toutiao`

## 登录勘探（已验证）

- 登录页 URL：`https://mp.toutiao.com`（未登录时直接进入登录面板）
- 登录方式：手机号+短信验证码（"验证码登录"）或 扫码登录（"扫码登录"）
- 登录页关键元素：
  - 手机号输入框：`textbox "请输入手机号"`
  - 国家/地区下拉：`combobox "国家/地区"` 默认 `+86`
  - 获取验证码按钮：`button "获取验证码"`
  - 验证码输入框：`textbox "请输入验证码"`
  - 协议勾选框：`checkbox "协议勾选框"`
  - 登录按钮：`button "登录"`
- 登录成功标志（已验证）：
  - URL 跳转至 `https://mp.toutiao.com/profile_v4/index`
  - 页面标题 `头条号`
  - 顶部出现账号名、"在头条创作的第 N 天"、"消息 N"
- 短信验证：是（验证码登录）；扫码登录无短信
- 风控/滑块：登录过程未遇到

## 发文流程勘探（已验证）

- 发文页 URL：`https://mp.toutiao.com/profile_v4/graphic/publish`
- 发文入口：作者后台左侧"创作 → 文章"链接 `/profile_v4/graphic/publish`
- 页面标题：`头条号`

### 标题字段

- 元素：`<textarea autocomplete="off" placeholder="请输入文章标题（2～30个字）">`
- 选择器：`textarea[placeholder*="文章标题"]`
- 填写方式：`locator.fill(text)`（已验证）
- 约束：2～30 个字，填写后显示"N / 30"

### 正文字段

- 元素：`<div class="ProseMirror" contenteditable="true">`（富文本编辑器）
- 选择器：`div.ProseMirror`
- 填写方式：`click()` 后 `page.keyboard.type(text)`（已验证；`fill` 不适用）
- 占位文本："请输入正文"
- 字数统计：底部"共 N 字"

### 右侧必填字段

1. **展示封面**（必填 `*`）
   - 选项：单图 / 三图 / 无封面
   - 选择器：`getByText('无封面', { exact: true })`（已验证可点）
   - 默认策略：选"无封面"绕过图片上传
2. **投放广告**（必填 `*`）
   - 选项：投放广告赚收益 / 不投放广告
   - 选择器：`getByText('不投放广告', { exact: true })`（已验证可点）
   - 默认策略：选"不投放广告"

### 右侧可选字段（本期不处理）

- 添加位置（标记城市）、声明首发（头条首发）、合集、同时发布微头条、作品声明（取材网络/引用站内/个人观点/引用AI/虚构演绎/投资观点/健康医疗）

### 底部按钮区

- `button "预览"`
- `button "定时发布"`
- `button "预览并发布"` — 主发布按钮，`getByRole('button', { name: '预览并发布' })`

## 发布提交流程（关键，已验证为 3 步）

1. 点击"预览并发布"（`getByRole('button', { name: '预览并发布' })`）
2. 弹出确认弹窗 `div.byte-modal`（420×180），内容"提示 该文章选择了'不投放广告'，将不会产生广告收益。 取消 确定"，点击弹窗内"确定"（`modal.locator('text=确定')`，实际是 `button.byte-btn-primary`）
3. 进入预览状态，"预览并发布"按钮变为 **"确认发布"**（`getByRole('button', { name: '确认发布' })`），点击后真正提交

## 成功页面/成功提示（已验证）

- **成功标志**：点击"确认发布"后，页面跳转至文章列表页 `https://mp.toutiao.com/profile_v4/graphic/articles`，即代表发布成功。列表中对应文章显示"已发布/已推送"状态。
- 注意：`/profile_v4/graphic/preview?pgc_id=<数字>` 只在手动点开某篇已发布文章时出现，**不是提交后自动跳转的目标**，不能用作提交成功判定。
- 没有显式"发布成功"toast，提交后 URL 跳转到 `/profile_v4/graphic/articles` 是最可靠判定。
- adapter 成功判定：点"确认发布"后轮询检测 `page.url()` 是否匹配 `/profile_v4/graphic/articles(?:[/?#]|$)/`，匹配即 `succeeded`。
- 另一可靠佐证：成功后文章列表页对应条目带"已发布"状态及 `toutiao.com/item/<id>` 链接。

## 已知坑点

- **"请完善账号信息"是误导性提示**：页面顶部"请完善账号信息，解锁发布文章、视频等权益功能"+ "立即完善"按钮会一直存在，但**不影响真实发布**（已验证文章可正常发布）。adapter 不能把它当作失败或 needs_login 信号。
- **AI 助手抽屉遮罩**：右侧"头条创作助手"抽屉的 `div.byte-drawer-mask` 会拦截正文编辑器点击。首次进入发文页时遮罩可能可见，需等待其自动消失（实测数秒后 w=0/h=0）或点击遮罩关闭。adapter 应在正文填写前检测遮罩可见性。
- **标题是 textarea 不是 input**：选择器勿用 `input[placeholder*=...]`。
- **正文是富文本**：不能用 `fill`，需 `click` + `keyboard.type`。
- **发布是 3 步**：预览并发布 → 弹窗确定 → 确认发布，不是一次点击。

## 是否需要图片上传

- 封面：可选"无封面"绕过，本期不实现图片上传。
- 正文内图片：富文本支持，本期不实现（纯文本正文）。

## 是否需要分类/地区/标签/商家字段

- 分类：无显式分类必填
- 地区：可选"添加位置/标记城市"，本期不处理
- 标签/话题：无强制标签字段
- 商家字段：无

## Sidecar 字段预期

头条号图文发布所需平台特有字段（走 Article Metadata Sidecar，不回塞共享文件名模型）：
- `coverMode`（封面模式：`none`/`single`/`triple`，默认 `none`）
- `adEnabled`（是否投放广告：布尔，默认 `false`）
- 未来可扩展：`coverImage`、`location`、`originalFirst`、`tags`

本期 adapter 默认 `coverMode=none`、`adEnabled=false`。
