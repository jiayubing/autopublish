# 阶段0：工程基线与可信门禁

## 1. 阶段目标

建立后续所有重构可以信任的Git、测试、CI、production seam和制品基线。本阶段不改变业务语义、持久化格式或外部平台行为。

关联工作：OPT-001；吸收F-H15、F-M01、F-M20、F-M21。

## 2. 开始条件

- 本阶段是唯一不要求前序阶段完成的阶段。
- 用户已确认当前工作区中历史文档删除、`docs/review/`、`docs/optimization/`和`docs/refactor/`应如何固化；Codex不得自行恢复或清理。
- 记录当前分支、commit、tracked/staged/untracked状态。
- 运行现有默认测试、`.mjs`定向测试、旧seam测试、auth测试并记录基线。

## 3. 必读输入

- `docs/refactor/README.md`
- `docs/refactor/00-program-charter.md`
- `docs/refactor/01-target-architecture.md`
- `docs/refactor/02-codex-execution-protocol.md`
- `docs/refactor/13-progress-ledger.md`
- `docs/review/00-scope-and-baseline.md`
- `docs/review/modules/M04-workspace-runtime.md`
- `docs/review/modules/M08-platform-ui.md`
- `docs/review/modules/M30-build-deploy-ci.md`
- `docs/review/modules/M31-test-system.md`
- `docs/optimization/02-optimization-plan.md`中的OPT-001
- 根Git状态、根/子目录package脚本、workflow、production main/runtime/controller及对应测试

## 4. 允许修改

- 根`.github/workflows/`。
- `auto—publish/package.json`及必要的测试/验证脚本。
- CI、lint、typecheck、packaging和architecture tests。
- 已确认无production引用的影子runtime/controller测试资产。
- 本阶段文档、进度账本和交接记录。

## 5. 禁止修改

- publication、content、auth领域行为。
- 持久化schema或用户数据。
- 平台成功/失败判断。
- Renderer产品交互。
- 普通依赖升级；只有门禁必需且有证据的工具配置可以调整。

## 6. 实施步骤

### 6.1 固化仓库基线

1. 列出所有tracked、staged和untracked变化并按“用户已有/重构文档/本阶段”分类。
2. 不触碰用户已有历史文档删除；由用户决定先提交、保留还是另行处理。
3. 将阶段开始commit、Node/Electron版本、Windows版本和package lock状态写入进度账本。
4. 记录Git根与应用根，所有脚本不得再假设二者相同。

### 6.2 恢复根级CI

1. 在Git根建立可移植、可静态验证的workflow；本项目不配置remote，也不以托管平台作为验收平台。
2. 每个应用命令显式以`auto—publish`为working directory。
3. 至少运行默认测试、auth、lint、renderer/bridge typecheck、renderer build、link安全、migration/backup脚本测试和production packaging契约。
4. 明确Node 24 Electron/desktop和Node 22 auth的运行矩阵；不要用一个版本通过推断另一个版本安全。
5. 提供本地等价命令，CI失败可在Windows环境复现。

### 6.3 修正测试发现

1. 默认测试收集所有应自动执行的`.test.js`与`.test.mjs`。
2. 显式分类需要Electron、真实外部环境或手工验收的测试；不能通过glob遗漏来跳过。
3. 输出测试文件收集清单，增加契约测试防止未来再次漏扩展名。
4. 禁止真实平台、生产备份和付费接口进入默认套件。

### 6.4 统一production seam

1. 从`desktop/main.js`和renderer生产入口确认唯一runtime/controller。
2. architecture tests直接约束production seam。
3. 对无production引用的旧runtime/hooks执行删除测试；删除后复杂性不应转移给多个caller。
4. 不能删除时，记录其真实production职责并把它纳入目标架构；不得仅因为旧测试引用而保留。

### 6.5 建立架构门禁

至少增加自动检查：

- workflow位于Git根且working directory正确。
- 默认测试包含`.mjs`。
- production main只组装一个workspace runtime。
- renderer关键页面只使用一个controller/feature seam。
- 测试不通过读取影子runtime证明production架构。
- 私密运行数据、内容库、Cookie、数据库和构建产物不进入包或Git。

### 6.6 建立重构前数据安全工具

只建立针对合成workspace的只读manifest能力：列出将来迁移涉及的publication、batch、sidecar、order文件数量、相对路径和哈希，不复制正文、不打开真实用户workspace。该manifest为阶段2迁移fixture提供基线。

## 7. 必须新增或调整的测试

- CI根路径和working directory契约。
- `.js/.mjs`测试发现契约。
- production workspace runtime/controller引用契约。
- package内容排除契约。
- manifest仅输出相对路径、计数和哈希的安全测试。
- 现有旧seam测试替换为production interface测试。

## 8. 阶段验证命令

以阶段修改后的canonical scripts为准，至少包括：

```powershell
npm test
npm run test:auth
npm run lint
npm run typecheck:renderer
npm run typecheck:bridge
npm run build:renderer
npm run test:links
npm run format:check
```

另运行production packaging契约和一次`electron-builder --dir`非签名制品smoke；不得发布正式包。

## 9. 完成条件

- canonical本地命令、静态workflow契约和本地Git里程碑commit均有可复核证据；真实PR/push、remote和required checks为`NOT_APPLICABLE`。
- 默认测试收集清单含`.mjs`且全绿。
- 旧架构seam测试不再失败，production runtime/controller各只有一个。
- 根CI、本地命令和package脚本的cwd一致。
- 无业务代码语义、schema和用户数据变化。
- 进度账本、阶段交接、测试数量和跳过原因已记录。

## 10. 停止条件

- 无法识别真实production runtime/controller。
- 本机无法实际运行适用的安全门禁（例如file symlink capability缺失）。
- 扩大测试发现后出现无法归类的大量失败。
- 基线包含未解释的业务代码变化。
- manifest工具需要读取真实敏感内容才能工作。

停止时保持阶段`BLOCKED`或`IN_PROGRESS`，不得开始阶段1。

## 11. 交接重点

交接必须给出：本地阶段里程碑commit、canonical全局命令、测试文件/测试数量、唯一production runtime/controller路径、静态workflow契约和仍需本机人工启用的能力，以及阶段1可以依赖的架构门禁名称。remote/PR/push/required checks记录为`NOT_APPLICABLE`。

