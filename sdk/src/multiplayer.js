/**
 * Multiplayer module for GamePlatform SDK.
 * Provides matchmaking, WebSocket connection, and messaging for real-time games.
 *
 * Two modes:
 * - 'p2p': WebRTC peer-to-peer with server-relayed signaling (e.g. ぷよぷよ)
 * - 'relay': All messages relayed through server (e.g. メカアクション)
 */

import { sendRequest } from './messaging.js';

let _ws = null;
let _roomWs = null;
let _matchCallback = null;
let _messageCallbacks = [];
let _disconnectCallbacks = [];
let _currentMatch = null;
let _pingInterval = null;
let _lastPong = 0;
let _latency = 0;

/**
 * Join matchmaking queue for the current game.
 *   code  — private/fixed-code match (always unranked)
 *   queue — 'ranked' (rating-window matching, rated) | 'casual' (first come, unrated).
 *           Omit both for the legacy queue (rated, original behaviour).
 * Whether the match is rated is decided by the server: see match.ranked / match.queue.
 * @param {{ mode?: 'p2p' | 'relay', maxPlayers?: number, code?: string, queue?: 'ranked' | 'casual' }} options
 * @returns {Promise<{ roomId, role, seed, opponent, players, ranked, queue, rating, wsUrl, token, mode }>}
 */
export async function joinQueue({ mode = 'relay', maxPlayers = 2, code, queue } = {}) {
  // Request ephemeral token + matchmaking via PlatformBridge
  const result = await sendRequest('multiplayer.joinQueue', { mode, maxPlayers }, 30000);

  // result: { wsUrl, token, gameId }
  // Connect to matchmaking WebSocket. A `code` makes it a private friend match
  // (matches only same-code players, no rating).
  return new Promise((resolve, reject) => {
    let wsUrl = `${result.wsUrl}/matchmaking/${result.gameId}?token=${encodeURIComponent(result.token)}&mode=${mode}&maxPlayers=${maxPlayers}`;
    if (code) wsUrl += `&code=${encodeURIComponent(code)}`;
    else if (queue === 'ranked' || queue === 'casual') wsUrl += `&queue=${queue}`;
    _ws = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      if (_ws) {
        _ws.close();
        _ws = null;
      }
      reject(new Error('Matchmaking timeout'));
    }, 60000); // 60s matchmaking timeout

    _ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'match_found') {
          clearTimeout(timeout);
          _currentMatch = {
            roomId: data.roomId,
            role: data.role,
            seed: data.seed,
            mode: data.mode,
            ranked: data.ranked !== false,
            queue: data.queue || (code ? 'code' : 'legacy'),
            rating: data.rating,
            maxPlayers: data.maxPlayers || maxPlayers,
            opponent: data.opponent,
            opponents: data.opponents,
            players: data.players,
            gameId: result.gameId,
            wsUrl: result.wsUrl,
            token: result.token,
          };
          if (_matchCallback) _matchCallback(_currentMatch);
          resolve(_currentMatch);
        }
      } catch { /* ignore */ }
    };

    _ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Matchmaking connection failed'));
    };

    _ws.onclose = (event) => {
      clearTimeout(timeout);
      // Normal close after match found is expected
      if (!_currentMatch) {
        reject(new Error('Matchmaking disconnected'));
      }
    };
  });
}

/**
 * Leave the matchmaking queue.
 */
export function leaveQueue() {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ type: 'leave' }));
    _ws.close();
  }
  _ws = null;
}

/**
 * Register a callback for when a match is found.
 * @param {function} callback
 */
export function onMatchFound(callback) {
  _matchCallback = callback;
}

/**
 * Connect to a game room WebSocket.
 * Called after matchmaking resolves with room info.
 * @param {string} wsUrl - Base WebSocket URL
 * @param {string} token - Ephemeral auth token
 * @param {{ roomId: string, role: string, gameId: string, mode: string, seed: number }} roomInfo
 * @returns {Promise<void>}
 */
export async function connect(wsUrl, token, roomInfo) {
  if (!roomInfo) roomInfo = _currentMatch;
  if (!roomInfo) throw new Error('No match info. Call joinQueue first.');

  const params = new URLSearchParams({
    token,
    role: roomInfo.role,
    gameId: roomInfo.gameId,
    mode: roomInfo.mode,
    seed: String(roomInfo.seed || 0),
    maxPlayers: String(roomInfo.maxPlayers || 2),
    ranked: roomInfo.ranked === false ? '0' : '1',
  });

  const url = `${wsUrl}/room/${roomInfo.roomId}?${params}`;

  return new Promise((resolve, reject) => {
    _roomWs = new WebSocket(url);

    _roomWs.onopen = () => {
      // Start ping interval for latency measurement
      _startPing();
      resolve();
    };

    _roomWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'pong') {
          _latency = Date.now() - data.timestamp;
          _lastPong = Date.now();
          return;
        }

        if (data.type === 'peer_disconnected') {
          for (const cb of _disconnectCallbacks) {
            cb(data);
          }
          return;
        }

        // Forward all other messages to registered callbacks
        for (const cb of _messageCallbacks) {
          cb(data);
        }
      } catch { /* ignore malformed */ }
    };

    _roomWs.onerror = () => {
      reject(new Error('Room connection failed'));
    };

    _roomWs.onclose = () => {
      _stopPing();
      for (const cb of _disconnectCallbacks) {
        cb({ type: 'peer_disconnected', userId: 'self', reason: 'connection_closed' });
      }
    };
  });
}

/**
 * Send a message to the game room.
 * @param {string} type - Message type (e.g. 'game_state', 'game_action', 'rtc_offer')
 * @param {*} data - Message payload
 * @param {number} [seq] - Optional sequence number
 */
export function send(type, data, seq) {
  if (!_roomWs || _roomWs.readyState !== WebSocket.OPEN) {
    console.warn('[Multiplayer] Not connected to room');
    return;
  }
  _roomWs.send(JSON.stringify({ type, payload: data, seq }));
}

/**
 * Register a callback for incoming game messages.
 * @param {function} callback
 */
export function onMessage(callback) {
  _messageCallbacks.push(callback);
}

/**
 * Report match result to the server.
 * Server collects both players' results and finalizes authoritatively.
 * @param {{ winnerId: string|null, scores: object }} result
 */
export function reportResult(result) {
  if (!_currentMatch) throw new Error('No active match');
  // Send via GameRoom WebSocket — server validates both sides agree
  send('game_result', result);
}

/**
 * Report that this match could not be played out fairly (no rating change for
 * anyone; the match is still recorded). reason: short ASCII, e.g. 'desync',
 * 'disconnect_before_start'. Send it INSTEAD of reportResult (one report per player).
 * @param {string} [reason]
 */
export function reportVoid(reason = 'void') {
  if (!_currentMatch) throw new Error('No active match');
  send('game_result', { void: String(reason || 'void').slice(0, 32) });
}

/**
 * The signed-in player's rating for this game.
 * @returns {Promise<{ rating, wins, losses, draws, games, rank: number|null, totalPlayers, provisional }>}
 *   Rejects with code 'AUTH_REQUIRED' when not logged in.
 */
export async function getMyRating() {
  return sendRequest('multiplayer.getMyRating', {}, 10000);
}

/**
 * Rating leaderboard for this game (no login needed).
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ entries: { rank, user_id, display_name, rating, wins, losses, draws, games }[], total }>}
 */
export async function getRatingLeaderboard({ limit = 50 } = {}) {
  return sendRequest('multiplayer.getRatingLeaderboard', { limit }, 10000);
}

/**
 * Disconnect from the game room.
 */
export function disconnect() {
  _stopPing();
  if (_roomWs) {
    _roomWs.close();
    _roomWs = null;
  }
  if (_ws) {
    _ws.close();
    _ws = null;
  }
  _currentMatch = null;
  _messageCallbacks = [];
  _disconnectCallbacks = [];
  _matchCallback = null;
}

/**
 * Register a callback for opponent disconnect.
 * @param {function} callback
 */
export function onOpponentDisconnect(callback) {
  _disconnectCallbacks.push(callback);
}

/**
 * Get the current round-trip latency in milliseconds.
 * @returns {number}
 */
export function getLatency() {
  return _latency;
}

/**
 * Get current match info (if in a match).
 * @returns {object|null}
 */
export function getCurrentMatch() {
  return _currentMatch;
}

function _startPing() {
  _stopPing();
  _pingInterval = setInterval(() => {
    if (_roomWs && _roomWs.readyState === WebSocket.OPEN) {
      _roomWs.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    }
  }, 2000);
}

function _stopPing() {
  if (_pingInterval) {
    clearInterval(_pingInterval);
    _pingInterval = null;
  }
}

// ---------------------------------------------------------------------------
// ICE servers (STUN + Cloudflare TURN) for WebRTC P2P
// ---------------------------------------------------------------------------

/**
 * STUN only. Used when TURN is unavailable (not logged in, outside the portal,
 * old portal without this method, server/API failure). Must match
 * STUN_ONLY_ICE_SERVERS in workers/api-gateway/src/lib/turn.ts.
 */
export const STUN_ONLY_ICE_SERVERS = Object.freeze([
  Object.freeze({ urls: Object.freeze(['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302']) }),
]);

// TURN credentials are valid for `ttl` seconds (server: 4h). Reuse them for a
// while so rematches don't refetch, but never hand out anything close to expiry.
const ICE_CACHE_MAX_MS = 10 * 60 * 1000;   // at most 10 minutes
const ICE_FAILURE_CACHE_MS = 30 * 1000;    // after a failure, retry after 30s
let _iceCache = null;                      // { servers, expiresAt }
let _iceInflight = null;

function _stunOnly() {
  return STUN_ONLY_ICE_SERVERS.map((s) => ({ urls: [...s.urls] }));
}

function _clone(servers) {
  return servers.map((s) => ({ ...s, urls: Array.isArray(s.urls) ? [...s.urls] : s.urls }));
}

/**
 * Get the iceServers to pass to `new RTCPeerConnection({ iceServers })`.
 * Never throws: on any failure it resolves to STUN only, so P2P still works
 * except between two CGNAT'd players.
 *
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<RTCIceServer[]>}
 */
export async function getIceServers({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && _iceCache && now < _iceCache.expiresAt) return _clone(_iceCache.servers);
  if (_iceInflight) return _clone(await _iceInflight);

  _iceInflight = (async () => {
    try {
      const res = await sendRequest('multiplayer.getIceServers', {}, 10000);
      const servers = Array.isArray(res?.iceServers) && res.iceServers.length ? res.iceServers : null;
      if (!servers) throw new Error('no iceServers');
      // Cache for min(10 min, half the credential lifetime). STUN-only answers
      // (turn:false, ttl 0) are cached briefly like a failure.
      const ttlMs = res.turn && res.ttl > 0 ? Math.min(ICE_CACHE_MAX_MS, (res.ttl * 1000) / 2) : ICE_FAILURE_CACHE_MS;
      _iceCache = { servers, expiresAt: Date.now() + ttlMs };
      return servers;
    } catch {
      const servers = _stunOnly();
      _iceCache = { servers, expiresAt: Date.now() + ICE_FAILURE_CACHE_MS };
      return servers;
    } finally {
      _iceInflight = null;
    }
  })();
  return _clone(await _iceInflight);
}

/** Test hook: forget cached ICE servers. */
export function _resetIceServersCache() {
  _iceCache = null;
  _iceInflight = null;
}
