$ErrorActionPreference='Stop'
$appRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version=(Get-Content (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
$file="TableTalk3D-$version-play-upload.aab"
$bundle=Join-Path $appRoot "downloads/$file"
$javaRoot=(Get-ChildItem (Join-Path $env:LOCALAPPDATA 'TableTalkBuildTools/java') -Directory | Select-Object -First 1).FullName
$verification=& (Join-Path $javaRoot 'bin/jarsigner.exe') -verify $bundle 2>&1 | Out-String
if($LASTEXITCODE -ne 0 -or $verification -notmatch 'jar verified\.'){throw 'AAB signature verification failed or the bundle is unsigned.'}
$certificate=& (Join-Path $javaRoot 'bin/keytool.exe') -printcert -jarfile $bundle 2>&1 | Out-String
if($LASTEXITCODE -ne 0 -or $certificate -notmatch 'SHA256:\s*([A-Fa-f0-9:]+)'){throw 'Cannot read AAB signer certificate.'}
$actualFingerprint=$Matches[1].Replace(':','').ToLowerInvariant()
$pem=Get-Content (Join-Path $appRoot 'publishing/tabletalk-upload-certificate.pem') -Raw
$expected=[Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem($pem)
$expectedFingerprint=$expected.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant()
if($actualFingerprint -ne $expectedFingerprint){throw 'Bundle signer differs from the upload certificate.'}
if($expected.Subject -match 'Android Debug'){throw 'Upload bundle uses the debug certificate.'}
$archive=[IO.Compression.ZipFile]::OpenRead($bundle)
$webFiles=0
try {
    $nativeLibraries=@($archive.Entries | Where-Object { $_.FullName.EndsWith('.so') } | ForEach-Object FullName)
    $webRoot=Join-Path $appRoot 'web'
    foreach($webFile in Get-ChildItem -LiteralPath $webRoot -File -Recurse){
        $relative=[IO.Path]::GetRelativePath($webRoot,$webFile.FullName).Replace('\','/')
        $entry=$archive.GetEntry('base/assets/public/'+$relative)
        if(!$entry){throw "AAB is missing web asset: $relative"}
        $stream=$entry.Open();$algorithm=[Security.Cryptography.SHA256]::Create()
        try {$actual=[Convert]::ToHexString($algorithm.ComputeHash($stream))} finally {$stream.Dispose();$algorithm.Dispose()}
        if($actual -ne (Get-FileHash -LiteralPath $webFile.FullName -Algorithm SHA256).Hash){throw "AAB contains an older/different web asset: $relative"}
        $webFiles++
    }
} finally {$archive.Dispose()}
$report=[ordered]@{version=$version;file=$file;bytes=(Get-Item -LiteralPath $bundle).Length;sha256=(Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant();verified=$true;certificateMatches=$true;certificateSHA256=$expectedFingerprint;subject=$expected.Subject;certificateExpires=$expected.NotAfter.ToUniversalTime().ToString('o');webFilesCompared=$webFiles;allPackagedAssetsMatch=$true;nativeLibraries=$nativeLibraries;nativePageAlignment=if($nativeLibraries.Count -eq 0){'No native Android libraries; Unity is WebAssembly in the WebView.'}else{'Requires native-library alignment review.'};checkedAt=[DateTime]::UtcNow.ToString('o')}
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $appRoot "verification/upload-signing-$version.json")
$report | ConvertTo-Json -Depth 5
