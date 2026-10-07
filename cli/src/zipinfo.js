import { extractZip } from './isolated-zip.js';

const MB = 1024 * 1024;

// Speak in player wait-time, not "limits". Rough download estimate on a typical
// 20Mbps mobile link: seconds ≈ sizeMB * 8 / 20 ≈ sizeMB * 0.4.
export function loadSeconds(sizeMB) {
  return Math.round(sizeMB * 0.4);
}

// Analyze a game ZIP buffer: total size, file count, and the heaviest top-level
// buckets (by uncompressed entry size). unzipSync is fine here — this runs on
// the developer's machine, not the memory-bounded Worker.
export function analyzeZipBuffer(buf) {
  const sizeBytes = buf.length;
  const sizeMB = sizeBytes / MB;

  let fileCount = 0;
  const buckets = new Map(); // top-level dir (or root filename) -> uncompressed bytes
  try {
    const files = extractZip(buf);
    for (const [path, data] of Object.entries(files)) {
      if (path.endsWith('/')) continue; // directory entry
      fileCount++;
      const slash = path.indexOf('/');
      const bucket = slash >= 0 ? path.slice(0, slash) + '/' : path;
      buckets.set(bucket, (buckets.get(bucket) || 0) + data.length);
    }
  } catch (error) {
    throw error; // Fail closed before either legacy deploy or manifest upload.
  }

  const top5 = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, mb: bytes / MB }));

  let tier;
  if (sizeMB > 90) tier = 'over';
  else if (sizeMB > 60) tier = 'heavy';
  else if (sizeMB > 30) tier = 'warn';
  else tier = 'ok';

  return { sizeBytes, sizeMB, fileCount, top5, tier, loadSeconds: loadSeconds(sizeMB) };
}

// Print the size report (always shown before an upload). Returns true if the
// upload must be ABORTED (over the 90MB hard limit) — the caller should exit.
// manifest方式（1ファイルずつ送る）に移行したため、ゲーム全体のサイズで
// アップロードを止める必要はなくなった。数字は「プレイヤーの待ち時間」を
// 伝えるために出し続ける（制限ではなく体験の話として）。
// hardStop:true を渡すと従来どおり 90MB 超で中断する（旧ZIP経路用）。
export function reportZipSize(a, { hardStop = true } = {}) {
  console.log(`ZIP: ${a.sizeMB.toFixed(1)}MB（${a.fileCount}ファイル）`);
  if (a.top5.length) {
    console.log('内訳トップ5:');
    for (const t of a.top5) console.log(`  ${t.name} ${t.mb.toFixed(1)}MB`);
  }

  switch (a.tier) {
    case 'ok':
      console.log('✓ サイズ良好（推奨30MB以下）');
      return false;
    case 'warn':
      console.log(`⚠ 推奨30MBを超えています（ロード目安 ~${a.loadSeconds}秒 @20Mbps）。README「容量ガイド」参照`);
      return false;
    case 'heavy':
      console.log(`⚠⚠ かなり重いです（ロード目安 ~${a.loadSeconds}秒）。最適化を強く推奨 → README「容量ガイド」`);
      return false;
    case 'over':
    default:
      if (!hardStop) {
        console.log(`⚠⚠⚠ 非常に大きいです（${a.sizeMB.toFixed(1)}MB / ロード目安 ~${a.loadSeconds}秒）。`);
        console.log('  プレイヤーが起動時に全部読む作りだと確実に離脱します。遅延ロードにしてください。');
        console.log('  （ファイルは1個ずつ送るのでアップロード自体は通ります）');
        return false;
      }
      console.error(`✗ 上限90MBを超えています（${a.sizeMB.toFixed(1)}MB）。アップロードを中止します。`);
      console.error('  ①画像を表示サイズへ縮小(sharp等)');
      console.error('  ②GLBは gltf-transform でテクスチャWebP化+リサイズ');
      console.error('  ③.git/node_modules/開発ドキュメントを除外');
      return true;
  }
}
