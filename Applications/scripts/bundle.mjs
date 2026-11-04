import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = path.resolve(root, '../Browser');
const appVersion=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const assets = process.env.TABLETALK_ASSET_SOURCE;
if (!assets) throw new Error('Set TABLETALK_ASSET_SOURCE to the prepared public folder containing unity/release.json.');
const web = path.join(root, 'web');
execFileSync(process.execPath,[path.join(root,'scripts/generate-privacy.mjs')],{stdio:'inherit'});
execFileSync(process.execPath, [path.join(browser, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', web, '--emptyOutDir'], { cwd: browser, stdio: 'inherit', env: { ...process.env, PAGES_BASE_PATH: './', VITE_PACKAGED_APP: 'true', VITE_STORE_CANDIDATE:process.argv.includes('--play-test')?'true':'false', VITE_APP_VERSION:appVersion, VITE_PARTYKIT_HOST: 'wss://table-talk-realtime.divanshuattri123.workers.dev', VITE_ASSET_HOST: 'https://table-talk-realtime.divanshuattri123.workers.dev' } });
const unity = path.join(web, 'unity');
// Vite may copy the browser's gzip player; Android treats .gz and plain assets as duplicates.
if (path.resolve(unity) !== path.join(root, 'web', 'unity')) throw new Error('Unexpected generated Unity folder');
await rm(unity, {recursive:true,force:true});
const release = JSON.parse(await readFile(path.join(assets, 'unity/release.json'), 'utf8'));
await mkdir(unity, { recursive: true });
// Local WebViews don't send the compressed-file headers used by the website host.
for (const field of ['loaderUrl', 'dataUrl', 'frameworkUrl', 'codeUrl']) {
  const compressed = release[field];
  const uncompressed = compressed.endsWith('.gz') ? compressed.slice(0, -3) : compressed;
  await mkdir(path.dirname(path.join(unity, uncompressed)), { recursive: true });
  const bytes = await readFile(path.join(assets, 'unity', compressed));
  await writeFile(path.join(unity, uncompressed), compressed.endsWith('.gz') ? gunzipSync(bytes) : bytes);
  release[field] = uncompressed;
}
await writeFile(path.join(unity, 'release.json'), JSON.stringify(release, null, 2));
await writeFile(path.join(web,'build-info.json'),JSON.stringify({version:appVersion,channel:process.argv.includes('--play-test')?'play-test':'preview',unityPlayerVersion:release.productVersion,liveAds:false,realPurchases:false},null,2));
const desktopWeb = path.resolve(root, 'desktop/app/web');
if (desktopWeb !== path.join(root,'desktop','app','web')) throw new Error('Unexpected generated desktop folder');
await rm(desktopWeb, {recursive:true,force:true});
await mkdir(desktopWeb, { recursive: true });
await cp(web, desktopWeb, { recursive: true });
console.log('Bundled complete game and local Unity player. Multiplayer and optional collections require internet.');
