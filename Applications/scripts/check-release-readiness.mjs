import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const json=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const optional=async name=>{try{return await json(name);}catch(error){if(error.code==='ENOENT')return;throw error;}};
const {version}=await json('package.json'),file=`TableTalk3D-${version}-test.apk`;
const apk=await readFile(path.join(root,'downloads',file)),hash=createHash('sha256').update(apk).digest('hex');
const verification=await json(`verification/mobile-${version}-package.json`);
const signing=await optional(`verification/upload-signing-${version}.json`);
const rights=await optional('verification/asset-rights-review.json');
const publisher=JSON.parse(await readFile(path.join(root,'../Browser/src/publisher/publisher.json'),'utf8'));
const consoleStatus=await json('publishing/play-console-status.json');
const physical=await optional(`verification/physical-device-${version}.json`);
const docs=['RELEASE_HANDOFF.md','DEVICE_QA.md','LAUNCH_PLAN.md','STORE_LISTING_DRAFT.md','AD_COPY_DRAFT.csv','UPLOAD_SIGNING.md','ASSET_RIGHTS_REVIEW.md'];
for(const name of docs)await stat(path.join(root,'publishing',name));
let signedBundleMatches=false;
if(signing?.verified&&signing?.allPackagedAssetsMatch){const bundle=await readFile(path.join(root,'downloads',signing.file));signedBundleMatches=createHash('sha256').update(bundle).digest('hex')===signing.sha256;}
const gates=[
  {name:'Play Console account',complete:consoleStatus.accountVerified,reason:'Publisher must create and verify the account.'},
  {name:'Signed upload bundle',complete:signedBundleMatches,reason:signedBundleMatches?'Signed AAB verified against the exported upload certificate.':'Current signed AAB and certificate verification are required.'},
  {name:'Upload-key recovery',complete:consoleStatus.uploadKeyRecoveryVerified,reason:'Local key and DPAPI-protected credentials exist; the owner still needs an independently recoverable backup.'},
  {name:'Physical device and long-session QA',complete:physical?.passed===true&&physical?.physicalDevice===true,reason:'Emulator/browser results do not establish physical Android 12+ performance.'},
  {name:'Commercial asset review',complete:rights?.pending===0&&rights?.embeddedAndProjectArtReviewed===true,reason:`${rights?.pending??'Unknown'} catalog items need evidence; embedded/project art also needs review.`},
  {name:'Public support and privacy details',complete:Boolean(publisher.supportEmail)&&publisher.privacyReviewed===true,reason:'Owner has no public support email yet. An accurate test notice is prepared; final contact and policy review remain pending.'},
  {name:'Play declarations and required test track',complete:consoleStatus.appContentComplete&&consoleStatus.requiredTestingComplete&&consoleStatus.productionAccessGranted,reason:'Complete actual Play app-content setup, applicable testing and production access.'}
].map(({complete,...gate})=>({...gate,status:complete?'complete':'pending'}));
const matches=hash===verification.sha256&&verification.allPackagedAssetsMatch;
gates.push({name:'Play candidate channel',status:verification.build?.channel==='play-test'?'complete':'pending',reason:'The verified package must disable sample ads and preview transactions.'});
const report={version,checkedAt:new Date().toISOString(),testArtifact:{file,bytes:apk.length,sha256:hash,packageVerificationMatches:matches},signedBundleReady:signedBundleMatches,publishingDocuments:docs,playReady:matches&&gates.every(g=>g.status==='complete'),paidAdsReady:false,adSpendINR:0,adBudgetCeilingINR:5000,externalGates:gates,optionalMonetization:{requiredForFreeLaunch:false,status:'disabled',reason:'No live ads, real purchases or sample transactions in the Play test candidate. Paid monetization requires a separate verified integration.'}};
await writeFile(path.join(root,'verification',`release-readiness-${version}.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!matches||process.argv.includes('--require-ready')&&!report.playReady)process.exitCode=1;
