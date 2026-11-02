from pathlib import Path
import zipfile,re,json
import UnityPy
UnityPy.config.FALLBACK_UNITY_VERSION='6000.0.49f1'
root=Path(__file__).resolve().parents[1]/'tmp/maps-native';root.mkdir(parents=True,exist_ok=True)
archive=Path(r'C:/Users/Divan/Documents/Codex/2026-10-19/in-x20/outputs/Game_Assets_Extracted.zip')
with zipfile.ZipFile(archive) as z:
    for record in z.infolist():
        name=Path(record.filename).name
        if '/Unity_Native/assets/bin/Data/' not in record.filename or not re.fullmatch(r'(level\d+|sharedassets\d+\.(assets|resource|resS))',name):continue
        target=root/name
        if not target.exists():target.write_bytes(z.read(record))
results=[]
for index in range(4,15):
    env=UnityPy.load(str(root/f'level{index}'))
    names=[obj.read().m_Name for obj in env.objects if obj.type.name=='GameObject']
    selected=sorted({name for name in names if re.match(r'Combined.*Theme\d+',name)})
    results.append({'level':index,'groups':selected})
    print(json.dumps(results[-1]),flush=True)
(root/'inventory.json').write_text(json.dumps(results,indent=2))
