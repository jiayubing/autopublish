# M15 AI provider 与文章生成深度审查

> 状态：已完成（2026-07-23）。固定基线 `master@e8d817847bab3a9e6020006cab35340f645e527f`；无业务基线偏差。

## 模块职责和边界

M15 管理应用级 AI provider 配置和密钥，构建最小化 prompt，调用 OpenAI 兼容接口，校验模型结果，并把来源快照交给文章 store。它不拥有批次调度、客户来源真值或投稿状态；M17 负责并发和生命周期，M14/M18 分别拥有来源与文章。

十项维度已覆盖：safeStorage 密钥驻留、renderer 安全 DTO、HTTPS/loopback URL 限制、环境覆盖优先级、请求 timeout/Abort、错误归一化、输出 schema、prompt 数据范围、来源快照、文章双文件写入失败传播和测试 seam。未发现满足本阶段证据门槛的有效候选。

## 已检查目录与关键文件

- 全部生产文件：`desktop/ai-provider-config-store.js`、`desktop/services/ai-provider-service.js`、`desktop/services/ai-content-service.js`；`src/content/ai-client.js`、`prompt-builder.js`、`article-generator.js`。
- 边界与接线：`desktop/ipc/ai-provider-ipc.js`、`ai-content-ipc.js`、preload content bridge、`desktop/workspace-runtime.js`。
- 直接依赖：M14 的 client/material/research/template stores、M18 `article-store.js`、M17 generation batch service。
- 契约与测试：`docs/content-generation-operations.md`、`docs/content-workspace-contract.md`；`ai-{provider-config-store,provider-service,provider-ipc,client,content-service,content-ipc}.test.js`、`prompt-builder.test.js`、`article-generator.test.js`。

## 关键调用链

1. 设置 IPC → provider service → URL/模型/timeout 校验 → safeStorage 加密 API key → 应用配置文件；读取 DTO 只返回 `hasApiKey` 等非秘密字段。
2. 单篇生成/批次任务 → M14 来源选择 → prompt builder → article generator → AI client `fetch` + Abort → 模型输出校验 → M18 article store。
3. 环境变量仅作为启动级覆盖；workspace `.env` 不成为 provider 密钥来源。
4. 文章保存的是材料、研究、模板快照及参与标记，后续来源变化不静默重写历史文章。

## 候选发现

本模块没有满足“明确代码依据 + 现实生产可达路径”的有效候选。审查期间核对的秘密泄漏、非 TLS 端点、无超时请求、未校验模型输出、来源不落快照等风险均已有生产保护或测试，未包装为一般性建议。

## 测试情况

- M14–M21 联合定向测试：313 个测试，308 通过、0 失败、5 跳过，退出码 0。
- 定向覆盖 safeStorage 可用/不可用、密钥不回传、HTTPS/loopback、Abort/timeout、HTTP/JSON/schema 错误、prompt 来源和 article provenance。
- 测试主要使用本地 fake fetch，不代表真实第三方 provider 的兼容性认证。

## 未覆盖区域与待验证

- 未向真实 AI provider 发出请求，未验证特定厂商在限流、长响应、代理和异常 JSON 下的现场行为。
- 未做超大材料的 token/内存容量测试；当前 prompt 是完整字符串拼装，实际边界取决于客户材料规模和 provider 限额。
- OS safeStorage 的真实系统密钥环行为未在本轮环境中做破坏性验证；代码降级和错误路径已读取并由测试覆盖。

## 模块审查结论

M15 达到深审完成门槛，0 条有效候选发现。配置秘密、安全 DTO、网络端点、超时与来源快照的主要不变量均有实现和测试支撑；剩余不确定性主要来自未连接真实第三方服务和容量实测，而非已证实缺陷。
