# M30 构建、打包、部署与 CI 深度审查

> 状态：已完成（2026-07-24）。

## 发现列表

### TEMP-M30-01：CI workflow 位于非 Git 根，GitHub 默认不会发现

- 分类：发布可靠性 / CI
- 严重程度：高
- 置信度：高
- 位置：`auto—publish/.github/workflows/ci.yml:1`；Git 根为 `F:/官媒投稿`，根下没有 `.github/workflows`。
- 影响：push/PR 不会自动执行列出的测试、lint、audit 和 renderer build，提交可在无门禁情况下合并。
- 修复方向：把 workflow 放到 Git 根 `.github/workflows`，或明确配置外部 CI 的 working-directory，并用一次 PR 运行记录证明触发。

### 关联 finding：TEMP-M26-02

生产 ASAR 打包的 Hepan 脚本解析路径未映射到 `app.asar.unpacked`，已在 M26 以 TEMP-M26-02 记录；M30 不重复创建 finding。发布门禁应在真实 production unpacked/安装包中执行 Hepan self-test。

## 其他核对与测试门禁

`check-clean-build` 要求干净 Git；runtime manifest 使用 HTTPS+SHA-256；生产签名要求证书环境变量。现有 `tests/production-packaging.test.js` 主要断言 YAML 文本，未构建最终 ASAR/NSIS，也未验证签名、SmartScreen、ACL、升级/回滚。auth Dockerfile 使用固定 Node 22 Alpine，但 CI 使用 Node 24，未形成运行矩阵。

## 模块审查结论

M30 深审完成，保留 1 条独立高风险 finding（TEMP-M30-01），并关联 TEMP-M26-02；发布前必须先恢复 CI 可发现性并进行真实 production packaging smoke。
