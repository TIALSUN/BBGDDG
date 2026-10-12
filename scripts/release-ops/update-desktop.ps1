param([ValidateSet('Stage','Activate','Verify')][string]$Mode)
$ErrorActionPreference='Stop'
$taskRepo=(Resolve-Path -LiteralPath (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)).Path
$taskOuter=Split-Path (Split-Path $taskRepo -Parent) -Parent
$taskOutputs=(Resolve-Path -LiteralPath (Join-Path $taskOuter 'outputs')).Path
$taskCurrent=Join-Path $taskOutputs 'current'
$taskStaged=Join-Path $taskOutputs 'current-1.3.0-staged'
$taskRelease=Join-Path $taskRepo 'release'
$taskSnapshot=Join-Path $taskRelease 'personal-data-before.json'
$taskSeal=Join-Path $taskRelease 'staged-desktop-manifest.json'
function Assert-OutputPath([string]$Path){$taskFull=[IO.Path]::GetFullPath($Path);if(-not $taskFull.StartsWith($taskOutputs+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Target escapes outputs workspace'}}
function Get-Manifest([string]$Root){if(-not(Test-Path -LiteralPath $Root)){return @()};return @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force | ForEach-Object {[pscustomobject]@{Relative=$_.FullName.Substring($Root.Length+1);Bytes=$_.Length;SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}} | Sort-Object Relative)}
function Get-PersonalManifest { $taskUserRoot=Join-Path $env:APPDATA 'BBGDDG';$taskManifest=@(Get-Manifest (Join-Path $taskUserRoot 'data'));$taskProtectedKey=Join-Path $taskUserRoot 'ai-secret-key.bin';if(Test-Path -LiteralPath $taskProtectedKey){$taskManifest+=@([pscustomobject]@{Relative='protected-account-key';Bytes=(Get-Item -LiteralPath $taskProtectedKey).Length;SHA256=(Get-FileHash -LiteralPath $taskProtectedKey -Algorithm SHA256).Hash})};return $taskManifest }
function Assert-PersonalData { $taskBefore=Get-Content -LiteralPath $taskSnapshot -Raw;$taskAfter=ConvertTo-Json -InputObject @(Get-PersonalManifest) -Depth 4 -Compress;if($taskBefore.Trim() -cne $taskAfter){throw 'Personal data changed during update; inspect before proceeding'} }
Assert-OutputPath $taskCurrent;Assert-OutputPath $taskStaged
if($Mode -eq 'Stage'){
 $taskSource=(Resolve-Path -LiteralPath (Join-Path $taskRelease 'win-unpacked')).Path
 if((Get-Item -LiteralPath (Join-Path $taskSource 'BBGDDG.exe')).VersionInfo.ProductVersion -notlike '1.3.0*'){throw 'Unexpected source version'}
 if(-not(Test-Path -LiteralPath $taskStaged)){
  New-Item -ItemType Directory -Path $taskStaged | Out-Null
  Get-ChildItem -LiteralPath $taskSource -Force | Copy-Item -Destination $taskStaged -Recurse -Force
 }
 $taskManifest=@(Get-Manifest $taskSource)
 $taskExpected=ConvertTo-Json -InputObject $taskManifest -Depth 4 -Compress
 $taskActual=ConvertTo-Json -InputObject @(Get-Manifest $taskStaged) -Depth 4 -Compress
 if($taskExpected -cne $taskActual){throw 'Staged application differs from tested package'}
 [pscustomobject]@{Version='1.3.0';Source=$taskSource;Manifest=$taskManifest}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $taskSeal
 [pscustomobject]@{Stage='verified';Files=$taskManifest.Count;Seal=$taskSeal}|ConvertTo-Json -Compress
}elseif($Mode -eq 'Activate'){
 $taskRunning=@(Get-Process BBGDDG -ErrorAction SilentlyContinue)
 if($taskRunning.Count){throw 'Current BBGDDG is running; close normally before activation'}
 if(-not(Test-Path -LiteralPath $taskSeal) -or -not(Test-Path -LiteralPath $taskStaged)){throw 'Missing staged verification record or application'}
 $taskVerified=Get-Content -LiteralPath $taskSeal -Raw|ConvertFrom-Json
 if($taskVerified.Version -ne '1.3.0' -or -not $taskVerified.Source -or -not $taskVerified.Manifest.Count){throw 'Invalid staged verification record'}
 $taskExpected=ConvertTo-Json -InputObject @($taskVerified.Manifest) -Depth 4 -Compress
 $taskActual=ConvertTo-Json -InputObject @(Get-Manifest $taskStaged) -Depth 4 -Compress
 if($taskExpected -cne $taskActual){throw 'Staged application differs from successful verification'}
 if((Get-Item -LiteralPath (Join-Path $taskStaged 'BBGDDG.exe')).VersionInfo.ProductVersion -notlike '1.3.0*'){throw 'Invalid staged verification version'}
 ConvertTo-Json -InputObject @(Get-PersonalManifest) -Depth 4 -Compress | Set-Content -LiteralPath $taskSnapshot
 $taskBackup=Join-Path $taskOutputs ('previous-before-1.3.0-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))
 Assert-OutputPath $taskBackup
 if(Test-Path -LiteralPath $taskBackup){throw 'Backup target exists'}
 Move-Item -LiteralPath $taskCurrent -Destination $taskBackup
 [pscustomobject]@{State='old-app-backed-up';PreviousApp=$taskBackup;Current=$taskCurrent}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskRelease 'activation-state.json')
 try{Move-Item -LiteralPath $taskStaged -Destination $taskCurrent}catch{if(-not(Test-Path -LiteralPath $taskCurrent)){Move-Item -LiteralPath $taskBackup -Destination $taskCurrent};throw}
 Assert-PersonalData
 $taskShell=New-Object -ComObject WScript.Shell
 $taskLinkPath=Join-Path ([Environment]::GetFolderPath('Desktop')) 'BBGDDG.lnk'
 if(Test-Path -LiteralPath $taskLinkPath){Copy-Item -LiteralPath $taskLinkPath -Destination (Join-Path $taskRelease 'prior-desktop-shortcut.lnk')}
 $taskLink=$taskShell.CreateShortcut($taskLinkPath);$taskLink.TargetPath=Join-Path $taskCurrent 'BBGDDG.exe';$taskLink.WorkingDirectory=$taskCurrent;$taskLink.IconLocation=$taskLink.TargetPath+',0';$taskLink.Save()
 [pscustomobject]@{State='activated';PreviousApp=$taskBackup;Current=$taskCurrent}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskRelease 'activation-state.json')
 [pscustomobject]@{Activated='1.3.0';PreviousApp=$taskBackup;PersonalData='unchanged';Shortcut=$taskLink.TargetPath}|ConvertTo-Json -Compress
}else{
 Assert-PersonalData
 $taskShell=New-Object -ComObject WScript.Shell;$taskLink=$taskShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'BBGDDG.lnk'))
 if($taskLink.TargetPath -ne (Join-Path $taskCurrent 'BBGDDG.exe')){throw 'Shortcut target mismatch'}
 $taskVersion=(Get-Item -LiteralPath (Join-Path $taskCurrent 'BBGDDG.exe')).VersionInfo.ProductVersion
 if($taskVersion -notlike '1.3.0*'){throw 'Current executable version mismatch'}
 [pscustomobject]@{CurrentVersion=$taskVersion;PersonalData='unchanged';Shortcut='verified'}|ConvertTo-Json -Compress
}
