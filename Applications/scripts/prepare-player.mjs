import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const build = path.join(root, 'Build/AppsWeb/Build');
const files = ['AppsWeb.loader.js', 'AppsWeb.data.gz', 'AppsWeb.framework.js.gz', 'AppsWeb.wasm.gz'];
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(path.join(build, file)));
const version = hash.digest('hex').slice(0, 12);
const target = path.join(root, 'Applications/player-assets/unity');
await mkdir(path.join(target, 'Build', version), { recursive: true });
for (const file of files) await cp(path.join(build, file), path.join(target, 'Build', version, file));
const release = Object.fromEntries(['loaderUrl', 'dataUrl', 'frameworkUrl', 'codeUrl'].map((field, i) => [field, `Build/${version}/${files[i]}`]));
const {version:productVersion}=JSON.parse(await readFile(path.join(root,'Applications/package.json'),'utf8'));
await writeFile(path.join(target, 'release.json'), JSON.stringify({ ...release, productVersion }, null, 2));
console.log(`Prepared Unity ${productVersion} / ${version}`);
