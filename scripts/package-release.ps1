param([switch]$SkipStaticBuild)
$ErrorActionPreference='Stop'
$taskProject=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskVersion=(Get-Content -LiteralPath (Join-Path $taskProject 'package.json') -Raw | ConvertFrom-Json).version
if ($taskVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version.' }
$taskArtifacts=Join-Path $taskProject 'artifacts'
$taskStatic=[IO.Path]::GetFullPath((Join-Path $taskArtifacts 'release-static'))
if (-not $taskStatic.StartsWith($taskProject+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Static build target is outside the workspace.' }
New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null

if (-not $SkipStaticBuild) {
    $taskPreviousLocation=Get-Location
    $taskPreviousStatic=$env:VITE_STATIC_HOST
    $taskPreviousEndpoint=$env:VITE_MULTIPLAYER_URL
    try {
        Set-Location -LiteralPath $taskProject
        $env:VITE_STATIC_HOST='true'
        $env:VITE_MULTIPLAYER_URL=''
        & node node_modules/vite/bin/vite.js build --outDir $taskStatic
        if ($LASTEXITCODE -ne 0) { throw 'Static build failed.' }
    } finally {
        Set-Location -LiteralPath $taskPreviousLocation
        $env:VITE_STATIC_HOST=$taskPreviousStatic
        $env:VITE_MULTIPLAYER_URL=$taskPreviousEndpoint
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $taskStatic 'index.html'))) { throw 'The static build is missing.' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
function Write-GameArchive($taskName,$taskBase,$taskFiles) {
    $taskDestination=[IO.Path]::GetFullPath((Join-Path $taskArtifacts $taskName))
    if (-not $taskDestination.StartsWith($taskArtifacts+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Archive target is outside the project artifacts folder.' }
    if (Test-Path -LiteralPath $taskDestination) { Remove-Item -LiteralPath $taskDestination }
    $taskArchive=[IO.Compression.ZipFile]::Open($taskDestination,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($taskFile in $taskFiles) {
            $taskFull=[IO.Path]::GetFullPath($taskFile.FullName)
            if (-not $taskFull.StartsWith($taskBase+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'An archive input is outside its allowed folder.' }
            $taskRelative=$taskFull.Substring($taskBase.Length+1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive,$taskFull,$taskRelative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $taskArchive.Dispose() }
    Get-Item -LiteralPath $taskDestination | Select-Object Name,Length
}
$taskSourceFiles=@()
foreach ($taskDirectory in @('src','server','scripts','tests','public')) {
    $taskSourceFiles+=Get-ChildItem -LiteralPath (Join-Path $taskProject $taskDirectory) -Recurse -File | Where-Object { $_.Extension -notin @('.pyc','.pyo') -and $_.FullName -notmatch '[\\/]__pycache__[\\/]' }
}
foreach ($taskFileName in @('package.json','package-lock.json','index.html','vite.config.js','netlify.toml','render.yaml','.gitignore','.nvmrc','README.md','ART_PIPELINE.md','AI_AND_MAP_DESIGN.md','WATER_AND_WEATHER_DESIGN.md','GRAPHICS_LOADING_DESIGN.md','SIEGE_ART_DESIGN.md','DEPLOYMENT.md','RELEASE_CHECKS.md','ROADMAP.md','CHANGELOG.md','DEVELOPMENT_CHECKPOINT.md','QUALITY_TARGETS.md')) {
    $taskFilePath=Join-Path $taskProject $taskFileName
    if (Test-Path -LiteralPath $taskFilePath) { $taskSourceFiles+=Get-Item -LiteralPath $taskFilePath }
}
Write-GameArchive "crowns-of-the-frontier-$taskVersion-source.zip" $taskProject $taskSourceFiles
Write-GameArchive "crowns-of-the-frontier-$taskVersion-static.zip" $taskStatic (Get-ChildItem -LiteralPath $taskStatic -Recurse -File)
