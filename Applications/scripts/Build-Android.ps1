param([switch]$PrepareReleaseBundle)
$ErrorActionPreference='Stop'
$toolsRoot=Join-Path $env:LOCALAPPDATA 'TableTalkBuildTools'
$env:JAVA_HOME=(Get-ChildItem "$toolsRoot/java" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME="$toolsRoot/sdk"
Push-Location (Join-Path $PSScriptRoot '../android')
try {
    $tableTalkBuildTasks=@('assembleDebug')
    if($PrepareReleaseBundle){$tableTalkBuildTasks+='bundleRelease'}
    & ./gradlew.bat @tableTalkBuildTasks --no-daemon
    if($LASTEXITCODE -ne 0){throw 'Android build failed'}
} finally { Pop-Location }
