# 桌面应用局部规则

继承[根规则](../AGENTS.md)。代码在 src、desktop、media-workbench，验证在 tests；按[开发说明](../docs/development.md)选择直接调用链与检查，产品规则不在本目录重复维护。

work、logs、failed、release-*、.playwright-cli、build、dist 和运行内容库是数据/生成物，不手改或提交。resources/content-templates 与 src/content/default-final-knowledge-prompt.md 是程序资产，不能按文档清理。

进入 auth-server 时使用其局部规则和 README，不把桌面客户、Cookie、队列或文章传给鉴权服务。
