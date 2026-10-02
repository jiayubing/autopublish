# 开发模式知识库成稿容错修复

用户要求检查开发模式K阶段失败，并按小范围自用场景放宽不必要的严格限制。

## 定位

只读定位开发模式配置所指内容库，读取用户所指客户最新失败运行。未读取凭据、未调用供应商、未改变实际知识库或原运行记录。原日志错误为 `KNOWLEDGE_RESPONSE_INVALID`，映射成UI的 `GEO_SCHEMA_INVALID`。

已保存的最终响应为19479字符，JSON解析位置6272的 `inputRefs` 字段缺开头双引号。响应尾部完整，不是输出截断。修复语法后，另有两个阻断：九板块案例要求全文等于单条输入；canonical案例只允许专门的realCases条目且要求description逐字匹配，不允许直接引用原材料。这与连续成稿其他内容允许直接引用原材料的规则不一致。

## 最小修复

- 复用 `parseJsonObject` 作为实时K成稿与离线重放解析入口；兼容已有JSON包裹格式。在字符串外、字段位置补齐未加引号/缺开头引号的标识符字段名，不改正文、引用或字段值，不补造缺失值或结尾括号。
- 连续成稿真实案例允许有来源的整理改写，仍拒绝用推导条目冒充真实案例，保留不存在的引用、无依据数字及高强度事实检查。
- canonical案例与成稿统一：允许引用原始材料或真实案例记录，不要求description与输入逐字相等。
- 连续成稿不因段落换行拒绝整份稿件。非连续输入的既有规则不变。
- 未改持久schema、merge/手工锁定语义、请求预算或自动重试行为。

## 原响应离线验证

响应文本SHA256：`ea5cb79ad86d12a3c926e6f1d90dc41d607cab835d68e459b5a79214c06ed5c2`。

修复后只在内存解析和校验，九板块及canonical均通过，canonical包含4个案例与6个GEO问题。额外模型请求0。完整Markdown导出到Git忽略的本地 `recovered-10c86f48.md`，未将客户正文纳入测试或提交。

实际内容库内原失败状态和知识库保持原样；新代码不自动改写历史失败运行。开发模式主进程须重启才能加载代码修改。

## 回归验证

新增纯合成回归覆盖缺字段引号、代码块包裹、正文不变、截断/缺失值拒绝，以及通过desktop service完成真实持久化的案例改写+原材料引用+自然换行，断言模型调用次数仍为8而无补发。

定向 `node --test tests/geo-knowledge-research.test.js tests/desktop-continuous-knowledge.test.js tests/customer-continuous-knowledge.test.js`：47/47通过。详细日志位于忽略的 `auto—publish/build/knowledge-tolerance-*.log`。

最终代码验证（上述源码修改完成后运行）：

- `npm test`：652/652通过，无失败、跳过或取消，61个测试文件全部报告，生命周期CLOSED。
- `npm run test:integration`：1330/1330通过，无失败、跳过或取消，246个测试文件全部报告，生命周期CLOSED。
- `npm run lint`、`npm run typecheck:main`：退出码0。
- `git diff --check`：通过。

本次未修改renderer或IPC接口，未重复运行renderer构建。未调用真实模型服务或执行真实知识库写入；实际历史响应的验证限于离线解析、构建与Markdown导出。

本次在既有性能优化脏工作区上增量实施，保留全部此前改动；未提交或推送。

## 第二次开发运行跟进

运行 `run-8d56aae4-802e-4f4a-a81a-a78a9a512ec3` 是新的失败，报告为 `KNOWLEDGE_SYNTHESIS_INVALID_REF`，不是旧状态残留。逐层离线复现发现：案例引用客户特点中的客户事实被分类限制拒绝；原材料有硬事实关键词但中间摘要没有，被重复逐字检查误拒绝；评价是材料摘录，却被要求包含整份材料；缺失资料项没有引用被拒绝；两条结构化推荐角度没有产品或场景关联。

修复限定在连续成稿：放开案例的研究分类限制，仍拒绝推导冒充案例；硬事实关键词检查最终原始来源；允许评价的原文摘录；允许缺失资料项的空引用；没有关联的推荐角度不进入canonical集合并写入status.warnings，不制造关联，不放行未知关联。未修改持久schema。新增desktop服务行为回归覆盖上述组合，既有非法引用、凭据、数字及评价篡改回归仍通过。

原响应在内存完成九板块与canonical构建验证通过，草稿导出到Git忽略的 `recovered-8d56aae4.md`。没有模型请求，没有覆盖真实知识库或历史运行状态。

最终验证：三文件定向48/48通过；知识库相关扩展回归77/77通过（含页面行为）；lint、typecheck:main、git diff --check通过。日志为 `auto—publish/build/knowledge-tolerance-followup*.log`。此轮没有重跑全库core/integration，前面的652/1330结果仅对应上一轮代码。最终变更仍未提交，保留原性能优化工作区。
