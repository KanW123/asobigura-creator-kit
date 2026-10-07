import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {deserialize} from 'node:v8';

export function extractZip(buffer, {timeout=15000}={}) {
  if (buffer.byteLength > 256*1024*1024) throw Error('ZIP exceeds 256 MiB compressed size limit');
  try {
    const result=execFileSync(process.execPath,
      ['--max-old-space-size=256',fileURLToPath(new URL('./zip-worker.js',import.meta.url))],
      {input:buffer,timeout,maxBuffer:540*1024*1024,windowsHide:true,stdio:['pipe','pipe','pipe']});
    return deserialize(result);
  } catch {
    throw Error('ZIP rejected: invalid archive, extraction limit, or 15-second timeout');
  }
}
