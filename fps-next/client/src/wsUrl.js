/**
 * Resolve the dedicated game server independently of where the static site lives.
 * A Vercel frontend can point at a persistent HTTPS/WebSocket host by setting
 * VITE_WS_URL=wss://game.example.com/ws during its build.
 */
export function resolveSocketUrl(pageUrl, override = '') {
  const page = new URL(pageUrl);
  if (!['http:', 'https:'].includes(page.protocol)) {
    throw new Error('Game page must be served over HTTP or HTTPS.');
  }

  const configured = String(override ?? '').trim();
  if (!configured) {
    return `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//${page.host}/ws`;
  }

  const url = new URL(configured);
  if (!['ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('VITE_WS_URL must start with ws:// or wss://.');
  }
  if (page.protocol === 'https:' && url.protocol !== 'wss:') {
    throw new Error('HTTPS sites require wss:// for the game server.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_WS_URL must not contain credentials, query parameters or a fragment.');
  }
  // Both `wss://host` and the explicit `wss://host/ws` work.
  if (url.pathname === '/') url.pathname = '/ws';
  return url.href;
}

/** Render free services can take around a minute to wake on the first connection. */
export function socketOpenTimeoutMs(socketUrl) {
  const hostname = new URL(socketUrl).hostname.toLowerCase();
  return hostname.endsWith('.onrender.com') ? 90_000 : 8_000;
}
