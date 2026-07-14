# AutoPublish 工作区选择与切换设计

## 目标

取消打包版固定使用 `%USERPROFILE%\Documents\AutoPublish` 的行为。首次启动时由用户在桌面端选择工作区；之后可在配置中心重新选择，校验成功后自动重启并从新位置加载全部业务数据。

工作区切换只改变当前路径，不复制、不移动、不删除原工作区数据，也不维护最近使用列表。

## 范围

第一版包含：

- 首次启动强制选择工作区。
- 取消系统目录选择器后留在欢迎界面。
- 空目录直接初始化。
- 非空普通目录二次确认后初始化。
- 已有 AutoPublish 工作区直接使用。
- 配置中心显示、打开和更换当前工作区。
- 更换成功后自动重启应用。
- 当前路径丢失、不可写或标记损坏时重新进入欢迎界面。
- `AUTO_PUBLISH_WORKSPACE` 环境变量作为管理员显式覆盖。

第一版不包含：

- 复制或迁移当前工作区数据。
- 删除、清理或归档旧工作区。
- 最近工作区列表。
- 不重启的热切换。
- 云同步或多用户共享锁。

## 核心决策

工作区选择发生在业务服务初始化之前。主进程先判断工作区是否 ready；只有 ready 时才创建 runtime、完整业务 IPC、投稿服务、AI 内容服务、豆包采集服务和日志订阅。

首次选择和配置中心切换使用同一个主进程目录选择与校验服务。选择结果通过 Electron 原生目录选择器产生，Renderer 不能把任意绝对路径直接设置为工作区。

选择或切换成功后不在当前进程中热加载，而是保存路径并调用 `app.relaunch()`。新进程从保存的路径重新初始化全部模块。

## 路径配置存储

当前路径配置存放在 Electron `app.getPath("userData")` 下：

```text
<electron-user-data>/workspace-location.json
```

文件内容：

```json
{
  "version": 1,
  "workspacePath": "D:\\AutoPublishData"
}
```

该文件不属于业务工作区，不进入安装包，不保存在应用安装目录，也不包含账号、API Key、客户名称或最近路径列表。

配置写入使用同目录临时文件加 rename。损坏 JSON、未知版本、空路径或非法字段不会导致应用崩溃；应用进入 `selection_required`，并显示“已保存的工作区配置无效，请重新选择”。

## 工作区标记

每个初始化完成的工作区根目录包含：

```text
.autopublish-workspace.json
```

文件内容：

```json
{
  "version": 1,
  "createdAt": "2026-07-14T00:00:00.000Z"
}
```

标记不保存机器名、用户名、安装路径或业务数据。标记写入和必要目录初始化均在主进程完成。

## 目录分类与校验

候选路径分为：

- `existing_workspace`：存在合法标记，目录可读写，可直接使用。
- `empty_directory`：目录为空且可读写，可直接初始化。
- `nonempty_directory`：目录非空但没有标记，必须二次确认。
- `invalid`：路径不存在、不是目录、不可读写、标记损坏或属于禁止位置。

确认使用非空普通目录后，只创建标记和缺失的 AutoPublish 子目录；不得修改、移动、覆盖或扫描删除原有其他文件。

必须拒绝：

- 任意磁盘根目录，例如 `C:\`、`D:\`。
- Windows、Program Files、ProgramData 等系统目录及其父目录。
- 当前应用安装目录、Electron resources 目录及其父目录。
- Electron userData 配置目录本身。
- 普通文件路径、不可写目录、无法 realpath 的异常路径。
- 标记文件为 symlink/junction、无效 JSON 或未知版本的目录。

目录可写性通过在候选目录内创建并删除随机命名的临时文件验证。校验结束后不得遗留探测文件。

## 路径优先级

启动时路径优先级：

1. 非空 `AUTO_PUBLISH_WORKSPACE` 环境变量。
2. `workspace-location.json` 中的当前路径。
3. 无可用路径时进入首次选择界面。

环境变量路径仍必须经过相同的安全、存在性、标记和可写性校验。环境变量有效时，配置中心显示“当前工作区由环境变量控制”，允许打开目录，但禁用更换功能，并提示用户移除环境变量后重启。

不再静默回退到 `%USERPROFILE%\Documents\AutoPublish`。升级用户可以在欢迎界面主动选择原目录继续使用，原数据不会被删除。

## 启动状态机

启动 IPC 在业务服务之前注册，只暴露工作区引导能力。状态为：

```text
checking
selection_required
confirmation_required
ready
invalid
relaunching
```

启动流程：

```text
Electron ready
  -> 解析环境变量或保存配置
  -> 校验候选目录
  -> ready：初始化 runtime 和业务服务
  -> 无路径/路径失效：只启动欢迎界面
```

首次选择流程：

```text
选择工作区
  -> 主进程原生目录选择器
  -> 生成一次性 selection token
  -> 空目录或已有工作区：确认使用
  -> 非空普通目录：Renderer 展示二次确认
  -> 主进程凭 token 初始化并保存
  -> app.relaunch()
```

selection token 只保存在主进程内存中，绑定规范化后的候选路径和分类结果，使用一次后失效，应用退出后失效。Renderer 后续确认只能提交 token，不能提交或替换绝对路径。

用户取消系统目录选择器时，返回 `cancelled`；欢迎界面保持打开，不创建目录、不保存配置、不退出应用。

## React 启动门禁

React 最外层增加 `WorkspaceBootstrapGate`。它先调用启动 IPC：

- `ready`：挂载现有 AutoPublish 应用。
- `selection_required` 或 `invalid`：只挂载工作区欢迎界面。
- `confirmation_required`：显示选中路径、目录非空提示和将创建的目录清单。
- `relaunching`：禁用操作并显示正在重启。

现有 `App` 及其数据加载 effect 在状态 ready 前不得挂载，因此不会提前调用媒体、平台、AI、research 或豆包 IPC。

欢迎界面包含：

- 应用名称和选择原因。
- 当前安全错误说明。
- “选择工作区”按钮。
- 已选完整路径。
- 非空目录“确认初始化”和“取消”命令。

欢迎界面不提供默认目录按钮，不显示最近路径，不使用业务数据或 API 配置。

## 配置中心切换

配置中心显示：

- 当前工作区完整路径。
- 可写和标记状态。
- “打开文件夹”命令。
- “更换工作区”命令。

更换流程与首次选择共用原生选择器、目录分类、selection token、非空确认、初始化和配置保存逻辑。

以下情况禁止切换：

- 豆包采集队列处于运行、等待、暂停待处理或停止中。
- 媒体投稿或平台投稿任务正在运行或停止中。
- `AUTO_PUBLISH_WORKSPACE` 正在控制路径。

有未保存文章编辑内容时，Renderer 在调用最终确认前显示“尚未保存”确认；取消则丢弃 selection token，不切换。主进程不信任 Renderer 对任务状态的判断，最终切换前再次查询主进程任务服务和豆包队列。

切换成功后：

1. 原子保存新路径。
2. 安全停止当前订阅和空闲服务。
3. 调用 `app.relaunch()`。
4. 退出当前实例。
5. 新实例从目标工作区加载 `.env`、客户、问题、research、模板、浏览器 profile、生成文章和投稿记录。

不得复制或删除原工作区内容。不同工作区的豆包登录 profile 不互相复用。

## 路径失效与恢复

保存路径后来被移动、删除、变为不可写或标记损坏时，下次启动进入欢迎界面，不自动重建原路径、不回退默认目录，也不清除保存配置，直到用户选定新的有效目录并成功保存。

若路径已经保存但 relaunch 调用失败，界面显示可重试错误；用户下次手动启动时仍会尝试新路径。新路径本身无效时按正常路径失效流程返回欢迎界面。

## IPC 与安全边界

启动 IPC：

```text
workspace:get-bootstrap-state
workspace:choose-directory
workspace:confirm-selection
workspace:cancel-selection
workspace:get-current
workspace:open-current
workspace:request-switch
```

`choose-directory` 和 `request-switch` 都由主进程调用 `dialog.showOpenDialog({ properties: ["openDirectory"] })`。响应可以包含用于展示的路径和 selection token；确认请求只接受 token。

所有响应使用现有 `{ ok, data }` / `{ ok, error }` 信封。错误码至少区分：

```text
WORKSPACE_SELECTION_REQUIRED
WORKSPACE_SELECTION_CANCELLED
WORKSPACE_CONFIRMATION_REQUIRED
WORKSPACE_PATH_INVALID
WORKSPACE_PATH_FORBIDDEN
WORKSPACE_NOT_WRITABLE
WORKSPACE_MARKER_INVALID
WORKSPACE_SELECTION_EXPIRED
WORKSPACE_SWITCH_BUSY
WORKSPACE_ENV_OVERRIDE
WORKSPACE_RELAUNCH_FAILED
```

IPC 错误不得包含 API Key、客户资料、目录内文件清单或内部 stack。候选绝对路径可以在本机欢迎界面和配置中心显示，但不得写入普通运行日志或发送到外部服务。

## 模块边界

- `workspace-location-store`：只负责 userData 路径配置的读写与 schema 校验。
- `workspace-validator`：只负责路径分类、禁止目录、marker 和可写性。
- `workspace-bootstrap-service`：只负责编排选择 token、初始化、保存和 relaunch 决策。
- `workspace-bootstrap-ipc`：薄 IPC，不直接实现文件操作。
- `WorkspaceBootstrapGate`：阻止业务 UI 提前挂载。
- `SettingsView`：显示当前状态并发起切换，不执行路径校验。

现有 `runtime-config`、`workspace-paths` 和业务 services 继续接收已经确认的 workspace root，不承担目录选择职责。

## 测试策略

### 配置存储

覆盖无配置、合法配置、损坏 JSON、未知版本、原子写入失败恢复和不记录历史列表。

### 目录校验

覆盖空目录、已有工作区、非空普通目录、不可写目录、文件路径、磁盘根目录、系统目录、安装目录、userData 目录、损坏 marker 和 symlink/junction 逃逸。

### 启动流程

证明 workspace ready 之前不创建 runtime 和业务服务；取消选择仍停留欢迎界面；空目录、已有工作区和非空确认分别走正确状态；配置成功只触发一次 relaunch。

### 切换流程

覆盖相同路径、环境变量覆盖、活动任务阻断、非空确认、过期 token、未保存文章提示、重启后新路径生效和旧工作区不变。

### IPC 与 React

覆盖 Renderer 不能直接设置绝对路径、token 单次使用、事件和错误信封；证明 `WorkspaceBootstrapGate` 在 ready 前不挂载现有 `App`；配置中心显示当前路径并提供打开和更换命令。

### 打包

证明安装包不包含 `workspace-location.json`、开发机绝对路径或测试工作区；首次运行后路径配置只创建在 Electron userData。

## 人工验收

1. 使用隔离的 Electron userData 启动，确认出现欢迎界面。
2. 取消目录选择，确认应用保持打开且磁盘无新增工作区。
3. 选择空目录，确认初始化、自动重启并进入主界面。
4. 选择非空普通目录，确认出现二次提示，取消时目录不变，确认时只增加 AutoPublish 文件。
5. 在工作区 A 添加测试客户、问题和回答，切换到工作区 B，确认数据不出现。
6. 切回工作区 A，确认原数据仍在。
7. 删除或重命名当前测试工作区后启动，确认回到欢迎界面。
8. 豆包采集或投稿任务运行时切换，确认被拒绝。
9. 设置 `AUTO_PUBLISH_WORKSPACE` 后启动，确认配置中心禁止切换。
10. 完整测试、renderer lint/build、verify、alpha 打包和包内容检查全部通过。

## 验收标准

- 首次启动不再静默创建或使用 `Documents\AutoPublish`。
- 用户取消选择后应用保持可操作的欢迎状态。
- 空目录、已有工作区和非空普通目录按明确规则处理。
- Renderer 不能绕过原生选择器设置任意路径。
- 工作区未 ready 时任何业务服务和业务 IPC 都不初始化。
- 配置中心可以打开当前目录和选择新目录；切换后自动重启。
- 活动采集或投稿任务不能被工作区切换中断。
- 切换不复制、不移动、不删除原工作区数据。
- 不同工作区的 `.env`、客户、research、模板、登录 profile 和投稿记录相互隔离。
- 路径失效后返回欢迎界面，不自动重建或回退。
- 环境变量覆盖行为明确且可诊断。
- 安装包不包含用户路径配置或开发机绝对路径。
- 全套测试、lint、renderer build、verify 和 alpha 包检查全部通过。
