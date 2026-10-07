import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {extractZip} from '../cli/src/isolated-zip.js';
import {analyzeZipBuffer} from '../cli/src/zipinfo.js';
import {zipSync} from '../cli/node_modules/fflate/esm/index.mjs';
import {createCredentialStore} from '../cli/src/credential-store.js';
test('isolated ZIP parsing fails closed and enforces deadline',()=>{
  assert.throws(()=>analyzeZipBuffer(Buffer.from('not a zip')),/ZIP rejected/);
  assert.throws(()=>extractZip(zipSync({'index.html':Buffer.from('hi')}),{timeout:1}),/ZIP rejected/);
  assert.equal(Buffer.from(extractZip(zipSync({'index.html':Buffer.from('hi')}))['index.html']).toString(),'hi');
});
test('credential hardlinks rejected',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'creator-hardlink-'));
  try{
    const dir=path.join(root,'private');fs.mkdirSync(dir);const source=path.join(root,'other');
    fs.writeFileSync(source,'{}');fs.linkSync(source,path.join(dir,'credentials.json'));
    assert.throws(()=>createCredentialStore(dir).load(),/Unsafe/);
  }finally{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
test('Windows removes an explicit Everyone permission before storing',{skip:process.platform!=='win32'},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'creator-acl-'));
  const dir=path.join(root,'private');fs.mkdirSync(dir);
  try{
    execFileSync('icacls.exe',[dir,'/grant','*S-1-1-0:(OI)(CI)R'],{stdio:'pipe',windowsHide:true});
    const store=createCredentialStore(dir);store.save({fixture:true});
    const acl=execFileSync('icacls.exe',[dir],{encoding:'utf8',windowsHide:true});
    assert.ok(!acl.includes('Everyone'));
    assert.equal(store.load().fixture,true);
  }finally{
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    fs.rmSync(root,{recursive:true,force:true});
  }
});
