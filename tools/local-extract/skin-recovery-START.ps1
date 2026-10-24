param([string]$ClientView,[string]$ClientPath,[string]$ReferenceVideo,[switch]$ModelsOnly)
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $OutputEncoding
Set-Location -LiteralPath $PSScriptRoot
try {
    $python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
    if (!(Test-Path -LiteralPath $python)) { throw 'Extract this add-on into the existing CN extraction kit folder containing .venv and work. Use the original Python 3.12 setup first if needed.' }
    & $python -c 'import UnityPy, PIL, lz4'
    if ($LASTEXITCODE -ne 0) { throw 'Required packages are absent in the existing environment. Use the original Python 3.12 kit setup.' }
    if (!$ClientView -and !$ClientPath) {
        $work = Join-Path $PSScriptRoot 'work'
        if (Test-Path -LiteralPath $work) {
            $latest = Get-ChildItem -LiteralPath $work -Directory -Filter 'cn-client-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latest) { $ClientView = $latest.FullName }
        }
        if (!$ClientView) {
            $saved = Join-Path $PSScriptRoot 'client-path.txt'
            if (Test-Path -LiteralPath $saved) { $ClientPath = (Get-Content -LiteralPath $saved -Raw -Encoding UTF8).Trim() }
        }
        if (!$ClientView -and !$ClientPath) {
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = 'Select the CHINESE Arknights PC client game folder.'
            if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'No CN client selected.' }
            $ClientPath = $dialog.SelectedPath
        }
    }
    $argsForPython = @('-X','utf8','-u','tools/local-extract/skin_recovery.py')
    if ($ModelsOnly) { $argsForPython += '--models-only' }
    if ($ClientPath) { $argsForPython += @('--client',$ClientPath) } else { $argsForPython += @('--root',$ClientView) }
    if (!$ReferenceVideo -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'reference-video.mp4'))) { $ReferenceVideo = Join-Path $PSScriptRoot 'reference-video.mp4' }
    if ($ReferenceVideo) { $argsForPython += @('--reference-video',$ReferenceVideo) }
    $catalog = Join-Path $PSScriptRoot 'skin_table.json'
    if (Test-Path -LiteralPath $catalog) { $argsForPython += @('--catalog',$catalog) }
    $log = Join-Path $PSScriptRoot ('skin-recovery-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    $ErrorActionPreference = 'Continue'
    & $python @argsForPython 2>&1 | Tee-Object -FilePath $log
    $extractExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($extractExit -eq 2) { Write-Host ('Partial extraction. Upload the files listed after UPLOAD and the report (model-repair-report.json for -ModelsOnly, otherwise recovery-report.json). Log: ' + $log) -ForegroundColor Yellow; exit 2 }
    if ($extractExit -ne 0) { throw ('Extraction is partial or failed. Upload the files listed after UPLOAD, recovery-report.json and this log: ' + $log) }
    Write-Host 'Completed. Upload the files listed after UPLOAD. Client files were not modified.'
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
