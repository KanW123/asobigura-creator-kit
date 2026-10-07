import { readFileSync, statSync } from 'fs';
import { resolve, extname } from 'path';
import { config } from '../config.js';
import { getValidToken } from '../auth.js';

// Upload one screenshot to a game's gallery (run multiple times for multiple shots).
export async function screenshotCommand(gameId, imagePath) {
  const token = await getValidToken();
  if (!token) {
    console.error('Not logged in. Run: gameplatform login');
    process.exit(1);
  }

  if (!gameId || !imagePath) {
    console.error('Usage: gameplatform screenshot <game-id> <image-path>');
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

  if (stat.size > 4 * 1024 * 1024) {
    console.error('Screenshot must be under 4MB');
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
  console.log(`Uploading screenshot for ${gameId}...`);

  const res = await fetch(`${config.API_BASE}/developer/games/${encodeURIComponent(gameId)}/screenshots`, {
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

  console.log(`Screenshot uploaded! (${data.screenshots.length} total)`);
  data.screenshots.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
}
