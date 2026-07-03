// ============================================================
// PEERJS TRANSPORT — WebRTC data channel, brokered by the free
// public PeerJS server. The broker only handles the handshake;
// PlayerView data flows phone → TV directly over the LAN.
//
// PeerJS is lazy-imported so the DM app (and the happy-dom sim
// suite) pays nothing until a connection is actually started.
//
// Reconnect strategy:
//  - TV (host): if the peer disconnects from the broker, call
//    reconnect(); if it's destroyed, re-host the same code.
//  - DM (join): on connection close/error, redial with backoff
//    (1s → 2s → 4s … capped 15s) until close() is called.
// ============================================================

import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { TvTransport, TvMessage, TransportStatus } from './transport';

const PEER_PREFIX = 'fmdm-rime-';

export class PeerTransport implements TvTransport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private msgCb: (m: TvMessage) => void = () => {};
  private statusCb: (s: TransportStatus, d?: string) => void = () => {};
  private role: 'host' | 'join' | null = null;
  private roomCode = '';
  private closed = false;
  private retryMs = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  onMessage(cb: (m: TvMessage) => void) { this.msgCb = cb; }
  onStatus(cb: (s: TransportStatus, d?: string) => void) { this.statusCb = cb; }

  private setStatus(s: TransportStatus, d?: string) {
    if (!this.closed || s === 'idle') this.statusCb(s, d);
  }

  private async makePeer(id?: string): Promise<Peer> {
    const { default: PeerCtor } = await import('peerjs');
    return id ? new PeerCtor(id) : new PeerCtor();
  }

  // --- TV side ---------------------------------------------------------------

  async host(roomCode: string) {
    this.role = 'host'; this.roomCode = roomCode; this.closed = false;
    this.setStatus('waiting');
    try {
      const peer = await this.makePeer(PEER_PREFIX + roomCode);
      this.peer = peer;

      peer.on('connection', (conn) => {
        // A new DM connection replaces any stale one.
        this.conn?.close();
        this.conn = conn;
        this.wireConn(conn, () => {
          // DM dropped — keep hosting, go back to waiting.
          if (!this.closed) this.setStatus('waiting', 'DM disconnected');
        });
      });

      peer.on('disconnected', () => {
        if (this.closed) return;
        this.setStatus('reconnecting', 'lost broker');
        peer.reconnect();
      });
      peer.on('error', (err) => {
        if (this.closed) return;
        if ((err as { type?: string }).type === 'unavailable-id') {
          this.setStatus('error', 'Room code in use — generate a new one');
        } else {
          // Broker hiccup: destroy and re-host after a beat.
          this.scheduleRetry(() => this.host(this.roomCode));
        }
      });
    } catch (err) {
      this.setStatus('error', String(err));
    }
  }

  // --- DM side ---------------------------------------------------------------

  async join(roomCode: string) {
    this.role = 'join'; this.roomCode = roomCode; this.closed = false;
    this.setStatus('connecting');
    try {
      if (!this.peer) this.peer = await this.makePeer();
      const peer = this.peer;
      if (this.closed) return;

      const dial = () => {
        if (this.closed) return;
        const conn = peer.connect(PEER_PREFIX + this.roomCode, { reliable: true });
        this.conn = conn;
        this.wireConn(conn, () => this.scheduleRetry(() => { this.setStatus('reconnecting'); dial(); }));
      };

      if (peer.open) dial();
      else {
        peer.on('open', dial);
        peer.on('error', () => { if (!this.closed) this.scheduleRetry(() => this.join(this.roomCode)); });
        peer.on('disconnected', () => { if (!this.closed) { this.setStatus('reconnecting'); peer.reconnect(); } });
      }
    } catch (err) {
      this.setStatus('error', String(err));
    }
  }

  // --- shared ------------------------------------------------------------------

  private wireConn(conn: DataConnection, onDrop: () => void) {
    conn.on('open', () => {
      this.retryMs = 1000;
      this.setStatus('open');
      conn.send({ t: 'hello', from: this.role === 'host' ? 'tv' : 'dm' } satisfies TvMessage);
    });
    conn.on('data', (data) => {
      const m = data as TvMessage;
      if (m && typeof m === 'object' && 't' in m) this.msgCb(m);
    });
    conn.on('close', onDrop);
    conn.on('error', onDrop);
  }

  private scheduleRetry(fn: () => void) {
    if (this.closed) return;
    clearTimeout(this.retryTimer);
    this.peer?.destroy(); this.peer = null; this.conn = null;
    this.setStatus('reconnecting');
    this.retryTimer = setTimeout(fn, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 15000);
  }

  send(msg: TvMessage) {
    if (this.conn?.open) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    this.conn?.close(); this.conn = null;
    this.peer?.destroy(); this.peer = null;
    this.setStatus('idle');
  }
}
