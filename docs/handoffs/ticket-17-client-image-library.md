# Ticket 17 — 客户本地图片库交接记录

状态：已实现；ticket17 自身验证通过。全量测试的 4 个失败均为仓库缺少预构建 alpha/Playwright 运行时产物。

## 端口

`createClientImageLibrary({ workspaceRoot, ...options })` 提供以下应用边界：

- `scan(clientId, { refresh? })`：返回客户图片快照、可用图片元数据、安全诊断和扫描摘要。
- `scanMany(clientIds, options)`：按客户批量扫描；同一库实例内重复客户命中缓存。
- `listImages(clientId)` / `listAvailableImages(clientId)`：只返回安全图片元数据。
- `selectImages(clientId, { count?, random?, excludeImageIds?, refresh? })`：默认选择 1 张，限制 0–5 张；返回不重复图片、缺口数量和 `textOnly` 结果。
- `invalidate(clientId?)`：显式失效单个客户或全部客户缓存。
- `resolveImage(clientId, imageId)`：将稳定引用解析为经过边界复核的内部文件路径，绝对路径只存在于该内部交接结果，不进入快照。

快照和选择结果只包含 `client-image:<base64url(relative-path)>` 稳定引用、相对路径、文件名、扩展名、MIME、尺寸和字节数，不包含图片二进制或绝对路径。

## 路径威胁模型

- 客户身份先通过既有 `resolveClientIdentity` 定位，再由 `content-path-policy` 验证物理目录位于内容库 `clients` 根下。
- 默认图片根是该客户目录本身，图片扩展名允许 JPG/JPEG、PNG、WebP，递归支持子目录；可通过 `imageDirectoryName` 收窄到客户目录内的专用子目录。
- 每个目录项先 `lstat`，符号链接、非普通文件、损坏文件、读取失败和解析到客户边界外的路径都跳过并生成不含绝对路径的诊断。
- 读取稳定引用时重新检查普通文件、符号链接和 `realpath` 客户边界，避免缓存路径在扫描后被替换或越界。
- 扫描器不写入客户目录，不移动、上传或标记图片已使用。

## 缓存策略

缓存是 `createClientImageLibrary` 实例内的显式依赖，不使用模块级可变单例。键由内容库作用域、真实 `clients` 根和逻辑客户 ID 组成，保证内容库与客户隔离。

一次批量扫描结果可被该客户的多个文章任务复用；新增、删除或替换图片后由调用方执行 `invalidate(clientId)` 或 `scan(clientId, { refresh: true })`。选择器只在内存候选集合上做无放回抽样，不记录使用占用，因此同一文章内不重复、不同文章可复用。

## 容量证据

`tests/client-image-library.test.js` 创建 1,200 张 PNG，断言首次扫描发现全部图片；随后 20 个选择任务不增加目录遍历次数，显式 refresh 才触发第二次遍历。测试同时覆盖客户隔离、递归目录、损坏/不支持文件、客户内外符号链接、零图片、数量不足和稳定引用重新解析。

## 模块规模

按当前格式化源码行数：

| 模块 | 行数 | 职责 |
| --- | ---: | --- |
| `client-image-path-policy.js` | 226 | 客户目录、边界和链接安全 |
| `client-image-scanner.js` | 191 | 递归发现、诊断和快照 |
| `client-image-metadata.js` | 217 | JPG/PNG/WebP 签名与尺寸元数据 |
| `client-image-library.js` | 163 | 客户库端口和安全 DTO |
| `client-image-reference.js` | 89 | 稳定引用编码/解码 |
| `client-image-selector.js` | 86 | 0–5 无放回选择策略 |
| `client-image-cache.js` | 42 | 实例级扫描缓存 |

所有生产模块低于 ticket 规定的 250 行目标和 400 行硬上限；未修改任何平台适配器或网站媒体传输流程。

## 验证记录

- `node --test tests/client-image-library.test.js tests/client-image-selector.test.js`：9/9 通过。
- `npm run lint`、`npm run typecheck:main`、`npm run typecheck:bridge`、`npm run typecheck:renderer`、`npm run format:check`：通过。
- `npm test`：1,638 项中 1,634 项通过；4 项失败分别是 alpha smoke 缺少 bundled Playwright Node，以及 3 项检查缺少 `release-alpha/win-unpacked/resources/app.asar`。这些产物不由本 ticket 生成，失败堆栈未进入图片库模块。
