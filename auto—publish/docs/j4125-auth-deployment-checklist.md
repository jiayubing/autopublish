# J4125 认证服务部署验收清单

本清单只准备认证服务部署边界，不执行 SSH、Docker、Cloudflare Tunnel、DNS、端口或防火墙变更。真实部署必须由用户单独授权。

## 固定边界

- 客户端只访问 `https://auth.jiayubing.xyz`，不接受 Renderer 注入认证地址。
- 认证容器独立于内容库、Alist、Open WebUI、AI 服务和发布 Worker。
- 认证数据库只保存管理员账号、密码哈希、设备会话、授权和必要审计记录。
- 不保存客户、文章、Prompt、投稿队列、publication ledger、平台 Cookie 或 AI Key。
- 容器只监听内部端口；Cloudflare Tunnel 仅增加该 HTTPS hostname 的 ingress，不新增家庭公网端口。

## 服务器准备

- [ ] 复制 `auth-server/.env.example` 为服务器 secret 文件；管理员密码、数据库密钥和签名密钥不进入 Git、镜像、客户端或日志。
- [ ] 使用独立目录和独立数据卷部署 `auth-server/docker-compose.yml`。
- [ ] 使用 SSH 管理命令创建 `admin` 账号和普通 `user` 账号；不开放公开注册、不创建网页后台、不引入复杂 RBAC。
- [ ] 通过 `authctl user create|list|enable|disable|reset-password|set-expiry|set-device-limit|set-note` 管理账号，通过 `authctl device list|revoke` 和 `authctl session revoke-all` 管理设备与会话；密码只使用隐藏交互输入。
- [ ] 为 `auth.jiayubing.xyz` 配置现有 Tunnel 的 HTTPS ingress，并确认没有新增公网监听。
- [ ] 配置数据库和密钥备份；恢复演练只恢复认证数据，不包含客户内容。
- [ ] SQLite 使用独立 `/data` 卷和在线 backup/checkpoint；schema 升级前保存可恢复快照，数据库损坏或未知 schema 时服务失败关闭。

## 受控验收

- [ ] `GET https://auth.jiayubing.xyz/healthz` 只返回服务健康状态。
- [ ] 临时测试账号验证正确密码、错误密码、禁用账号、refresh 轮换、重复 refresh、退出和会话撤销。
- [ ] 临时测试账号验证授权到期/续期、设备名额、设备撤销、首次改密和 token family 重放检测。
- [ ] 确认日志不含密码、access/refresh token、完整请求体、内网地址、文章标题或 Cookie。
- [ ] 客户端断网、认证服务不可达、授权过期时只显示固定安全错误，并拒绝业务 IPC。
- [ ] 认证期间已有投稿任务不被强杀；任务完成后进入安全终态，重新登录前不允许新业务操作。
- [ ] 完成外部验证后撤销临时测试账号，再创建唯一正式 `admin` 并确认授权期限。

## 禁止项

- 不在本机或安装包中写入 J4125 私钥、管理员密码、refresh token、数据库或 Tunnel 配置。
- 未获得部署授权前，不连接真实 J4125、不修改 Tunnel/DNS/防火墙、不启动服务器发布 Worker。
