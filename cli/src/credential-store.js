import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Deliberately separate from the existing administrator CLI's .gameplatform.
export const credentialDirectory = path.join(homedir(), '.asobigura-creator-kit');

export function createCredentialStore(directory = credentialDirectory) {
  const file = path.join(directory, 'credentials.json');
  function check(target, kind) {
    try {
      const info = fs.lstatSync(target);
      if (info.isSymbolicLink() || (kind === 'dir' ? !info.isDirectory() : !info.isFile() || info.nlink !== 1)) {
        throw new Error('Unsafe credential storage path');
      }
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  function restrict(target, directoryTarget) {
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', fileURLToPath(new URL('./windows-private-acl.ps1', import.meta.url)), '-TargetPath', target],
        { stdio: 'pipe', windowsHide: true, timeout: 15000 });
    } else fs.chmodSync(target, directoryTarget ? 0o700 : 0o600);
  }
  function protect() {
    check(directory, 'dir');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    restrict(directory, true);
  }
  return {
    file,
    load() {
      check(directory, 'dir'); check(file, 'file');
      if (fs.existsSync(file)) { protect(); restrict(file, false); }
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return null; throw e; }
    },
    save(data) {
      protect(); check(file, 'file');
      const temp = path.join(directory, `${randomUUID()}.tmp`);
      try {
        fs.writeFileSync(temp, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 });
        restrict(temp, false);
        fs.renameSync(temp, file);
      } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    },
    clear() {
      check(directory, 'dir'); check(file, 'file');
      try { fs.unlinkSync(file); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    },
  };
}
