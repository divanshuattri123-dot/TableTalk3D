import {readdir,stat,mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const mobileOnly=process.argv.includes('--mobile-only');
async function bytes(dir){let n=0;for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);n+=entry.isDirectory()?await bytes(file):(await stat(file)).size;}return n;}
const mobile=(await stat(path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk'))).size;
const pc=mobileOnly?undefined:await bytes(path.join(root,'downloads',version,'TableTalk3D-win32-x64'));
const report={version,scope:mobileOnly?'android':'android-and-windows',budgets:{mobilePackage:300_000_000,pcFolder:3_000_000_000},actual:{androidApk:mobile,windowsFolder:pc},passed:mobile<=300_000_000&&(pc===undefined||pc<=3_000_000_000),notes:['Decimal MB/GB package budgets; no filler.','Mobile web assets are local; optional collection assets stream on demand.','Android/iOS hardware performance still requires device testing.']};
await mkdir(path.join(root,'verification'),{recursive:true});
await writeFile(path.join(root,'verification',mobileOnly?`package-budgets-${version}-android.json`:'package-budgets.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
