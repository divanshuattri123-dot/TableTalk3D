"""Compare the shipped WebView assets, not merely the APK build exit code."""
import hashlib
import json
import re
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
version_code = int(re.search(r'versionCode (\d+)', (root / 'android/app/build.gradle').read_text())[1])
apk = root / 'downloads' / f'TableTalk3D-{version}-test.apk'
raw = apk.read_bytes()
mismatches = []
count = 0
with zipfile.ZipFile(apk) as archive:
    expected = {'assets/public/'+file.relative_to(root / 'web').as_posix()
                for file in (root / 'web').rglob('*') if file.is_file()}
    bridge_files = {'assets/public/cordova.js', 'assets/public/cordova_plugins.js'}
    unexpected = sorted(name for name in archive.namelist() if name.startswith('assets/public/')
                        and not name.endswith('/') and name not in expected | bridge_files)
    for file in (root / 'web').rglob('*'):
        if not file.is_file():
            continue
        relative = file.relative_to(root / 'web').as_posix()
        entry = 'assets/public/' + relative
        if entry not in archive.namelist() or archive.read(entry) != file.read_bytes():
            mismatches.append(relative)
        count += 1
report = {
    'version': version, 'versionCode': version_code, 'apkBytes': len(raw),
    'sha256': hashlib.sha256(raw).hexdigest(),
    'unity': json.loads((root / 'web/unity/release.json').read_text()),
    'webFilesCompared': count, 'mismatches': mismatches,
    'unexpectedPublicAssets': unexpected,
    'allPackagedAssetsMatch': not mismatches and not unexpected,
}
(root / f'verification/mobile-{version}-package.json').write_text(json.dumps(report, indent=2)+'\n')
if mismatches or unexpected:
    raise RuntimeError('APK web assets differ: ' + ', '.join(mismatches + unexpected))
manifest = root / 'verification/downloads.json'
downloads = [item for item in json.loads(manifest.read_text()) if item['file'] != apk.name]
downloads.append({'file': apk.name, 'bytes': len(raw), 'sha256': report['sha256']})
manifest.write_text(json.dumps(downloads, indent=2)+'\n')
print(json.dumps(report, indent=2))
