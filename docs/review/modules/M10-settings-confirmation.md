# M10 设置与确认深审

> 深度审查状态：已完成（全部设置/确认生产文件、直接 bridge/IPC 契约与相关测试已检查）。

## 模块职责和边界

`SettingsView` 组合 AI、媒体、河畔、工作区、运行环境和存储设置；provider settings 只提交脱敏状态与用户输入的秘密；`ConfirmationHost` 提供统一 portal、焦点、Tab 循环和 Escape。

## 已检查范围与关键调用链

检查 `SettingsView.tsx`、`AiProviderSettings.tsx`、`components/settings/{SettingsNavigation,SettingsOverview,MediaProviderSettings,HepanProviderSettings}.tsx`、`ConfirmationHost.tsx`、`confirmation.tsx`、settings/workspace bridge/preload 及 renderer settings/focus tests。

## 发现列表

### TEMP-M10-1：浏览器自检成功后 checking 状态永不清除

- 分类：生命周期/错误处理
- 所属模块：M10
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`components/SettingsView.tsx:37-43`
- 问题描述：`check()` 成功路径执行 `runBrowserSelfCheck()` 和 `load()`，没有 `setChecking(false)`；只有 catch 路径清除 checking。
- 触发条件：运行环境页点击“运行浏览器自检”并且自检成功。
- 可达路径或调用链：点击按钮 → `setChecking(true)` → self-check 成功 → `load()` 完成 → checking 仍 true，按钮继续 disabled、文案保持“检查中…”。
- 实际影响：成功后无法再次自检，UI 永久显示进行中，除非离开并重新进入设置页。
- 现有测试是否覆盖：settings contract 只做源码契约断言，未覆盖成功后状态收敛。
- 验证方法与结果：静态控制流确认；成功分支无 finally/setChecking(false)。
- 修复方向：使用 finally 清除 checking，并区分 load 的 loading 状态。

## 测试情况

- `node --test tests/renderer-settings.test.js tests/renderer-confirmation-host.test.js tests/renderer-settings-window-focus.electron.test.js`：前两组通过；Electron focus 测试依赖已构建 renderer，未在本次执行。
- `npm --prefix media-workbench run lint`：通过。

## 未覆盖区域

未执行真实 Electron 设置窗口自检成功/失败交互；未现场检查 provider 配置并发刷新。

## 模块审查结论

统一 ConfirmationHost 的焦点、Tab、Escape 和秘密遮罩设计通过静态与契约检查；运行环境自检成功态存在明确生命周期缺陷。M10 深审已完成，结论为部分通过。
