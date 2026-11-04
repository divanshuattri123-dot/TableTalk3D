# Android upload signing

The upload key is local, outside this public repository:

`%LOCALAPPDATA%\TableTalkSigning\tabletalk-upload.p12`

Its credential is protected for this Windows user with DPAPI in
`%LOCALAPPDATA%\TableTalkSigning\signing-secrets.xml`. Neither file is committed.
The public PEM certificate in this directory can be shared with Play Console.
Gradle reads signing values only from the build process environment, and the
PowerShell build wrapper restores that environment when it finishes.

Prepare/reuse the key:

```powershell
./Applications/scripts/Initialize-UploadKey.ps1
```

Build the signed upload AAB with the same key:

```powershell
./Applications/scripts/Build-Android.ps1 -SignRelease
```

The normal debug APK remains signed with its existing Android Debug certificate,
so direct test updates preserve their signing identity. The upload AAB has a
different upload certificate; Play App Signing determines the certificate of
APKs distributed through Google Play. Do not promise a direct debug installation
will update to the eventual Play version without reinstallation.

Before Play submission, arrange an independently recoverable backup of the
keystore and its password. Copying the DPAPI XML to another computer does not
make the credential decryptable there. Do not post the private key/password in
chat, GitHub, release assets or support issues. The current local setup is not a
verified disaster-recovery backup.

Verification must establish that the AAB is signed, its signer fingerprint
matches the exported certificate, the current artifact hash is recorded, and the
bundle is not signed with the debug certificate. A build success alone does not
prove signing. Reuse this upload key; do not regenerate it for routine builds.

Reference: https://developer.android.com/studio/publish/app-signing
