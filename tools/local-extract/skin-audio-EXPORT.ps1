param([string]$ClientView)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Copy this add-on into the existing extraction kit folder, beside START.ps1 and .venv.' }
if (!$ClientView) {
    $work = Join-Path $PSScriptRoot 'work'
    $latest = $null
    if (Test-Path -LiteralPath $work) {
        $latest = Get-ChildItem -LiteralPath $work -Directory -Filter 'cn-client-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (!$latest) {
            $latest = Get-ChildItem -LiteralPath $work -Directory -Filter 'client-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        }
    }
    if (!$latest) { throw 'No prepared CN client found in work. Pass -ClientView with the full path to your cn-client-* folder.' }
    $ClientView = $latest.FullName
}
$out = Join-Path $PSScriptRoot ('cn-missing-fx-audio-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6))
& $python -u tools/local-extract/missing_fx_audio.py --root $ClientView --kit $PSScriptRoot --out $out
if ($LASTEXITCODE -ne 0) { throw 'Extraction incomplete. Keep the output ZIP and supplement-report.json.' }
Write-Host ('Output: ' + $out)
