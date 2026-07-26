# Phase 05 人工验收操作手册

本文给不熟悉项目的执行者使用。它只验证 metadata migration，不连接投稿平台、支付系统或生产系统。

重要：整个过程只操作“真实内容库的副本”。不要把原始内容库路径直接放进下面的命令。

## 什么时候需要执行

- 只创建一个 Git 里程碑 checkpoint：可以暂时不执行本文。
- 要把 Phase 05 标记为 `COMPLETE`：必须执行本文，并把证据交给 Codex 做独立复核。

## 一、准备测试副本

1. 关闭正在使用该内容库的桌面软件，避免测试期间有其他程序写文件。
2. 找到真实内容库所在目录。下面把它记为 `$OriginalWorkspace`，不要直接修改它。
3. 打开 PowerShell，逐段复制下面内容。至少修改 `$OriginalWorkspace`；如果电脑没有 `D:` 盘，也把下面三个临时目录改到一个存在的盘符。四个目录必须彼此分开：

```powershell
$OriginalWorkspace = 'D:\请替换为真实内容库路径'
$TestWorkspace = 'D:\phase05-content-library-test'
$EvidenceRoot = 'D:\phase05-content-library-evidence'
$BackupRoot = 'D:\phase05-content-library-backup'
$AppRoot = 'F:\官媒投稿-refactor\auto—publish'

if (-not (Test-Path -LiteralPath $OriginalWorkspace -PathType Container)) {
  throw "原始内容库路径不存在，或不是目录：$OriginalWorkspace"
}
if ([IO.Path]::GetFullPath($OriginalWorkspace) -eq [IO.Path]::GetFullPath($TestWorkspace)) {
  throw '测试目录不能与原始内容库相同'
}

New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
if (Test-Path -LiteralPath $TestWorkspace) { Remove-Item -LiteralPath $TestWorkspace -Recurse -Force }
if (Test-Path -LiteralPath $BackupRoot) { Remove-Item -LiteralPath $BackupRoot -Recurse -Force }
Copy-Item -LiteralPath $OriginalWorkspace -Destination $TestWorkspace -Recurse -Force

Write-Host "测试副本已创建：$TestWorkspace"
Write-Host "原始内容库未被修改：$OriginalWorkspace"
```

如果你不确定 `$OriginalWorkspace` 是哪个目录，不要猜路径，先把目录位置发给 Codex。

## 二、记录副本的初始文件指纹

这一步用于证明 rollback 后文件逐字节恢复。复制执行：

```powershell
function Get-TreeManifest($Root) {
  $Root = [IO.Path]::GetFullPath($Root).TrimEnd('\\')
  Get-ChildItem -LiteralPath $Root -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($Root.Length).TrimStart('\\')
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    "$relative|$($_.Length)|$hash"
  } | Sort-Object
}

$BeforeManifest = Get-TreeManifest $TestWorkspace
$BeforeManifest | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'before-tree.txt') -Encoding UTF8
```

## 三、执行 dry-run（只读检查）

复制执行：

```powershell
Set-Location $AppRoot
node scripts/migrate-content-metadata-v1.js --dry-run --workspace $TestWorkspace --backup $BackupRoot 2>&1 |
  Tee-Object -FilePath (Join-Path $EvidenceRoot 'dry-run.json')
```

然后检查报告：

```powershell
$DryRun = Get-Content (Join-Path $EvidenceRoot 'dry-run.json') -Raw | ConvertFrom-Json
$DryRun.mode
$DryRun.writes
$DryRun.repairItems.Count
```

预期：

- `mode` 为 `dry-run`；
- 命令没有报错；
- `repairItems.Count` 必须为 `0`；
- `writes` 可以大于 `0`，表示有旧 metadata 需要升级。

如果 `repairItems.Count` 不为 `0`，立刻停止，不要执行下一步。把 `dry-run.json` 发给 Codex。

## 四、在副本上执行 migration

只有第三步通过后才执行：

```powershell
node scripts/migrate-content-metadata-v1.js --execute --confirm --workspace $TestWorkspace --backup $BackupRoot 2>&1 |
  Tee-Object -FilePath (Join-Path $EvidenceRoot 'execute.json')
```

检查 manifest：

```powershell
$ManifestPath = Join-Path $BackupRoot 'content-metadata-v1-manifest.json'
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Manifest.state
```

预期 `state` 为 `COMMITTED`。如果命令失败，不要删除测试目录、backup 或 manifest，把 `execute.json` 和 manifest 发给 Codex。

## 五、验证迁移后的副本

对已经迁移的副本再次执行只读 dry-run：

```powershell
node scripts/migrate-content-metadata-v1.js --dry-run --workspace $TestWorkspace --backup $BackupRoot 2>&1 |
  Tee-Object -FilePath (Join-Path $EvidenceRoot 'after-execute-dry-run.json')
```

此时应当看到 `repairItems.Count` 为 `0`，并且 `writes` 为 `0`。

如果你希望通过软件界面检查，可以在软件中选择 `$TestWorkspace` 作为工作区，只浏览客户、文章和历史记录，不要执行投稿、删除真实数据或登录生产账号。检查完成后关闭软件。

## 六、执行 rollback

确认第五步通过后，复制执行：

```powershell
Set-Location $AppRoot
node scripts/migrate-content-metadata-v1.js --rollback --workspace $TestWorkspace --backup $BackupRoot 2>&1 |
  Tee-Object -FilePath (Join-Path $EvidenceRoot 'rollback.json')
```

预期命令成功，并且 manifest 的 `state` 为 `ROLLED_BACK`：

```powershell
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Manifest.state
```

## 七、确认 rollback 逐文件恢复

复制执行：

```powershell
$AfterRollbackManifest = Get-TreeManifest $TestWorkspace
$AfterRollbackManifest | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'after-rollback-tree.txt') -Encoding UTF8

$Difference = Compare-Object $BeforeManifest $AfterRollbackManifest
if ($Difference) {
  $Difference | Format-List
  throw 'rollback 后文件指纹不一致，不能通过人工验收'
}
Write-Host 'rollback 后文件指纹与迁移前完全一致'
```

没有任何输出差异，并看到最后一行成功提示，才算通过 rollback 验收。

## 八、遇到 NEEDS_REPAIR 时怎么做

看到 `NEEDS_REPAIR`、`CONTENT_METADATA_RECOVERY_CONFLICT`、symlink/junction、hash mismatch 或任何不理解的错误时：

1. 立即停止，不要手动删除 workspace、`.staging-*`、`.before-*`、`.restore-*` 或 backup。
2. 不要自行追加 `--confirm-repair`。这个参数会允许显式重试恢复，必须先让 Codex检查证据。
3. 保留 `$TestWorkspace`、`$BackupRoot` 和 `$EvidenceRoot`，把错误输出、manifest 和目录列表发给 Codex。

如果只是进程在安全阶段中断，Codex可能会让你执行普通 `--recover`；只有 Codex明确确认证据完整时才执行。

## 九、提交给 Codex 的验收证据

完成后，把以下信息整体发给 Codex：

```text
测试副本：<TestWorkspace 实际路径>
证据目录：<EvidenceRoot 实际路径>
dry-run：通过/失败
execute：通过/失败
execute 后再次 dry-run：通过/失败
rollback：通过/失败
rollback 后 SHA-256 指纹比较：通过/失败
manifest 最终 state：COMMITTED 后再 ROLLED_BACK / 其他
是否访问投稿平台、支付系统或生产系统：否
```

不要把真实内容文件上传到聊天中；只提供命令输出、JSON 报告和错误信息即可。

## 十、清理测试副本

只有 Codex确认已收集完证据后，才可以删除测试目录和 backup：

```powershell
Remove-Item -LiteralPath $TestWorkspace -Recurse -Force
Remove-Item -LiteralPath $BackupRoot -Recurse -Force
```

原始内容库 `$OriginalWorkspace` 不应被删除或覆盖。

完成本文不等于自动把 Phase 05 标记为 `COMPLETE`。Codex还需要复核证据并更新账本、交接文档，之后才能决定是否完成阶段和创建里程碑提交。
