$ErrorActionPreference='Stop'
$taskFixture=Join-Path $env:TEMP ('bbgddg-updater-fixture-'+[Guid]::NewGuid().ToString('N'))
$taskRepo=Join-Path $taskFixture 'work/repo'
$taskScripts=Join-Path $taskRepo 'scripts/release-ops'
New-Item -ItemType Directory -Force -Path $taskScripts,(Join-Path $taskRepo 'release'),(Join-Path $taskFixture 'outputs/current'),(Join-Path $taskFixture 'outputs/current-1.3.0-staged'),(Join-Path $taskFixture 'appdata')|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'update-desktop.ps1') -Destination (Join-Path $taskScripts 'update-desktop.ps1') -Force
$taskPayload=Join-Path $taskFixture 'outputs/current-1.3.0-staged/partial.txt'
'partial'|Set-Content -LiteralPath $taskPayload
$taskOriginalAppData=$env:APPDATA
$env:APPDATA=Join-Path $taskFixture 'appdata'
function Move-Item {throw 'LIVE_SWAP_REACHED'}
try {
 foreach($taskCase in @('missing-seal','tampered-stage')){
  if($taskCase -eq 'tampered-stage'){
   [pscustomobject]@{Version='1.3.0';Source='verified-source';Manifest=@([pscustomobject]@{Relative='partial.txt';Bytes=1;SHA256='0000'})}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $taskRepo 'release/staged-desktop-manifest.json')
  }
  $taskCaught=$null
  try{& (Join-Path $taskScripts 'update-desktop.ps1') Activate -Version '1.3.0'}catch{$taskCaught=$_.Exception.Message}
  if(-not $taskCaught -or $taskCaught -eq 'LIVE_SWAP_REACHED'){throw "FAIL $taskCase reached live swap without staged verification"}
  if($taskCaught -notmatch 'staged verification|Staged application differs'){throw "Unexpected failure: $taskCaught"}
  Write-Output "PASS $taskCase rejected before any move"
 }
}finally{$env:APPDATA=$taskOriginalAppData}
