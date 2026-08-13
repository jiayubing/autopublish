# 18-B — 队列组图片数量应用面与 UI 接线

**Goal:** 在不碰图片文件和平台上传的前提下，把 18-A 的 `imageCount` 通过 application → typed IPC/bridge/types → Renderer 队列组配置面完整接通。

**Blocked by:** 18-A `COMPLETE`。

## 本线程职责

1. `regular-queue-application` 接受/校验 `queueConfig.imageCount`，新 group 缺省使用 store 默认，已有 group 保持已持久化值。
2. 增加明确的“修改队列组图片数量”应用命令，调用 18-A 唯一 transition；不得通过 start/pause 或重新 admission 偷改配置。
3. typed IPC / preload bridge / renderer types 暴露最小字段与命令。
4. 建立/复用一个由平台 adapter 明确声明的图片发布 capability，默认 fail-closed 为不支持；19–21 只有在各自实现完成后才能把对应平台声明为支持。
5. Renderer 仅在目标平台 capability 明确为支持时显示 `imageCount` 编辑入口；不支持/未知时入口保持隐藏或禁用，不宣称图片可用。可读 queue snapshot 仍可携带持久 `imageCount` 供内部一致性验证。
6. 可见时允许用户明确修改 0–5；旧组从 0 改为非 0 必须经过该显式用户命令/确认，不得因默认值、页面加载或追加文章自动改变。
7. 不展示具体图片、不逐篇选择图片。
8. 增加 application、IPC contract、bridge/typecheck、Renderer capability-hidden/禁用态/修改态测试。

## Owner / 允许修改

- `desktop/services/regular-queue-application.js` 及直接 queue-group application service
- `desktop/ipc/contracts/submission-regular-contracts.js`、对应 IPC binding
- preload/bridge/types 中该 capability 的最小映射
- `media-workbench` regular queue feature/component 的配置展示与交互
- 对应 application/IPC/Renderer tests

## 禁止跨界

- 不改 OperationalStore schema/internal SQL；只消费 18-A transition。
- 不扫描客户目录、不调用 `ClientImageLibrary`。
- 不修改 preparation port、platform adapter、DOM/Python 上传。
- 不增加“重试图片/换图/降级纯文本”按钮或逐篇 image picker。
- 不根据错误文本推导平台 capability。

## Acceptance criteria

- [ ] admission / queue config 只接受 `imageCount` 0–5；extra field 和非法值失败关闭。
- [ ] 新组默认值与 18-A 一致，旧组升级后的 0 不被 application/Renderer 自动改成 1。
- [ ] 已有 group 的修改通过唯一具名命令持久化；旧组从 0 启用图片只能由明确用户操作触发，重新读取/重启后 UI 显示一致。
- [ ] 追加文章继承已有 group 配置，无需逐篇配置。
- [ ] IPC/bridge/renderer snapshot 不包含图片路径、图片二进制或选中图片列表。
- [ ] 平台 capability 未明确支持时图片入口不出现在生产 UI；19–21 后续只能通过唯一 capability 声明开启，不在 Renderer 维护平台白名单。
- [ ] Renderer 测试覆盖 capability 未启用时入口 absence、启用后的 0/1/5、非法输入、busy/失败反馈和窄宽布局。
- [ ] typecheck/lint/相关 IPC contract tests PASS，handoff 记录 capability surface 与依赖方向。

## Stop / return conditions

若现有平台 capability surface 完全无法表达“配置已保存但图片上传未启用”，只报告最小缺口；不得在 Renderer 自建平台支持列表作为第二真源。
