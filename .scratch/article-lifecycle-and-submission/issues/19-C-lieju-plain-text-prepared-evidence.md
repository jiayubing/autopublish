# 19-C — 列举网平台纯文本表示与 Prepared Evidence

**Goal:** 在不修改文章库 Markdown / JSON / snapshot 的情况下，为列举网产生确定、可读的纯文本正文，并让 prepared evidence/fingerprint 精确绑定实际提交文本。

**Blocked by:** 19-B `COMPLETE`。

## 主 owner / 允许修改

- 列举网 adapter 私有 body renderer 和 prepare 接线。
- `src/core/article-text.js` 只读；仅当 19-0 证明其现有语义完全匹配且直接消费方回归允许时，才能做最小通用修正。
- 列举网 prepare/evidence 合同测试。

## 本包职责

1. 从冻结 `publicationSnapshot.body` 产生一次性纯文本：保留可见文字、段落、标题文字、编号和列表可读性；去除 Markdown 展示符号。
2. 对强调、标题、链接、Markdown 图片、列表、引用、表格、行内 / 块代码和 HTML 冻结平台语义；不泄漏图片本地路径 / URL。
3. 不使用 AI 重写，不提交未验证 HTML，不删减业务正文。
4. 用现有 V1 validator/fingerprint 构建实际平台 body 的 `preparedSubmissionEvidenceV1`；冻结后不再转换。
5. 保持原 title，除非列举网已有稳定长度合同明确要求准备期映射；不自行截断。

## 禁止跨界

- 不写回 article-store、不改生成 prompt、不改 Renderer 编辑内容。
- 不修改公开 evidence schema / outcome enum，不为测试暴露新生产 API。
- 不准备图片、不建 multipart、不访问远程。

## Acceptance criteria / 最低验证

- [ ] 强调 / 标题 / 链接 / 图片 / 列表 / 引用 / 表格 / 代码 / HTML 行为矩阵通过，本地路径不出现在输出。
- [ ] 东爵 2211→2151 回归保留段落、章节、编号和结尾，不再出现 `**`。
- [ ] 文章库 Markdown / JSON 字节在 prepare 前后不变。
- [ ] evidence body 等于实际准备 body，fingerprint 可重算相等；source Markdown 不被伪记为已提交内容。

## 停止条件

若只有修改公开 evidence schema 才能记录实际 body，或源 Markdown 语法需要新的用户可见内容决策，停止并返回主任务。
