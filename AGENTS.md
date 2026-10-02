# AutoPublish 工作约定

默认中文沟通。先从 [README](README.md) 选择当前任务相关主题；只读直接源码、调用方、测试及必要合同。小改动不要求新建计划、审计和交接文件；复杂活跃任务一事一份，登记在 [work](docs/work.md)。

## 修改与事实

- 先核对 Git、当前实现、schema、测试和产品说明。代码证明实际行为，产品说明表达应有行为；冲突时核对已确认决策，不默认代码正确，也不恢复被否定的旧路线。仅无法消解且影响使用方式的冲突询问用户。
- 业务规则先找唯一 owner；不得在 UI、IPC、adapter、缓存或临时文件建立第二 writer。模块边界见 [architecture](docs/architecture.md)，行为见 [内容生产](docs/product/knowledge.md)和[投稿](docs/product/publishing.md)。
- 最小完整修复，不顺手重构；复用既有能力，有真实消费者才保留兼容。稳定错误码与安全摘要，不用原始错误文本驱动业务，不泄漏凭据或敏感内容。
- 区分未发送、明确失败、明确成功和结果不确定。不确定远端结果不自动重发；持久意图先于副作用，崩溃/并发/重试保持幂等与恢复语义。cleanup 失败不得覆盖业务错误。
- 保持 CommonJS 主进程和受控 preload/typed bridge；renderer 不直接访问 Electron。子进程优先 executable + argv + env，外部输入不拼 shell。SQLite 只走正式 migration。

## 验证与完成

- 按 [development](docs/development.md) 选择风险测试：先反例与定向，再必要集成。业务验收验证公开行为和持久事实，静态检查只用于安全、依赖和构建合同。
- 默认 Implementation → Primary Review → 修阻塞项 → Bounded Re-review → Complete。修复后只看 finding、diff、受影响不变量及直接调用方，不无限重新全审；只有公开合同、schema、owner 或副作用边界变化才扩大相关范围。
- P0/P1 阻塞；P2 仅在影响当前正确性、一致性、幂等、安全或公开合同时阻塞，其余登记明确 owner。完成需绑定最终代码和实际验证，如实列未验事项；源码变化后旧测试结果不能证明新版本。
- 稳定规则更新到唯一主题，剩余事项更新 work；完成的计划提取有效内容后退出工作树。长期文档不复制测试数量、阶段日报或旧授权。

## 数据、外部操作与 Git

- 保留 dirty 和未跟踪文件；不用破坏性 reset/checkout、git clean、git add . 或 force-add ignored 文件。不自动提交、推送、合并或发布。
- 不手改构建产物、日志、缓存、node_modules、运行内容库和应用配置。Markdown 也可能是提示词、模板或 fixture；移动/删除前核查程序消费者与构造路径。
- 自动化用合成数据、临时库和假 transport。真实模型、登录、发布、上传、付费、取消、生产迁移、服务器/TLS 等需本次具体授权和停止条件，历史证据不携带授权。
- 仅产品实质歧义、不可逆数据风险、必要凭据/环境缺失或 owner 不明且继续有风险时停止受影响部分。普通实现选择、测试失败和范围内 finding 自行处理。
