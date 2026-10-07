import { config } from '../config.js';
import { getValidToken } from '../auth.js';

export async function launchModeCommand(gameId, mode, options) {
  if (mode !== 'iframe' && mode !== 'top_level') {
    console.error('mode must be iframe or top_level');
    process.exit(1);
  }
  if (mode === 'top_level' && !options.agreeTerms) {
    console.error(`最新のクリエイター規約への同意が必要です: ${config.PLATFORM_URL}/creator-terms`);
    console.error(`再実行: gameplatform launch-mode ${gameId} top_level --agree-terms`);
    process.exit(1);
  }
  const token = await getValidToken();
  if (!token) {
    console.error('Not logged in. Run: gameplatform login');
    process.exit(1);
  }
  const res = await fetch(`${config.API_BASE}/developer/games/${encodeURIComponent(gameId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ launch_mode: mode, terms_version: options.agreeTerms ? config.CREATOR_TERMS_VERSION : undefined }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Launch mode update failed:', data.error?.message || 'Unknown error');
    process.exit(1);
  }
  console.log(`Launch mode: ${gameId} -> ${mode}`);
}
