$ErrorActionPreference = 'Stop'

# Resolve all paths against this script, never against a caller's current
# directory. Packaging reads only extension sources and writes one ZIP file.
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $projectRoot 'extension'
$manifestPath = Join-Path $extensionRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$distRoot = Join-Path $projectRoot 'dist'
$archivePath = Join-Path $distRoot ('nblogdl-chrome-' + $manifest.version + '.zip')
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
Write-Output '[package] source=extension'

# Include LICENSE and every runtime source; omit research notes and test
# artifacts so the unpacked archive itself is the loadable extension folder.
Compress-Archive -Path (Join-Path $extensionRoot '*') -DestinationPath $archivePath -Force
Write-Output ('[package] archive=dist/nblogdl-chrome-' + $manifest.version + '.zip')
Write-Output '[package] complete'
