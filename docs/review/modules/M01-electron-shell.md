# M01 Electron 壳与导航安全深审

> 深度审查状态：已完成。

## 模块职责和边界

负责 Electron 窗口创建、renderer 导航/新窗口/权限边界、应用启动、重启和退出期间的运行时销毁；认证和内容业务由下层运行时拥有。

## 已检查的目录与关键文件

- `auto—publish/desktop/main.js`、`desktop/security/navigation.js`、`desktop/application-identity.js`、`desktop/services/authenticated-runtime.js`。
- `media-workbench/index.html` 的 CSP，及 `electron-security.test.js`、`desktop-packaging.test.js`、`authenticated-runtime.test.js`。

## 关键调用链

`app.whenReady` → `initializeAuth` → `createMainWindow`；认证成功 → `activateAuthenticatedRuntime` → M03/M04；`before-quit` → 共享 `quitPromise` → `disposeRuntime` → `app.quit`。renderer 只允许精确的本地 `index.html` 导航，新窗口请求被拒绝，仅 allowlist 外链交给系统浏览器。

## 发现列表

本模块未发现满足证据门槛的独立缺陷。HTTP 外链兼容面只允许三个固定主机，仓库内没有可证明的攻击者可控调用路径，未作为 finding。

## 测试情况

- 定向 Electron/退出/打包测试纳入本轮 147 项验证，全部通过。
- CSP、sandbox、context isolation、navigation 和并发退出均有自动化契约。

## 未覆盖区域

未在真实签名安装包中执行外链与 OS 权限现场测试；未执行 macOS 生命周期（产品目标为 Windows）。

## 待验证问题

生产签名和 Windows SmartScreen/ACL 仍属于 M30 的现场缺口。

## 模块审查结论

职责边界、失败关闭和退出幂等符合当前产品风险；M01 深审已完成，结论为通过。
