$toolsRoot=Join-Path $env:LOCALAPPDATA 'TableTalkBuildTools'
$env:JAVA_HOME=(Get-ChildItem "$toolsRoot/java" -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME="$toolsRoot/sdk"
Write-Host 'Please review the Android SDK licences yourself. Accept only if you agree.'
& "$toolsRoot/android-cli/cmdline-tools/bin/sdkmanager.bat" "--sdk_root=$env:ANDROID_HOME" --licenses
if ($LASTEXITCODE -eq 0) {
  & "$toolsRoot/android-cli/cmdline-tools/bin/sdkmanager.bat" "--sdk_root=$env:ANDROID_HOME" 'platform-tools' 'platforms/android-36' 'build-tools/36.0.0'
}
