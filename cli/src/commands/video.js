import { readFileSync, statSync } from 'fs';
import { resolve, extname } from 'path';
import { config } from '../config.js';
import { getValidToken } from '../auth.js';

// Upload a short preview video (mp4/webm, max 20MB) for a game's detail page.
export async function videoCommand(gameId, videoPath) {
  const token = await getValidToken();
  if (!token) {
    console.error('Not logged in. Run: gameplatform login');
    process.exit(1);
  }

  if (!gameId || !videoPath) {
    console.error('Usage: gameplatform video <game-id> <video-path>');
    process.exit(1);
  }

  const filePath = resolve(videoPath);
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (stat.size > 20 * 1024 * 1024) {
    console.error('Video must be under 20MB (use a short, compressed clip)');
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();
  const mimeMap = { '.mp4': 'video/mp4', '.webm': 'video/webm' };
  const contentType = mimeMap[ext];
  if (!contentType) {
    console.error('Supported formats: .mp4, .webm');
    process.exit(1);
  }

  const fileBuffer = readFileSync(filePath);
  console.log(`Uploading preview video for ${gameId}...`);

  const res = await fetch(`${config.API_BASE}/developer/games/${encodeURIComponent(gameId)}/video`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Authorization': `Bearer ${token}`,
    },
    body: fileBuffer,
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Upload failed:', data.error?.message || 'Unknown error');
    process.exit(1);
  }

  console.log('Preview video uploaded!');
  console.log(`  URL: ${data.video_url}`);
}
