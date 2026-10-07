import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { startBrowserAuth, exchangeCode } from '../cli/src/browser-auth.js';
import { createCredentialStore, credentialDirectory } from '../cli/src/credential-store.js';

const config = { SUPABASE_URL: 'https://auth.example.invalid', SUPABASE_ANON_KEY: 'test' };
test('loopback PKCE callback rejects mismatched attempts and saves once', async () => {
  let saved = 0;
  const flow = await startBrowserAuth({ config,
    exchange: async ({ code, verifier }) => {
      assert.equal(code, 'good');
      assert.equal(createHash('sha256').update(verifier).digest('base64url'),
        new URL(flow.url).searchParams.get('code_challenge'));
      return { user: { id: 'fixture' } };
    }, save: () => { saved++; },
  });
  try {
    assert.equal(new URL(flow.callback).hostname, '127.0.0.1');
    const wrong = new URL(flow.callback); wrong.searchParams.set('state', 'wrong');
    assert.equal((await fetch(wrong)).status, 403);
    assert.equal((await fetch(flow.callback, { headers: { Origin: 'https://evil.invalid' } })).status, 403);
    assert.equal((await fetch(flow.callback, { method: 'POST', body: '{}' })).status, 404);
    assert.equal(saved, 0);
    assert.equal((await fetch(flow.callback + '&code=good')).status, 200);
    await flow.result;
    assert.equal(saved, 1);
  } finally { flow.cancel(); }
});
test('invalid Host rejected', async () => {
  const flow = await startBrowserAuth({ config, save: () => assert.fail() });
  try {
    const status = await new Promise((resolve, reject) => {
      const req = http.get(flow.callback, { headers: { Host: 'evil.invalid' } }, res => {res.resume(); resolve(res.statusCode);});
      req.on('error', reject);
    });
    assert.equal(status, 403);
  } finally { flow.cancel(); await assert.rejects(flow.result); }
});
test('failed exchange never saves or reports success', async () => {
  const flow = await startBrowserAuth({ config, exchange: async () => { throw Error('secret'); }, save: () => assert.fail() });
  const res = await fetch(flow.callback + '&code=invalid');
  assert.equal(res.status, 400); assert.ok(!(await res.text()).includes('secret'));
  await assert.rejects(flow.result, /Login failed/);
});
test('timeout prevents late save', async () => {
  const flow = await startBrowserAuth({ config, timeoutMs: 60,
    exchange: async () => { await new Promise(r => setTimeout(r, 150)); return {}; }, save: () => assert.fail() });
  const request = fetch(flow.callback + '&code=slow').catch(() => null);
  await assert.rejects(flow.result, /timed out/); await request;
  await new Promise(r => setTimeout(r, 160));
});
test('token exchange verifies user and does not follow redirects', async () => {
  let calls = 0;
  await assert.rejects(exchangeCode({ config, code: 'c', verifier: 'v', fetchFn: async (url, opts) => {
    assert.equal(opts.redirect, 'error'); calls++;
    if (calls === 1) return Response.json({ access_token: 'fake', refresh_token: 'fake', user: {id:'a'} });
    return Response.json({id:'b'});
  }}), /mismatch/);
  assert.equal(calls, 2);
});
test('credential writes are isolated, replaceable, clearable and directory is restricted', () => {
  assert.equal(path.basename(credentialDirectory), '.asobigura-creator-kit');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-auth-test-'));
  const dir = path.join(root, 'private');
  const store = createCredentialStore(dir);
  try {
    assert.equal(store.load(), null);
    store.save({ access_token: 'test-only-1' });
    store.save({ access_token: 'test-only-2' });
    assert.equal(store.load().access_token, 'test-only-2');
    assert.deepEqual(fs.readdirSync(dir), ['credentials.json']);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
      assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
    }
    store.clear(); assert.equal(store.load(), null);
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});
