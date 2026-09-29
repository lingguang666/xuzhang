$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw -LiteralPath (Join-Path $repo 'package.json') | ConvertFrom-Json).version
$cache = Join-Path $repo '.build/downloads'
$stage = Join-Path $repo ('.build/xuzhang-' + $version + '-windows-x64')
$dist = Join-Path $repo 'dist'
New-Item -ItemType Directory -Force -Path $cache,$dist | Out-Null
if (Test-Path -LiteralPath $stage) { throw "Build directory exists: $stage. Rename it before rebuilding." }
New-Item -ItemType Directory -Path $stage | Out-Null
function Fetch-Verified($url, $name, $sha) {
    $target = Join-Path $cache $name
    if (!(Test-Path -LiteralPath $target)) { Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha) { throw "Checksum mismatch: $name" }
    return $target
}
$nodeZip = Fetch-Verified 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' 'node.zip' '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'
$pythonZip = Fetch-Verified 'https://www.python.org/ftp/python/3.13.15/python-3.13.15-embed-amd64.zip' 'python.zip' 'd1f04d990aee1253d8569e8e5104e30fa9f5fa830899f14843448872d936a2cf'
$wheel = Fetch-Verified 'https://files.pythonhosted.org/packages/55/f2/7ebe366f633f30a6ad105f650f44f24f98cb1335c4157d21ae47138b3482/pypdf-6.10.0-py3-none-any.whl' 'pypdf.zip' '90005e959e1596c6e6c84c8b0ad383285b3e17011751cedd17f2ce8fcdfc86de'
$nodeUnzip=Join-Path $stage '_node'
Expand-Archive -LiteralPath $nodeZip -DestinationPath $nodeUnzip
New-Item -ItemType Directory -Path (Join-Path $stage 'runtime/node'),(Join-Path $stage 'runtime/python') | Out-Null
Copy-Item -LiteralPath (Join-Path $nodeUnzip 'node-v24.21.0-win-x64/node.exe') -Destination (Join-Path $stage 'runtime/node')
Copy-Item -LiteralPath (Join-Path $nodeUnzip 'node-v24.21.0-win-x64/LICENSE') -Destination (Join-Path $stage 'runtime/node/LICENSE')
# This is the verified temporary runtime extraction created above, inside this build only.
$resolvedUnzip = (Resolve-Path -LiteralPath $nodeUnzip).Path
if (!$resolvedUnzip.StartsWith((Resolve-Path -LiteralPath $stage).Path + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe temporary path' }
Remove-Item -LiteralPath $resolvedUnzip -Recurse -Force
Expand-Archive -LiteralPath $pythonZip -DestinationPath (Join-Path $stage 'runtime/python')
Expand-Archive -LiteralPath $wheel -DestinationPath (Join-Path $stage 'runtime/python')
& (Join-Path $stage 'runtime/node/node.exe') (Join-Path $repo 'scripts/build.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
# Explicit source allowlist; never copy a development data directory or browser export.
$files = 'app.js','index.html','style.css','server.js','store.js','runtime.cjs','launcher.cjs','mcp-server.js','manuscript.json','paper-presets.js','relations.js','draft-edit.js','asset-search.js','extract_asset.py','claims.js','discussion-review.js','package.json','package-lock.json','LICENSE','README.md','THIRD_PARTY_NOTICES.md','Start-Xuzhang.cmd','Stop-Xuzhang.cmd','Open-Data.cmd'
foreach($file in $files) { Copy-Item -LiteralPath (Join-Path $repo $file) -Destination $stage }
Copy-Item -LiteralPath (Join-Path $repo 'docs') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'node_modules') -Destination $stage -Recurse
# ZipFile includes dependency files whose Windows hidden attribute would be skipped by Compress-Archive.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $dist ('xuzhang-' + $version + '-windows-x64.zip')
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$zip,[IO.Compression.CompressionLevel]::Optimal,$true)
$sum = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $dist 'SHA256SUMS.txt'),$sum + '  ' + [IO.Path]::GetFileName($zip) + "`n")
Write-Output "Built: $zip"
