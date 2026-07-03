// ============================================================
// TV PANEL (DM side) — pair with the Player TV View.
// Opened from the 📺 header button. Type the room code shown on
// the TV, connect, done. Last code persists in state so next
// session's reconnect is one tap.
// ============================================================

import { useState } from 'preact/hooks';
import { state, patch } from '../state/store';
import { Sheet } from './ui';
import { startBroadcast, stopBroadcast, tvStatus, tvStatusDetail } from '../tv/broadcaster';
import { normalizeRoomCode } from '../tv/transport';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  open: 'Live on TV',
  reconnecting: 'Reconnecting…',
  error: 'Connection failed',
  waiting: '—',
};

export function tvPipClass(): string {
  const s = tvStatus.value;
  if (s === 'open') return 'tv-pip on';
  if (s === 'connecting' || s === 'reconnecting') return 'tv-pip busy';
  return 'tv-pip';
}

export function TvPanel({ onClose }: { onClose: () => void }) {
  const saved = state.value.tv.lastRoomCode;
  const [code, setCode] = useState(saved);
  const status = tvStatus.value;
  const live = status === 'open' || status === 'connecting' || status === 'reconnecting';

  const connect = () => {
    const c = normalizeRoomCode(code);
    if (c.length < 4) return;
    patch((d) => { d.tv.lastRoomCode = c; });
    startBroadcast(c);
  };

  return (
    <Sheet open title="Player TV View" onClose={onClose}>
      <p class="tv-help">
        Open <strong>tv.html</strong> on the TV browser — it shows a room code.
        Enter it here and everything player-safe mirrors live: party HP,
        initiative, weather, active quests. Secrets stay on this phone.
      </p>

      <div class="field">
        <label>Room code (shown on the TV)</label>
        <input
          class="input tv-code-input"
          value={code}
          placeholder="e.g. FRK4Q7"
          maxLength={8}
          onInput={(e) => setCode(normalizeRoomCode((e.target as HTMLInputElement).value))}
        />
      </div>

      <div class="tv-status-row">
        <span class={tvPipClass()} aria-hidden="true" />
        <span>{STATUS_LABEL[status] ?? status}</span>
        {tvStatusDetail.value && <span class="tv-status-detail">{tvStatusDetail.value}</span>}
      </div>

      <div class="tv-actions">
        {!live && (
          <button class="btn primary" disabled={normalizeRoomCode(code).length < 4} onClick={connect}>
            Connect to TV
          </button>
        )}
        {live && (
          <button class="btn" onClick={stopBroadcast}>Disconnect</button>
        )}
      </div>
    </Sheet>
  );
}
