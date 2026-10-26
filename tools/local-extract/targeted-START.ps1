param([string]$ClientView,[string]$ClientPath)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
# Supported Windows wheels: use 64-bit CPython 3.12, never the launcher's newest default.
$probeCode = "import sys,struct; print('supported' if sys.version_info[:2] == (3,12) and struct.calcsize('P') == 8 else 'unsupported')"
function Test-Python312([string]$Command, [string[]]$Arguments = @()) {
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $probe = & $Command @Arguments -c $probeCode 2>$null
        $code = $LASTEXITCODE
        return ($code -eq 0 -and ([string]$probe).Trim() -eq 'supported')
    } finally { $ErrorActionPreference = $oldPreference }
}
function Find-Python312 {
    if ((Get-Command py -ErrorAction SilentlyContinue) -and (Test-Python312 'py' @('-3.12'))) {
        return @{ Command = 'py'; Arguments = @('-3.12') }
    }
    $standard = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
    if ((Test-Path -LiteralPath $standard) -and (Test-Python312 $standard)) {
        return @{ Command = $standard; Arguments = @() }
    }
    if ((Get-Command python -ErrorAction SilentlyContinue) -and (Test-Python312 'python')) {
        return @{ Command = 'python'; Arguments = @() }
    }
    return $null
}
try {
    $python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
    if ((Test-Path -LiteralPath $python) -and -not (Test-Python312 $python)) {
        $backup = '.venv-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6)
        Rename-Item -LiteralPath (Join-Path $PSScriptRoot '.venv') -NewName $backup
        Write-Host ('Preserved incompatible Python environment as ' + $backup)
    }
    if (-not (Test-Path -LiteralPath $python)) {
        $bootstrap = Find-Python312
        if (-not $bootstrap) {
            Write-Host 'Installing Python 3.12 for this user. C++ Build Tools are not required.'
            $ErrorActionPreference = 'Continue'
            if (Get-Command py -ErrorAction SilentlyContinue) { & py install 3.12 }
            $ErrorActionPreference = 'Stop'
            $bootstrap = Find-Python312
            if (-not $bootstrap -and (Get-Command winget -ErrorAction SilentlyContinue)) {
                $ErrorActionPreference = 'Continue'
                & winget install --exact --id Python.Python.3.12 --architecture x64 --scope user --accept-package-agreements --accept-source-agreements --disable-interactivity
                $ErrorActionPreference = 'Stop'
                $bootstrap = Find-Python312
            }
        }
        if (-not $bootstrap) { throw 'Install 64-bit Python 3.12 from python.org, then run this script again. Python 3.15 cannot use this kit.' }
        # No sys.executable stdout round-trip; Korean Windows user paths remain intact.
        $bootstrapCommand = $bootstrap.Command
        $bootstrapArgs = $bootstrap.Arguments
        & $bootstrapCommand @bootstrapArgs -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 environment creation failed.' }
    }
    if (-not (Test-Python312 $python)) { throw 'The virtual environment must use 64-bit Python 3.12.' }
    $ErrorActionPreference = 'Continue'
    & $python -m pip install --disable-pip-version-check --only-binary=:all: --upgrade pip
    $upgradeExit = $LASTEXITCODE
    if ($upgradeExit -eq 0) {
        & $python -m pip install --disable-pip-version-check --only-binary=:all: --no-binary=tpk_ar -r tools\local-extract\requirements.txt
        $pipExit = $LASTEXITCODE
    } else { $pipExit = $upgradeExit }
    $ErrorActionPreference = 'Stop'
    if ($pipExit -ne 0) { throw 'Prebuilt dependency installation failed. Send the pip output; do not install C++ Build Tools.' }
    # The client: -ClientView (a prepared work\cn-client-* folder), -ClientPath (the installed CN game, prepared anew),
    # else the newest prepared folder, else the saved / chosen game folder.
    if (!$ClientView -and !$ClientPath) {
        $work = Join-Path $PSScriptRoot 'work'
        if (Test-Path -LiteralPath $work) {
            $latest = Get-ChildItem -LiteralPath $work -Directory -Filter 'cn-client-*' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latest) { $ClientView = $latest.FullName }
        }
    }
    if (!$ClientView -and !$ClientPath) {
        $saved = Join-Path $PSScriptRoot 'client-path.txt'
        if (Test-Path -LiteralPath $saved) { $ClientPath = (Get-Content -LiteralPath $saved -Raw -Encoding UTF8).Trim() }
        if (-not $ClientPath -or -not (Test-Path -LiteralPath $ClientPath)) {
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = 'Select the CHINESE Arknights PC client game folder (not the Korean client).'
            if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'No CN client folder selected.' }
            $ClientPath = $dialog.SelectedPath
            [System.IO.File]::WriteAllText($saved, $ClientPath, (New-Object System.Text.UTF8Encoding($false)))
        }
    }
    $argsForPython = @('-X','utf8','-u','tools/local-extract/targeted_recovery.py')
    if ($ClientPath) { $argsForPython += @('--client',$ClientPath) } else { $argsForPython += @('--root',$ClientView) }
    $catalog = Join-Path $PSScriptRoot 'skin_table.json'
    if (Test-Path -LiteralPath $catalog) { $argsForPython += @('--catalog',$catalog) }
    $log = Join-Path $PSScriptRoot ('targeted-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    $ErrorActionPreference = 'Continue'
    & $python @argsForPython 2>&1 | Tee-Object -FilePath $log
    $extractExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($extractExit -eq 2) { Write-Host ('Partial extraction. Upload the files listed after UPLOAD, targeted-report.json and this log: ' + $log) -ForegroundColor Yellow; exit 2 }
    if ($extractExit -ne 0) { throw ('Extraction failed. Upload the files listed after UPLOAD, targeted-report.json and this log: ' + $log) }
    Write-Host 'Completed. Upload the files listed after UPLOAD. Client files were not modified.'
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
