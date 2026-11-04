$ErrorActionPreference='Stop'
$appRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRoot=(Resolve-Path (Join-Path $appRoot '..')).Path
$previousAssets=$env:TABLETALK_ASSET_SOURCE
Push-Location $repoRoot
try {
    $env:TABLETALK_ASSET_SOURCE=Join-Path $appRoot 'player-assets'
    & node Applications/scripts/bundle.mjs --play-test
    if($LASTEXITCODE -ne 0){throw 'Web bundle failed.'}
    Push-Location $appRoot
    try {& npm run sync:android;if($LASTEXITCODE -ne 0){throw 'Android asset sync failed.'}} finally {Pop-Location}
    & (Join-Path $PSScriptRoot 'Build-Android.ps1') -SignRelease
    if($LASTEXITCODE -ne 0){throw 'Android build failed.'}
    $version=(Get-Content (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
    Copy-Item -LiteralPath (Join-Path $appRoot 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination (Join-Path $appRoot "downloads/TableTalk3D-$version-test.apk")
    Copy-Item -LiteralPath (Join-Path $appRoot 'android/app/build/outputs/bundle/release/app-release.aab') -Destination (Join-Path $appRoot "downloads/TableTalk3D-$version-play-upload.aab")
    & python Applications/scripts/verify-android-package.py
    if($LASTEXITCODE -ne 0){throw 'APK does not match the built web assets.'}
    & (Join-Path $PSScriptRoot 'Verify-UploadBundle.ps1')
    if($LASTEXITCODE -ne 0){throw 'Signed AAB verification failed.'}
    & node Applications/scripts/check-release-readiness.mjs
    if($LASTEXITCODE -ne 0){throw 'Artifact readiness check failed.'}
} finally {Pop-Location;$env:TABLETALK_ASSET_SOURCE=$previousAssets}
