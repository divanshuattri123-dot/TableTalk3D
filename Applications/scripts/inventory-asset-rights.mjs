import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app=fileURLToPath(new URL('..',import.meta.url));
const source=path.resolve(process.argv[2]??path.join(app,'../tmp/worker-release-083'));
const catalog=JSON.parse(await readFile(path.join(source,'assets/catalog.json'),'utf8'));
const evidence=JSON.parse(await readFile(path.join(app,'publishing/asset-rights-evidence.json'),'utf8'));
const rows=[];
for(const asset of catalog.assets){
  const bytes=await readFile(path.join(source,asset.src));
  if(bytes.length!==asset.bytes)throw Error(`Asset size differs: ${asset.id}`);
  const sha256=createHash('sha256').update(bytes).digest('hex'),record=evidence.assets[asset.id];
  const reviewed=Boolean(record?.document&&record?.commercialUse===true&&record?.sha256===sha256);
  if(reviewed)await stat(path.resolve(app,'publishing',record.document));
  rows.push([asset.id,asset.kind,asset.category,asset.label,asset.source,asset.src,bytes.length,sha256,reviewed?'evidence_recorded':'owner_claim_review_pending',reviewed?record.document:'']);
}
const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
await writeFile(path.join(app,'publishing/ASSET_RIGHTS_INVENTORY.csv'),[['id','kind','category','label','source','distributed_path','bytes','sha256','commercial_review','evidence_document'],...rows].map(row=>row.map(quote).join(',')).join('\n')+'\n');
const report={checkedAt:new Date().toISOString(),catalogAssets:rows.length,counts:catalog.counts,reviewed:rows.filter(r=>r[8]==='evidence_recorded').length,pending:rows.filter(r=>r[8]!=='evidence_recorded').length,ownerClaim:'Owner states supplied assets are their own; file-specific evidence pending.',scope:'Every downloadable catalog asset. Embedded Unity imports, project art and package licences also need the release review described in ASSET_RIGHTS_REVIEW.md.'};
await writeFile(path.join(app,'verification/asset-rights-review.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
