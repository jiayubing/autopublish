# Renderer 包体基线与例外

2026-07-20 的 `npm --prefix media-workbench run build` 产物中，入口 IIFE 约为 699 KB（gzip 约 193 KB）。

当前 Electron `loadFile` 启动链仍要求 Vite 输出兼容 `file://` 的 IIFE，并由 `vite.config.ts` 移除 module script；在该输出格式下 Rollup 不能安全生成动态 import chunks。`App.tsx` 已将内容、平台、设置、订单和资源工作台改为 `React.lazy`，保留了后续切换到 module/chunk 输出的 seam；本阶段不改变 Electron 的本地文件加载语义。

该数值是有记录的暂时例外，不作为“已低于 500 KB”宣称。后续若调整 Electron renderer 加载为 module-compatible URL，应重新启用 chunk splitting，并以首屏用户流程和真实安装包 smoke test 验收。
