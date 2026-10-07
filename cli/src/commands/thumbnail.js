import { readFileSync, statSync } from 'fs';
import { resolve, extname } from 'path';
import { config } from '../config.js';
import { getValidToken } from '../auth.js';

export async function thumbnailCommand(gameId, imagePath) {
  const token = await getValidToken();
  if (!token) {
    console.error('Not logged in. Run: gameplatform login');
    process.exit(1);
  }

  if (!gameId || !imagePath) {
    console.error('Usage: gameplatform thumbnail <game-id> <image-path>');
    process.exit(1);
  }

  const filePath = resolve(imagePath);
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (stat.size > 2 * 1024 * 1024) {
    console.error('Image must be under 2MB');
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();
  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  const contentType = mimeMap[ext];
  if (!contentType) {
    console.error('Supported formats: .png, .jpg, .jpeg, .webp');
    process.exit(1);
  }

  const fileBuffer = readFileSync(filePath);
  console.log(`Uploading thumbnail for ${gameId}...`);

  const res = await fetch(`${config.API_BASE}/developer/games/${encodeURIComponent(gameId)}/thumbnail`, {
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

  console.log('Thumbnail uploaded!');
  console.log(`  URL: ${data.thumbnail_url}`);
}
