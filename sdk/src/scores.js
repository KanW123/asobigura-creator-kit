import { sendRequest } from './messaging.js';

/**
 * Submit a score. Pass `category` only if the game ranks more than one thing
 * (e.g. 'speed' / 'accuracy'); without it the score lands on the main board.
 * Resolves to { rank, isNewRecord, best, category }.
 */
export async function submitScore({ score, meta = {}, category } = {}) {
  return sendRequest('scores.submit', category ? { score, meta, category } : { score, meta });
}

/**
 * Read a leaderboard.
 * - mode 'best' (default): one row per player, their best score. This is the
 *   ranking players see on the platform.
 * - mode 'history': every submitted score, highest first — a player can appear
 *   more than once. This was the only behaviour before v1.1.
 */
export async function getLeaderboard({ period = 'all', limit = 50, offset = 0, around = false, category, mode = 'best' } = {}) {
  return sendRequest('scores.leaderboard', { period, limit, offset, around, category, mode });
}
