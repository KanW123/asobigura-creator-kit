import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { zipSync } from '../cli/node_modules/fflate/esm/index.mjs';
import './licenses.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'cli/package.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = {};
fs.copyFileSync(path.join(root,'sdk/dist/platform-sdk.js'),path.join(root,'examples/save-counter/platform-sdk.js'));
function add(relative) {
  const absolute = path.join(root, relative);
  const info = fs.lstatSync(absolute);
  if (info.isSymbolicLink()) throw Error('Refusing symlink: ' + relative);
  if (info.isDirectory()) {
    for (const child of fs.readdirSync(absolute).sort()) {
      if (child === '.bin' || child === '.package-lock.json') continue;
      add(relative + '/' + child);
    }
  } else {
    if (/(^|\/)(?:\.env[^/]*|credentials\.json|\.git|\.secrets)(\/|$)/i.test(relative)) throw Error('Forbidden file');
    const bytes = fs.readFileSync(absolute);
    const text = bytes.toString('utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_|gh[pousr]_[A-Za-z0-9]{30,}/.test(text)) {
      throw Error('Possible secret in ' + relative);
    }
    files[relative] = bytes;
  }
}
// Explicit allowlist. No internal records, auth files, PF sources or Git history.
for (const item of ['README.md','README.ja.md','LICENSE','THIRD_PARTY_NOTICES.md','DEPENDENCIES.json','docs','examples','sdk/dist/platform-sdk.js','cli/bin','cli/src','cli/package.json','cli/package-lock.json','cli/node_modules','scripts/package-game.mjs']) add(item);
const manifest = Object.entries(files).map(([name, bytes]) => ({ name, size:bytes.length, sha256:sha(bytes) }));
files['MANIFEST.json'] = Buffer.from(JSON.stringify({version:pkg.version,releaseCandidate:pkg.version.includes('-'),files:manifest},null,2));
const dist = path.join(root,'dist'); fs.mkdirSync(dist,{recursive:true});
const name = `asobigura-creator-kit-${pkg.version}.zip`;
const archive = zipSync(files,{level:6,mtime:new Date(2020,0,1,0,0,0)});
fs.writeFileSync(path.join(dist,name),archive);
fs.writeFileSync(path.join(dist,'SHA256SUMS'),sha(archive)+'  '+name+'\n');
console.log(JSON.stringify({name,files:manifest.length,bytes:archive.length,sha256:sha(archive)}));
