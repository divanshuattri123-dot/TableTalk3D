import { createRequire } from 'node:module';
const sharp=createRequire(new URL('../../Browser/package.json',import.meta.url))('sharp');
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const svg=await readFile(path.join(root,'../Browser/public/favicon.svg'));
for(const [density,size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]) {
  const dir=path.join(root,`android/app/src/main/res/mipmap-${density}`);
  for(const name of ['ic_launcher','ic_launcher_round'])await sharp(svg).resize(size,size).png().toFile(path.join(dir,`${name}.png`));
  await sharp(svg).resize(Math.round(size*.66),Math.round(size*.66)).extend({top:Math.round(size*.42),bottom:Math.round(size*.42),left:Math.round(size*.42),right:Math.round(size*.42),background:'#17273d'}).png().toFile(path.join(dir,'ic_launcher_foreground.png'));
}
await sharp(svg).resize(1024,1024).flatten({background:'#17273d'}).png().toFile(path.join(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
const png=await sharp(svg).resize(256,256).png().toBuffer(), header=Buffer.alloc(22);
header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
await mkdir(path.join(root,'desktop/app/art'),{recursive:true});
await writeFile(path.join(root,'desktop/app/art/icon.ico'),Buffer.concat([header,png]));
console.log('TableTalk icons generated for Android, iOS and Windows.');
