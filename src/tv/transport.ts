// ============================================================
// TRANSPORT INTERFACE — how PlayerView travels phone → TV.
// Implementations live behind this boundary so the wire can be
// swapped (PeerJS today; Firebase/WS relay tomorrow) without
// touching the projection, the DM panel, or the TV app.
// ============================================================

import { PlayerView } from './projection';

export type TvMessage =
  | { t: 'view'; view: PlayerView }
  | { t: 'hello'; from: 'dm' | 'tv' }
  | { t: 'unmute' };   // DM → TV: enable ambience sound (TV is passive, can't be tapped)

export type TransportStatus =
  | 'idle'          // not started
  | 'waiting'       // TV: hosting, no DM connected yet
  | 'connecting'    // DM: dialing the room
  | 'open'          // live
  | 'reconnecting'  // dropped, retrying automatically
  | 'error';        // unrecoverable (bad code / broker down)

export interface TvTransport {
  /** TV side: claim a room code and wait for the DM to dial in. */
  host(roomCode: string): void;
  /** DM side: connect to a hosting TV by room code. */
  join(roomCode: string): void;
  send(msg: TvMessage): void;
  onMessage(cb: (msg: TvMessage) => void): void;
  onStatus(cb: (status: TransportStatus, detail?: string) => void): void;
  close(): void;
}

/** Room codes: 6 chars, unambiguous alphabet (no 0/O/1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(): string {
  let out = '';
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
