// ============================================================
// BROADCASTER (DM side) — watches the state signal, projects it
// through projectPlayerView(), and pushes to the TV, debounced
// 150ms so HP-tap bursts coalesce into one frame.
// Singleton module: the TvPanel drives it; status is a signal so
// the header pip stays live everywhere.
// ============================================================

import { signal, effect } from '@preact/signals';
import { state } from '../state/store';
import { projectPlayerView } from './projection';
import { TvTransport, TransportStatus } from './transport';
import { PeerTransport } from './peer-transport';

export const tvStatus = signal<TransportStatus>('idle');
export const tvStatusDetail = signal<string>('');

let transport: TvTransport | null = null;
let stopWatching: (() => void) | null = null;
let sendTimer: ReturnType<typeof setTimeout> | undefined;

function pushView() {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    transport?.send({ t: 'view', view: projectPlayerView(state.value) });
  }, 150);
}

export function startBroadcast(roomCode: string) {
  stopBroadcast();
  transport = new PeerTransport();
  transport.onStatus((s, d) => {
    tvStatus.value = s;
    tvStatusDetail.value = d ?? '';
    if (s === 'open') pushView(); // full frame on (re)connect
  });
  transport.join(roomCode);

  // Every state change re-projects and pushes. effect() returns a disposer.
  stopWatching = effect(() => {
    void state.value;           // subscribe
    if (tvStatus.value === 'open') pushView();
  });
}

export function stopBroadcast() {
  clearTimeout(sendTimer);
  stopWatching?.(); stopWatching = null;
  transport?.close(); transport = null;
  tvStatus.value = 'idle';
  tvStatusDetail.value = '';
}
