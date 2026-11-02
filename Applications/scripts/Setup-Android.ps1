$ErrorActionPreference='Stop'
$toolsRoot=Join-Path $env:LOCALAPPDATA 'TableTalkBuildTools'
New-Item -ItemType Directory -Force -Path "$toolsRoot/downloads" | Out-Null
$jdk=(Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse')[0].binary.package
$jdkZip="$toolsRoot/downloads/jdk21.zip"
if (!(Test-Path "$toolsRoot/java")) {
  Invoke-WebRequest $jdk.link -OutFile $jdkZip
  if ((Get-FileHash $jdkZip -Algorithm SHA256).Hash -ne $jdk.checksum) { throw 'JDK checksum mismatch' }
  Expand-Archive -LiteralPath $jdkZip -DestinationPath "$toolsRoot/java"
}
[xml]$repo=(Invoke-WebRequest 'https://dl.google.com/android/repository/repository2-3.xml').Content
$package=$repo.SelectNodes('//*[local-name()="remotePackage"]') | Where-Object { $_.path -eq 'cmdline-tools;latest' }
$archive=$package.SelectNodes('.//*[local-name()="archive"]') | Where-Object { $_.'host-os' -eq 'windows' }
if (!(Test-Path "$toolsRoot/android-cli/cmdline-tools/bin/sdkmanager.bat")) {
  $sdkZip="$toolsRoot/downloads/android-cli.zip"
  Invoke-WebRequest ("https://dl.google.com/android/repository/"+$archive.complete.url) -OutFile $sdkZip
  if ((Get-FileHash $sdkZip -Algorithm SHA1).Hash -ne $archive.complete.checksum.InnerText) { throw 'Android command-line tools checksum mismatch' }
  Expand-Archive -LiteralPath $sdkZip -DestinationPath "$toolsRoot/android-cli"
}
Write-Output "Build tools prepared at $toolsRoot. Run Android-Licences.ps1 yourself to review SDK licences."
