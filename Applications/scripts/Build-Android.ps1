param([switch]$PrepareReleaseBundle,[switch]$SignRelease)
$ErrorActionPreference='Stop'
$toolsRoot=Join-Path $env:LOCALAPPDATA 'TableTalkBuildTools'
$env:JAVA_HOME=(Get-ChildItem "$toolsRoot/java" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME="$toolsRoot/sdk"
$signingNames=@('TABLETALK_UPLOAD_STORE','TABLETALK_UPLOAD_PASSWORD','TABLETALK_UPLOAD_ALIAS','TABLETALK_UPLOAD_KEY_PASSWORD')
$previousSigning=@{}
foreach($name in $signingNames){$previousSigning[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
if($SignRelease){
    $privateRoot=Join-Path $env:LOCALAPPDATA 'TableTalkSigning'
    $secretPath=Join-Path $privateRoot 'signing-secrets.xml'
    $keyPath=Join-Path $privateRoot 'tabletalk-upload.p12'
    if(!(Test-Path -LiteralPath $secretPath) -or !(Test-Path -LiteralPath $keyPath)){throw 'Run Initialize-UploadKey.ps1 before a signed release build.'}
    $saved=Import-Clixml -LiteralPath $secretPath
    $env:TABLETALK_UPLOAD_STORE=$keyPath
    $env:TABLETALK_UPLOAD_ALIAS=$saved.Alias
    $env:TABLETALK_UPLOAD_PASSWORD=[Net.NetworkCredential]::new('',$saved.Password).Password
    $env:TABLETALK_UPLOAD_KEY_PASSWORD=$env:TABLETALK_UPLOAD_PASSWORD
}
Push-Location (Join-Path $PSScriptRoot '../android')
try {
    $tableTalkBuildTasks=@('assembleDebug')
    if($PrepareReleaseBundle -or $SignRelease){$tableTalkBuildTasks+='bundleRelease'}
    & ./gradlew.bat @tableTalkBuildTasks --no-daemon
    if($LASTEXITCODE -ne 0){throw 'Android build failed'}
} finally {
    Pop-Location
    foreach($name in $signingNames){[Environment]::SetEnvironmentVariable($name,$previousSigning[$name],'Process')}
}
