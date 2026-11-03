import {cp,mkdir,readFile,readdir,stat,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../..',import.meta.url));
const version=JSON.parse(await readFile(path.join(root,'Applications/package.json'),'utf8')).version;
const stage=path.join(root,`tmp/worker-release-${version.replaceAll('.','')}`);
const source=path.resolve(root,'../../2026-10-19/build-a-browser-based-multiplayer-monopoly/public');
await mkdir(stage,{recursive:true});
await cp(source,stage,{recursive:true,force:true});
await cp(path.join(root,'Browser/dist'),stage,{recursive:true,force:true});
await cp(path.join(root,'Applications/player-assets/unity'),path.join(stage,'unity'),{recursive:true,force:true});
const catalog=JSON.parse(await readFile(path.join(stage,'assets/catalog.json'),'utf8'));
for(const asset of catalog.assets){const size=(await stat(path.join(stage,asset.src))).size;if(size!==asset.bytes)throw new Error('Incomplete source asset '+asset.src);}
const manifest={};const limit=25*1024*1024,partSize=16*1024*1024;
async function split(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){await split(file);continue;}
  const bytes=(await stat(file)).size;if(bytes<=limit)continue;
  if(!file.endsWith('.data.gz'))throw new Error('Oversized asset: '+file);
  const data=await readFile(file),parts=[];
  for(let offset=0;offset<data.length;offset+=partSize){const part=file+`.part${parts.length}`;await writeFile(part,data.subarray(offset,offset+partSize));parts.push('/'+path.relative(stage,part).split(path.sep).join('/'));}
  const virtual='/'+path.relative(stage,file).split(path.sep).join('/');
  manifest[virtual]={parts,bytes,sha256:createHash('sha256').update(data).digest('hex')};
  // Only remove this generated staging copy; keep the verified player and APK inputs.
  if(!file.startsWith(stage+path.sep))throw new Error('Unexpected stage path');
  await unlink(file);
 }
}
await split(stage);
await writeFile(path.join(stage,'unity/data-parts.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({stage,verifiedCatalogAssets:catalog.assets.length,streamedFiles:Object.keys(manifest)}));
