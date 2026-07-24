# M03 工作区引导与存储分区深审

> 深度审查状态：已完成。

## 模块职责和边界

选择、校验和切换可迁移内容库，并把安装目录、漫游配置、本地状态和内容库分为互不重叠的四类根路径；保存内容库位置但不把业务内容写入配置目录。

## 已检查的目录与关键文件

- `desktop/{storage-paths,runtime-config,runtime-config-store,runtime-paths,workspace-bootstrap-service,workspace-location-store,workspace-paths,workspace-validator}.js`。
- `desktop/ipc/workspace-bootstrap-ipc.js`，内容库 ADR、迁移文档及对应 workspace/storage/runtime tests。

## 关键调用链

认证成功 → bootstrap 读取环境覆盖或保存位置 → validator realpath/marker/write probe → token 化选择 → confirmation 重新校验与忙碌状态 → 安全创建目录/marker → 原子保存位置 → dispose/relaunch；启动后 `configureRuntimeEnvironment` 注入四类路径。

## 发现列表

本模块未发现满足证据门槛的独立缺陷。路径重叠、symlink、TOCTOU 回滚、短写、原子保存失败、活动任务切换均有显式防护和测试。

## 测试情况

- workspace/storage/runtime 定向验证纳入 147 项：145 通过、0 失败、2 跳过。
- 两项跳过均因当前 Windows 环境不能创建 symlink；对应生产逻辑为 fail-closed，但缺少本机动态证据。

## 未覆盖区域

真实网络盘、UNC、磁盘满、Windows ACL 和杀毒软件占用未现场验证。

## 待验证问题

内容库及浏览器/秘密目录的部署 ACL 仍需安装环境核对。

## 模块审查结论

存储所有权和切换事务设计完整，未确认产品缺陷；M03 深审已完成，结论为通过。
