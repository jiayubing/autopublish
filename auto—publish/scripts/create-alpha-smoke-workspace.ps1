param(
  [string]$Workspace = "$env:USERPROFILE\Documents\AutoPublish"
)

New-Item -ItemType Directory -Force -Path `
  "$Workspace\input\media", `
  "$Workspace\input\lieju", `
  "$Workspace\input\toutiao", `
  "$Workspace\input\hepan", `
  "$Workspace\data", `
  "$Workspace\logs", `
  "$Workspace\published", `
  "$Workspace\failed", `
  "$Workspace\tmp", `
  "$Workspace\work" | Out-Null

"测试标题`n这是一篇用于 alpha 安装包验证的媒体文章。" |
  Set-Content -Path "$Workspace\input\media\alpha-media-test.txt" -Encoding UTF8

"测试其他平台标题`n这是一篇用于其他平台投稿队列验证的文章。" |
  Set-Content -Path "$Workspace\input\lieju\alpha-platform-test.txt" -Encoding UTF8

Write-Host "Alpha smoke workspace ready: $Workspace"