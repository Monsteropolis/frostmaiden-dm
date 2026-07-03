// ============================================================
// TV APP (player side) — purely presentational. Hosts a room,
// waits for the DM's phone, renders whatever PlayerView arrives.
// Phase 1 ships the pairing screen + a structured live readout;
// Phase 2 replaces the readout with the real combat/exploration
// layouts. No DM state, no logic duplication — render only.
// ============================================================

import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { PlayerView } from './projection';
import { TransportStatus, makeRoomCode } from './transport';
import { PeerTransport } from './peer-transport';

const CODE_KEY = 'fmdm_tv_room';

const roomCode = signal<string>('');
const status = signal<TransportStatus>('idle');
const statusDetail = signal<string>('');
const view = signal<PlayerView | null>(null);

let transport: PeerTransport | null = null;

function boot() {
  // Stable code across reloads so the DM's saved code keeps working.
  let code = localStorage.getItem(CODE_KEY) ?? '';
  if (!code) { code = makeRoomCode(); localStorage.setItem(CODE_KEY, code); }
  roomCode.value = code;

  transport = new PeerTransport();
  transport.onStatus((s, d) => { status.value = s; statusDetail.value = d ?? ''; });
  transport.onMessage((m) => { if (m.t === 'view') view.value = m.view; });
  transport.host(code);
}

function newCode() {
  localStorage.removeItem(CODE_KEY);
  transport?.close();
  view.value = null;
  boot();
}

// --- UI ------------------------------------------------------------------------

function StatusPip() {
  const s = status.value;
  const cls = s === 'open' ? 'on' : s === 'reconnecting' || s === 'connecting' ? 'busy' : '';
  const label =
    s === 'open' ? 'Live' :
    s === 'waiting' ? 'Waiting for DM' :
    s === 'reconnecting' ? 'Reconnecting…' :
    s === 'error' ? `Error — ${statusDetail.value}` : '…';
  return (
    <div class="tv-conn">
      <span class={`tv-pip ${cls}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function PairingScreen() {
  return (
    <div class="tv-pairing">
      <div class="tv-wordmark"><span class="star-mark">✦</span> FROSTMAIDEN</div>
      <div class="tv-pair-label">On your phone, tap 📺 and enter this code:</div>
      <div class="tv-room-code">{roomCode.value}</div>
      <StatusPip />
      <button class="tv-newcode" onClick={newCode}>New code</button>
    </div>
  );
}

// Phase 1 readout — structured proof of live sync. Replaced by real
// combat/exploration layouts in Phase 2.
function LiveReadout({ v }: { v: PlayerView }) {
  return (
    <div class="tv-readout">
      <div class="tv-readout-head">
        <span class="tv-mode">{v.mode.toUpperCase()}</span>
        <span>{v.weather.icon} {v.weather.name}{v.weather.conSave ? ' · ✦ CON save' : ''}</span>
        <span>Day {v.day}</span>
        <span class="tv-loc">{v.location}</span>
        <StatusPip />
      </div>

      <div class="tv-readout-grid">
        <section>
          <h2>PARTY</h2>
          {v.party.length === 0 && <p class="tv-dim">No party yet</p>}
          {v.party.map((p) => (
            <div class="tv-row" key={p.id}>
              <strong>{p.name}</strong>
              <span>{p.hp}/{p.maxHp} HP</span>
              {p.inspiration && <span class="tv-inspo">✦</span>}
              {p.conditions.length > 0 && <span class="tv-dim">{p.conditions.join(', ')}</span>}
              {p.down && <span class="tv-down">DOWN {p.deathS}✓ {p.deathF}✗</span>}
            </div>
          ))}
          {v.allies.map((a) => (
            <div class="tv-row tv-dim" key={a.id}>
              <span>{a.emoji} {a.name}</span><span>{a.hpState}</span>
            </div>
          ))}
        </section>

        <section>
          <h2>{v.combat ? `COMBAT — ROUND ${v.combat.round}` : 'QUESTS'}</h2>
          {v.combat
            ? v.combat.combatants.map((c) => (
                <div class={`tv-row ${c.active ? 'tv-active' : ''}`} key={c.id}>
                  <span>{c.active ? '▶' : c.next ? '›' : ' '}</span>
                  <span>{c.emoji} {c.name}</span>
                  <span>{c.friendly ? `${c.hp}/${c.maxHp}` : c.hpState}</span>
                  <span class="tv-dim">init {c.init ?? '—'}</span>
                </div>
              ))
            : v.quests.map((q) => (
                <div class="tv-row" key={q.id}>
                  <span class={q.status === 'escalating' ? 'tv-escalating' : ''}>
                    {q.status === 'escalating' ? '⚠' : '·'} {q.name}
                  </span>
                  {q.town && <span class="tv-dim">{q.town}</span>}
                </div>
              ))}
        </section>
      </div>
    </div>
  );
}

export function TvApp() {
  useEffect(() => { boot(); return () => transport?.close(); }, []);
  const v = view.value;
  return (
    <div class="tv-frame">
      <div class="tv-safe">
        {v && status.value !== 'error' ? <LiveReadout v={v} /> : <PairingScreen />}
      </div>
    </div>
  );
}
