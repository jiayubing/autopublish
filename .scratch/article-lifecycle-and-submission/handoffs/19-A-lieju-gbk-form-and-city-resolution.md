# 19-A — 列举网 GBK Form Parser 与城市目标决策：Closure Handoff

## 状态与 provenance

- 工作包：`19-A-lieju-gbk-form-and-city-resolution`。
- 开始 integration HEAD：`12c2fa00096bc9a8c9c2aad90a04ee47161cbedd`（`codex/article-lifecycle-submission`，开始时工作树干净）。
- 实现提交：`78d19b928b89662ee270163c252757a39b3b6f37`（`feat(lieju): parse GBK publication forms`）。
- 当前状态：Primary Audit、阻塞修复、bounded re-audit、定向 gate 与实现提交均已完成；**19-A 为 `COMPLETE`**。
- 本次 closure 授权不包含 19-B 或任何真实列举网操作。
- 没有执行登录、GET、POST、上传、Playwright、storageState 读写、付费或发布。

## 实现与 owner

- 新建 `src/platforms/lieju/http-form-parser.js`，作为 19-A 唯一纯解析 owner：
  - 对 HTTP `Content-Type` 与 HTML meta charset 一致性做 fail-closed 判定，使用 Node 内建 `TextDecoder` 的 fatal 模式解码 `utf-8`、`gbk`、`gb2312` 和 `gb18030`；未知、冲突或损坏 bytes 均以稳定 error code 失败。
  - 使用 Cheerio DOM 顺序枚举城市目录链接，按链接可见文本包含客户城市的冻结规则取第一个匹配；无匹配仅回退北京。所有目标都重新验证为无 query/fragment/credential 的 `https://post.lieju.com/{numericCityId}/239`。
  - 仅接受同城市、HTTPS、`action=postnew` 的 multipart `POST` form；只从该 form 的真实 DOM controls 提取 successful controls，保留重复项与不透明 hidden 值，排除 script 字符串、disabled、未选 checkbox/radio 和付费推广 control，并选择最后一个可用 `postdb[zone_id]` option。
  - 解析结果递归冻结，带不暴露 hidden value 的 `toSafeMetadata()`；含原始 HTML 或 hidden controls 的结果拒绝 JSON 序列化，避免被意外写入 evidence。
- `src/platforms/lieju/adapter.js` 只暴露该纯 parser seam，未改 prepare、submit、Playwright 或任何远端行为。
- `package.json` / `package-lock.json` 显式加入 MIT 许可的 `cheerio@1.1.2`；不引入 encoding shim。锁文件仅新增 Cheerio 及 22 个必需传递包，没有重写既有解析项。
- 新建 `tests/lieju-http-form-parser.test.js`，以合成 bytes/HTML fixture 验证公开纯函数行为与 package closure；没有测试读取生产源码或执行远端调用。

## Primary Audit 与 remediation

范围：19-A 的新纯 parser、adapter seam、直接 package 依赖和合同测试；不审计后续 HTTP transport 或既有 Playwright submit。

已检查不变量：唯一纯 owner、无网络/存储/Playwright 副作用、charset fail-closed、城市 URL/action allowlist、successful controls 与隐藏值隔离、依赖/CI Node 24 合同、直接调用方不改变既有 submit。

发现与处理：

- `P2 INTRODUCED_BY_CHANGE`：普通 headers 的字段名未完全按 HTTP 大小写无关语义读取；修复为枚举大小写无关的 `content-type`，并增加覆盖。
- `P2 INTRODUCED_BY_CHANGE`：无 `value` 的已选 option 会被错误解析为空值，偏离真实 successful control；修复为使用规范化 option 文本作为回退值。
- `P2 INTRODUCED_BY_CHANGE`：付费字段匹配把单独“推荐”视为推广，可能丢弃非付费联系字段；修复为区分 machine identifier 与明确付费/推广标签，并覆盖 `isrecommend` 与“推荐人”。

没有未关闭的 P0/P1，亦没有需要登记的非阻塞 finding。

## Bounded re-audit

仅复查以上三项修复、parser 的直接 adapter/package seam 和对应回归。charset header/meta、option value、付费字段过滤均由新测试覆盖；城市/action allowlist、不可序列化的敏感解析结果与现有 prepare/submission-boundary 回归保持通过。结论：`PASS`；未触发扩大审计条件。

## 定向验证

在 `auto—publish/`，Node `v24.16.0`：

```text
node --test --test-concurrency=1 tests/lieju-http-form-parser.test.js
# 初始 RED：Cannot find module '../src/platforms/lieju/http-form-parser'

npm ci --dry-run --ignore-scripts
# PASS（up to date）

node --test --test-concurrency=1 tests/lieju-http-form-parser.test.js tests/regular-platform-adapter-outcomes.test.js tests/article-lifecycle-ticket-08.test.js tests/production-packaging.test.js
# 63 passed, 0 failed, 0 skipped, 0 cancelled

npm exec -- eslint src/platforms/lieju/http-form-parser.js src/platforms/lieju/adapter.js tests/lieju-http-form-parser.test.js
# PASS

npm audit --omit=dev --audit-level=high
# found 0 vulnerabilities

git diff --check
# PASS
```

覆盖：GBK/GB2312/GB18030/UTF-8、charset conflict/unknown/damaged bytes、HTTP header 大小写、meta data attribute 隔离、城市直接与模糊匹配、DOM 第一候选、北京回退、恶意 URL、最后非空/无区域、script template、重复字段、disabled/unchecked/付费 control、option text fallback、frozen/redacted result 与 adapter/package closure；以及现有 08 prepare/submission-boundary、列举网 Playwright outcome 与生产打包合同回归。

## 下一步

19-A 已进入新的 integration HEAD。19-B 是唯一下一可调度项，但不得因本 handoff 自动启动；真实带图验收仍需单独授权。
