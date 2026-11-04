$ErrorActionPreference='Stop'
$toolsRoot=Join-Path $env:LOCALAPPDATA 'TableTalkBuildTools'
$javaRoot=(Get-ChildItem (Join-Path $toolsRoot 'java') -Directory | Select-Object -First 1).FullName
$privateRoot=Join-Path $env:LOCALAPPDATA 'TableTalkSigning'
$keyPath=Join-Path $privateRoot 'tabletalk-upload.p12'
$secretPath=Join-Path $privateRoot 'signing-secrets.xml'
$publicCertificate=Join-Path $PSScriptRoot '../publishing/tabletalk-upload-certificate.pem'
$alias='tabletalk-upload'
New-Item -ItemType Directory -Path $privateRoot -Force | Out-Null
if ((Test-Path -LiteralPath $keyPath) -xor (Test-Path -LiteralPath $secretPath)) {
    throw 'Only part of the signing setup exists. Restore its matching key and credentials; do not generate a replacement.'
}
$previousPassword=$env:TABLETALK_KEY_SETUP_PASSWORD
try {
    if (-not (Test-Path -LiteralPath $keyPath)) {
        $passwordBytes=[byte[]]::new(32)
        [Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
        $env:TABLETALK_KEY_SETUP_PASSWORD=[Convert]::ToBase64String($passwordBytes)
        & (Join-Path $javaRoot 'bin/keytool.exe') -genkeypair -keystore $keyPath -storetype PKCS12 -alias $alias -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10000 -dname 'CN=Da Publications, OU=Game Publishing, O=Da Publications, C=IN' -storepass:env TABLETALK_KEY_SETUP_PASSWORD -keypass:env TABLETALK_KEY_SETUP_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Upload key generation failed.' }
        # DPAPI binds the credential file to this Windows user; the repository gets only the public certificate.
        [pscustomobject]@{Alias=$alias;Password=(ConvertTo-SecureString $env:TABLETALK_KEY_SETUP_PASSWORD -AsPlainText -Force)} | Export-Clixml -LiteralPath $secretPath
    } else {
        $saved=Import-Clixml -LiteralPath $secretPath
        $env:TABLETALK_KEY_SETUP_PASSWORD=[Net.NetworkCredential]::new('',$saved.Password).Password
    }
    & (Join-Path $javaRoot 'bin/keytool.exe') -exportcert -rfc -keystore $keyPath -alias $alias -storepass:env TABLETALK_KEY_SETUP_PASSWORD -file $publicCertificate
    if ($LASTEXITCODE -ne 0) { throw 'Public certificate export failed.' }
    Write-Output "Upload key prepared outside the repository: $keyPath"
    Write-Output 'Passwords were not printed. Back up the keystore and arrange a recoverable credential backup before Play submission.'
} finally { $env:TABLETALK_KEY_SETUP_PASSWORD=$previousPassword }
