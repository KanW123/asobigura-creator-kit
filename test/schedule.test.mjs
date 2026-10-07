import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {toPublishAt} from '../cli/src/commands/schedule.js';
test('schedule time parsing assumes JST only when no timezone is given',()=>{
  assert.deepEqual(toPublishAt('2026-10-08 18:00'),{iso:'2026-10-08T18:00+09:00',assumedJst:true});
  assert.deepEqual(toPublishAt('2026-10-08T09:00:00Z'),{iso:'2026-10-08T09:00:00Z',assumedJst:false});
  assert.deepEqual(toPublishAt('2026-10-08T18:00:00+09:00'),{iso:'2026-10-08T18:00:00+09:00',assumedJst:false});
  for(const bad of ['', 'tomorrow', '2026-10-08', '18:00']) assert.equal(toPublishAt(bad),null);
});
test('schedule refuses without --confirmed before any network or auth',()=>{
  let err;
  try{execFileSync(process.execPath,['cli/bin/gameplatform.js','schedule','g1','2026-10-08 18:00'],{stdio:'pipe',env:{...process.env,HOME:'/nonexistent',USERPROFILE:'/nonexistent'}});}catch(e){err=e;}
  assert.ok(err,'must exit non-zero');
  assert.equal(err.status,1);
  assert.match(String(err.stderr),/--confirmed/);
});
