import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync } from '../cli/node_modules/fflate/esm/index.mjs';
import { unpackZip } from '../cli/src/safe-zip.js';
test('nested game asset preserved', () => {
  const files = unpackZip(zipSync({'assets/a.js':new Uint8Array([1,2])}));
  assert.deepEqual([...files['assets/a.js']],[1,2]);
});
test('traversal and absolute paths rejected', () => {
  for (const p of ['../outside','/outside','C:/outside','a\\b']) {
    assert.throws(()=>unpackZip(zipSync({[p]:new Uint8Array([1])})),/Unsafe/);
  }
});
test('expansion and file count limited before extraction', () => {
  const zip=zipSync({'a':new Uint8Array(5000),'b':new Uint8Array(5000)});
  const limits={compressed:10000,total:9000,perFile:6000,count:3};
  assert.throws(()=>unpackZip(zip,limits),/extraction limit/);
  assert.throws(()=>unpackZip(zip,{...limits,total:20000,count:1}),/extraction limit/);
});
