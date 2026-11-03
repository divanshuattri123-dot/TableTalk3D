import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const file=`TableTalk3D-${version}-test.apk`,apk=await readFile(path.join(root,'downloads',file));
const verification=JSON.parse(await readFile(path.join(root,'verification',`mobile-${version}-package.json`),'utf8'));
const hash=createHash('sha256').update(apk).digest('hex');
const bundle=path.join(root,'downloads',`TableTalk3D-${version}-release-unsigned.aab`);
const docs=['RELEASE_HANDOFF.md','DEVICE_QA.md','LAUNCH_PLAN.md','STORE_LISTING_DRAFT.md','AD_COPY_DRAFT.csv'];
for(const name of docs)await stat(path.join(root,'publishing',name));
const gates=[
  ['Play Console account','Owner confirmed no account on 3 November 2026.'],
  ['Production upload signing','The prepared release AAB is unsigned; test APK uses Android Debug.'],
  ['Physical device and long-session QA','No physical Android phone was connected for this release.'],
  ['Commercial asset rights review','Evidence for supplied APK-derived models, images and audio still needs review.'],
  ['Public support and privacy details','Real publisher contact and hosted policy are not configured.'],
  ['Play content declarations and test track','Complete in Play Console; applicable new personal-account closed testing is pending.'],
  ['Production monetization','Real billing and Families-compliant live ads are not connected.'],
  ['Advertising account and approved campaign','No ad account; keep the INR 5,000 plan paused until a usable release and final review.']
].map(([name,reason])=>({name,status:'pending',reason}));
const report={version,checkedAt:new Date().toISOString(),testArtifact:{file,bytes:apk.length,sha256:hash,packageVerificationMatches:hash===verification.sha256&&verification.allPackagedAssetsMatch},preparedUnsignedBundleBytes:(await stat(bundle)).size,publishingDocuments:docs,playReady:false,paidAdsReady:false,adSpendINR:0,adBudgetCeilingINR:5000,externalGates:gates};
await writeFile(path.join(root,'verification',`release-readiness-${version}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.testArtifact.packageVerificationMatches||process.argv.includes('--require-ready'))process.exitCode=1;
