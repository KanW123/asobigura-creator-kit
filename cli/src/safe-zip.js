import { unzipSync } from 'fflate';
const DEFAULTS = { compressed: 256 * 1024 * 1024, total: 512 * 1024 * 1024,
  perFile: 128 * 1024 * 1024, count: 10000 };
export function unpackZip(buffer, limits = DEFAULTS) {
  if (buffer.byteLength > limits.compressed) throw Error('ZIP exceeds compressed size limit');
  let total = 0, count = 0;
  const names = new Set();
  const files = unzipSync(new Uint8Array(buffer), { filter(entry) {
    const name = entry.name;
    if (!name || name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name) ||
        name.includes('\0') || name.split('/').some(p => p === '..' || p === '.')) throw Error('Unsafe ZIP path');
    if (names.has(name)) throw Error('Duplicate ZIP path');
    names.add(name);
    total += entry.originalSize; count++;
    if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0 ||
        entry.originalSize > limits.perFile || total > limits.total || count > limits.count) {
      throw Error('ZIP exceeds extraction limit');
    }
    return true;
  } });
  return files;
}
