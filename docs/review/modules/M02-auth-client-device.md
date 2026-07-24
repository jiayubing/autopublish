# M02 桌面认证客户端与设备深度审查

> 状态：已完成（2026-07-24）。固定基线为桌面认证实现与 auth-server 契约；未修改业务代码。

## 模块职责和边界

M02 负责桌面端登录、改密、refresh 轮换、会话恢复/重试、退出以及稳定设备身份保存。凭据只通过 HTTPS 发往 auth-server；业务 runtime 由认证成功后的 M04 组合根启动。

## 已检查目录与关键文件

- `auto—publish/desktop/services/auth-service.js`、`desktop/device-identity-store.js`、`desktop/ipc/auth-ipc.js`。
- `src/contracts/auth-contract.js`、authenticated runtime、AuthGate 直接调用方。
- `tests/auth-service.test.js`、`auth-ipc-boundary.test.js`、`device-identity-store.test.js`、`j4125-auth-contract.test.js` 及认证恢复相关测试。

## 关键调用链

`Auth IPC` → `createAuthService` → 固定 `https://auth.jiayubing.xyz` → auth-server login/refresh；refresh token 使用 Electron safeStorage 加密后以原子临时文件写入 userData；refresh 失败按终态/可恢复错误分类并通知 renderer；认证成功触发 `onAuthenticated` 启动业务 runtime。

## 发现列表

本模块未发现达到独立 finding 门槛的缺陷。请求实现固定 HTTPS，服务端错误被映射到稳定错误码，refresh 有共享 promise、代际检查和终态清理；设备身份是随机 UUID，文件写入使用临时文件替换且默认 `0600`。Windows ACL、safeStorage 在真实安装环境的可用性仍需 M30/现场验证，不能由单元测试证明。

## 测试情况

- 认证服务、IPC 输入边界、会话轮换/恢复和设备身份定向测试均纳入现有认证测试集合。
- 未连接真实 J4125、未在真实 Electron 安装包验证 safeStorage/ACL、网络代理或证书链。

## 模块审查结论

M02 深审完成，当前结论为通过；真实部署的 TLS、系统密钥存储和设备文件 ACL 保留为现场验证项。
