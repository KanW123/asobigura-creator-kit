import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { unzipSync } from '../cli/node_modules/fflate/esm/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version=JSON.parse(fs.readFileSync(path.join(root,'cli/package.json'),'utf8')).version;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'asobigura-kit-smoke-'));
const extracted=path.join(temp,'日本語 space');
const files=unzipSync(fs.readFileSync(path.join(root,'dist',`asobigura-creator-kit-${version}.zip`)));
try {
  for(const [name,bytes] of Object.entries(files)) {
    const target=path.resolve(extracted,name);
    assert.ok(target.startsWith(path.resolve(extracted)+path.sep));
    fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,bytes);
  }
  const manifest=JSON.parse(Buffer.from(files['MANIFEST.json']).toString('utf8'));
  for(const item of manifest.files) {
    assert.equal(createHash('sha256').update(files[item.name]).digest('hex'),item.sha256);
  }
  const run=args=>execFileSync(process.execPath,['cli/bin/gameplatform.js',...args],
    {cwd:extracted,encoding:'utf8',windowsHide:true,env:{...process.env,NODE_PATH:''}});
  assert.equal(run(['--version']).trim(),version);
  const help=run(['--help']);assert.match(help,/deploy/);
  assert.match(run(['promote','--help']),/--expect/);
  for(const command of ['login','logout','deploy','update','games','status','delete','thumbnail','screenshot','video','connect','earnings','sales','pricing','items','share','launch-mode']) {
    assert.match(run([command,'--help']),/Usage:/);
  }
  console.log(JSON.stringify({manifestFiles:manifest.files.length,version,npmInvoked:false,
    authenticated:false,productionWrites:false,helpCommands:19,unicodePath:true}));
} finally {
  assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(temp).startsWith('asobigura-kit-smoke-'));
  fs.rmSync(temp,{recursive:true,force:true});
}
