# M05 — Test Quality Cleanup

**Purpose:** 在业务规则和 contract surface 最终稳定后，减少“测试源码长什么样”的脆弱测试，把业务保证迁移到公开行为/合同/集成测试，同时保留真正有价值的 architecture/security/static absence 门禁。

**Status:** `PENDING`；实时可调度性只由波次执行计划与 Git 预检决定

**Scheduling gate:** M04 `COMPLETE` 后调度；维护 10.5 第二项。M05 完成后才允许 M06。

## Allowed static-test categories

源码/regex/static inspection 只允许证明：

1. dependency direction / forbidden import；
2. public capability、IPC/bridge 或 legacy surface 的存在/不存在；
3. generated artifact、CI、packaging/release contract；
4. security static boundary。

业务状态转换、错误分类、权限结果、队列/订单行为、持久化一致性和 UI 操作必须通过公开行为/合同/集成测试证明。

## Execution

1. 生成当前 test inventory：行为、contract、integration、architecture、static absence、packaging、E2E；标出读取生产源码/regex 的测试及其实际保护意图。
2. 对每个不属于允许类别的 static test：先补/确认等价公开行为测试，再删除或降级静态断言。
3. 合并重复 phase test，只保留能定位 owner/故障边界的最小集合；不为了减少文件数牺牲可诊断性。
4. 保留 Ticket 24 的必要 legacy absence、依赖方向、安全和打包门禁。
5. 校准 `test:discover` 与完整 runner，确保新增测试自动发现，不靠人工名单遗漏。

## Acceptance criteria

- [ ] 产出 before/after inventory，明确每个被删/改 static test 的替代行为证据。
- [ ] 不再存在用私有函数名、实现行数、任意源码片段证明业务行为的测试。
- [ ] architecture/security/legacy absence/packaging static guard 被保留并有清晰分类。
- [ ] 核心业务 owner 都有稳定公开接口或直接调用方测试，失败能定位到领域边界。
- [ ] `npm run test:discover`、相关专项测试和完整 `npm test` 在最终集成 `HEAD` 通过；不得靠 skip、提高超时或放宽断言实现绿色。
