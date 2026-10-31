// The lobby displays human players in this game's own rooms. Bots are excluded,
// and failed requests remain unknown instead of implying that nobody is online.
export function countOnlineByMode(payload) {
  if (!Array.isArray(payload?.rooms)) throw new Error('Invalid room response');
  const byMode = Object.create(null);
  let total = 0;
  for (const room of payload.rooms) {
    if (typeof room?.mode !== 'string' || !Number.isSafeInteger(room.humans)
      || room.humans < 0 || room.humans > 16) continue;
    total += room.humans;
    byMode[room.mode] = (byMode[room.mode] ?? 0) + room.humans;
  }
  return { total, byMode };
}

export function startMenuPresence({ root = document, intervalMs = 15_000,
  fetchRooms = () => fetch('/api/rooms', { cache: 'no-store' }) } = {}) {
  const onlineCount = root.getElementById('online-count');
  const modes = [...root.querySelectorAll('[data-online-mode]')];
  let pending = false;

  async function refresh() {
    if (pending) return;
    pending = true;
    try {
      const response = await fetchRooms();
      if (!response.ok) throw new Error(`Room service HTTP ${response.status}`);
      const { total, byMode } = countOnlineByMode(await response.json());
      if (onlineCount) onlineCount.textContent = `${total} ONLINE`;
      for (const el of modes) el.textContent = `${byMode[el.dataset.onlineMode] ?? 0} ONLINE`;
    } catch {
      if (onlineCount) onlineCount.textContent = '— ONLINE';
      for (const el of modes) el.textContent = '— ONLINE';
    } finally {
      pending = false;
    }
  }

  void refresh();
  const interval = setInterval(() => {
    if (!root.hidden) void refresh();
  }, intervalMs);
  root.addEventListener?.('visibilitychange', () => {
    if (!root.hidden) void refresh();
  });
  return { refresh, stop: () => clearInterval(interval) };
}
