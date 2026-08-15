# 19-A — 列举网 GBK Form Parser 与城市目标决策

**Goal:** 建立无远程副作的列举网纯解析深模块，把 HTTP 响应稳定解码为城市目标、区域决策和真实 form controls。

**Blocked by:** 19-0 `COMPLETE`。

## 主 owner / 允许修改

- 列举网 adapter 私有的 charset / HTML form / city-target 解析模块。
- 对应纯函数合同测试与必要的显式 parser 依赖 / 打包合同。
- `src/platforms/lieju/adapter.js` 仅允许接入新的纯解析能力；不改 submit。

## 本包职责

1. 按 HTTP `Content-Type` 和 HTML meta charset 解码 GBK / GB2312 / GB18030 / UTF-8；未知或冲突编码 fail closed。
2. 结构化解析 `city.php?post=239` 链接，按 DOM 顺序执行“链接文本包含客户城市”模糊匹配；无匹配回退北京。
3. 验证城市 URL 为 `https://post.lieju.com/{numericCityId}/239`，不跟随或保留未知 origin/path。
4. 只解析已验证 action 的投稿 form，返回 method/enctype/action、真实 successful controls、不透明隐藏值和最后一个非空 `zone_id` option。
5. 排除 `<script>` 中的动态模板字符串、disabled controls、未选 checkbox/radio 和付费推广字段。

## 禁止跨界

- 不发起网络请求，不读写 storageState，不构建 multipart，不触发 Playwright。
- 不建立静态城市 ID 真源或“其他”区域特例。
- 不把 DOM 原文、hidden values 或客户城市写入持久 evidence。

## Acceptance criteria / 最低验证

- [ ] GBK / UTF-8、charset 冲突、损坏 bytes 和未知编码矩阵通过。
- [ ] 城市直接匹配、模糊匹配、多候选取第一个、无匹配回退北京、恶意 URL 拒绝通过。
- [ ] 最后非空区域、无可用区域、脚本模板污染、重复字段和付费 control 排除通过。
- [ ] 输出是冻结、可脱敏检查的内部结果；没有远程副作。

## 停止条件

若可靠解析必须修改全局 HTML 基础设施、引入与 CI/打包不兼容的 runtime，或城市规则需要新产品决策，停止并返回 19-0 / 主任务。
