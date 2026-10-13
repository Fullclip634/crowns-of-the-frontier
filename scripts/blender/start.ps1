param([switch]$Visible,[switch]$Showcase,[switch]$LowPreview)

$ErrorActionPreference = 'Stop'
$taskProject = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskTools = Join-Path $taskProject '.tools'
$taskBlender = Join-Path $taskTools 'blender-4.5.14-windows-x64\blender.exe'
$taskProfile = Join-Path $taskTools 'blender-profile'
$taskLog = Join-Path $taskTools 'blender-stdout.log'
$taskErrorLog = Join-Path $taskTools 'blender-stderr.log'

if (-not (Test-Path -LiteralPath $taskBlender)) {
    throw 'Project Blender installation is missing.'
}

# A duplicate instance would compete for the same connector port.
$taskExisting = Get-Process blender -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $taskBlender }
if ($taskExisting) {
    $taskExisting | Select-Object Id,ProcessName
    return
}

$taskPreviousConfig = $env:BLENDER_USER_CONFIG
$taskPreviousScripts = $env:BLENDER_USER_SCRIPTS
try {
    $env:BLENDER_USER_CONFIG = Join-Path $taskProfile 'config'
    $env:BLENDER_USER_SCRIPTS = Join-Path $taskProfile 'scripts'
    $taskWindow = if ($Visible) { 'Normal' } else { 'Hidden' }
    $taskStartup = @{}
    if ($Showcase) {
        $taskScript = Join-Path $taskProject 'scripts\blender\showcase.py'
        $taskStartup.ArgumentList = @('--python', ('"' + $taskScript + '"'))
        if ($LowPreview) { $taskStartup.ArgumentList += @('--', '--low-preview') }
    }
    Start-Process -FilePath $taskBlender -WorkingDirectory $taskProject @taskStartup `
        -WindowStyle $taskWindow -RedirectStandardOutput $taskLog `
        -RedirectStandardError $taskErrorLog -PassThru |
        Select-Object Id,ProcessName
} finally {
    $env:BLENDER_USER_CONFIG = $taskPreviousConfig
    $env:BLENDER_USER_SCRIPTS = $taskPreviousScripts
}
