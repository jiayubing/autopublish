# M04 工作区组合根与 IPC 注册深审

> 深度审查状态：已完成。

## 模块职责和边界

认证后为单一内容库组装 publication、内容、生成、采集、平台和设置服务，注册统一认证 IPC，并在退出/切换时逆序取消订阅和销毁服务。

## 已检查的目录与关键文件

- 生产 `desktop/workspace-runtime.js`、`desktop/ipc/register.js`、`desktop/workspace-data-invalidation.js`。
- 遗留 `desktop/services/workspace-runtime.js`、`desktop/workspace-invalidation-policy.js`，相关 runtime/architecture/invalidation tests。

## 关键调用链

`authenticatedRuntime.start` → `createWorkspaceRuntime.start` → runtime paths → shared publication ledger → services → subscriptions → `registerIpc`；dispose 先删 handler/订阅，再逆序销毁 owned services。

## 发现列表

### TEMP-M04-1：架构测试维护另一套非生产 workspace runtime 与失效策略

- 分类：测试可靠性 / 架构耦合
- 所属模块：M04
- 严重程度：中
- 置信度：高
- 验证状态：已验证
- 位置：`auto—publish/desktop/main.js:6,127-150`；`desktop/workspace-runtime.js:1-144`；`desktop/services/workspace-runtime.js:1-107`；`desktop/workspace-data-invalidation.js:3-68`；`desktop/workspace-invalidation-policy.js:1-36`；`tests/architecture-seams.test.js:14-15`
- 问题描述：生产入口使用根级 runtime/data-invalidation，而架构 seam 测试读取并约束 `desktop/services/` 下另一套 runtime 和另一份仅覆盖少量 reason 的 invalidation policy。
- 代码证据：两组模块导出相似但不兼容的 lifecycle/policy；生产 `main.js` 没有引用遗留组，遗留组主要由测试引用。
- 触发条件：维护者依据通过的架构测试修改生命周期或新增失效 reason，或误改遗留实现。
- 可达路径或调用链：CI/本地架构测试 → 遗留 seam；实际应用 → 根级 production seam，两者不相交。
- 实际影响：测试通过不能证明生产组合根边界；已经与 renderer controller seam 红测共同形成测试/生产漂移。
- 影响范围：工作区切换、IPC 生命周期、renderer 缓存失效及 M31。
- 现有测试是否覆盖：两套实现各有测试，但缺少“测试引用必须等于生产引用”的约束。
- 验证方法与结果：静态 require 图及定向 runtime 测试；147 项相关测试通过，仍证实引用分叉存在。
- 修复方向：确定唯一生产 seam，让架构测试直接导入/约束该实现；删除或明确隔离遗留 fixture。
- 关联发现：renderer controller seam 漂移、M31 测试执行问题。

## 测试情况

组合根启动失败清理、subscription 失败、认证 guard、handler dispose 和 invalidation revision 定向测试均通过。

## 未覆盖区域

未用故障注入模拟所有 service dispose 同时失败；动态 adapter require 的最终加载图在 M13/M25/M26 核验。

## 待验证问题

无阻塞项。

## 模块审查结论

生产组合根本身的资源所有权清楚，但测试正在保护非生产实现；M04 深审已完成，结论为有条件通过。
