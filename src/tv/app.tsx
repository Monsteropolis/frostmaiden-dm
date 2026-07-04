// ============================================================
// TV APP (player side) — purely presentational. Hosts a room,
// waits for the DM's phone, renders whatever PlayerView arrives.
// Phase 2: real combat + exploration layouts, frame-based motion
// (turn flash, round pulse — all steps(), no easing). No DM
// state, no logic duplication — render only.
// ============================================================

import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { PlayerView, PvCombatant, PvPc, PvAlly, HpState } from './projection';
import { TransportStatus, makeRoomCode } from './transport';
import { PeerTransport } from './peer-transport';
import { TvBackdrop } from './vfx';
import iconsUrl from '../assets/pixel_icons.png';
import idlePartyUrl from '../assets/party_idle.png';

// pixel icon chip from the shared atlas (5 × 32px cells)
const ICON_IDX: Record<string, number> = { gold: 0, meat: 1, sun: 2, moon: 3, flake: 4 };
function PixelIcon({ name }: { name: string }) {
  return (
    <span
      class="tv-px-icon"
      aria-hidden="true"
      style={{ backgroundImage: `url(${iconsUrl})`, backgroundPosition: `${-(ICON_IDX[name] ?? 0) * 32}px 0` }}
    />
  );
}

// the little pixel party idling at the foot of the scene — 4 souls, out of sync
function IdleParty() {
  return (
    <div class="tv-idle-party" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          class="tv-idle-char"
          style={{
            backgroundImage: `url(${idlePartyUrl})`,
            backgroundPositionX: `${-i * 16}px`,
            animationDelay: `${i * 0.45}s`,
          }}
        />
      ))}
    </div>
  );
}
import { sceneById, SCENES } from './scenes';

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

// ---------------------------------------------------------------- shared bits

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

const HP_LABEL: Record<HpState, string> = {
  healthy: 'HEALTHY', bloodied: 'BLOODIED', critical: 'CRITICAL', down: 'DOWN',
};

function HpPill({ s }: { s: HpState }) {
  return <span class={`tv-hp-pill ${s}`}>{HP_LABEL[s]}</span>;
}

function TvHpBar({ hp, max }: { hp: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const state: HpState = hp <= 0 ? 'down' : pct <= 25 ? 'critical' : pct <= 50 ? 'bloodied' : 'healthy';
  return (
    <div class={`tv-hpbar ${state}`}>
      <div class="tv-hpbar-fill" style={{ width: `${pct}%` }} />
      <span class="tv-hpbar-num">{hp}/{max}</span>
    </div>
  );
}

function CondChips({ conds }: { conds: string[] }) {
  if (!conds.length) return null;
  return (
    <span class="tv-conds">
      {conds.map((c) => <span class="tv-cond" key={c}>{c}</span>)}
    </span>
  );
}

function TopStrip({ v }: { v: PlayerView }) {
  return (
    <div class="tv-strip">
      <span class="tv-strip-loc">{v.location}</span>
      <span class="tv-strip-mode">{v.mode === 'combat' ? '⚔ COMBAT' : '✦ EXPLORATION'}</span>
      <span class="tv-strip-wx">
        {v.weather.icon} {v.weather.name}
        {v.weather.conSave && <span class="tv-consave">✦ CON SAVE</span>}
        <span class="tv-strip-day">Day {v.day}</span>
      </span>
      <StatusPip />
    </div>
  );
}

// ---------------------------------------------------------------- combat mode

function InitRow({ c, flash }: { c: PvCombatant; flash: boolean }) {
  return (
    <div class={`tv-init-row ${c.active ? 'active' : ''} ${flash && c.active ? 'flash' : ''} ${c.hpState === 'down' ? 'down' : ''}`}>
      <span class="tv-init-marker">{c.active ? '▶' : c.next ? '›' : ''}</span>
      <span class="tv-init-num">{c.init ?? '—'}</span>
      <span class="tv-init-name">{c.emoji} {c.name}{c.next && <span class="tv-next-tag">NEXT</span>}</span>
      <CondChips conds={c.conditions} />
      <span class="tv-init-hp">
        {c.friendly && c.hp !== null && c.maxHp !== null
          ? <TvHpBar hp={c.hp} max={c.maxHp} />
          : <HpPill s={c.hpState} />}
      </span>
    </div>
  );
}

function AllyRow({ a }: { a: PvAlly }) {
  return (
    <div class={`tv-ally nested${a.down ? ' down' : ''}`}>
      <span class="tv-ally-tie">└</span>
      <span class="tv-ally-name">{a.emoji} {a.name}</span>
      {a.down && (
        <span class="tv-deathsaves">
          {[0, 1, 2].map((i) => <span class={`ds ${i < a.deathS ? 'ok' : ''}`}>●</span>)}
          <span class="ds-sep">·</span>
          {[0, 1, 2].map((i) => <span class={`ds ${i < a.deathF ? 'bad' : ''}`}>●</span>)}
        </span>
      )}
      <CondChips conds={a.conditions} />
      <HpPill s={a.hpState} />
    </div>
  );
}

function PartyCard({ p, allies = [] }: { p: PvPc; allies?: PvAlly[] }) {
  return (
    <div class={`tv-pc ${p.down ? 'down' : ''}`}>
      <div class="tv-pc-head">
        <span class="tv-pc-name">{p.name}{p.inspiration && <span class="tv-inspo" title="Inspiration">✦</span>}</span>
        <span class="tv-pc-cls">{p.cls}</span>
      </div>
      <TvHpBar hp={p.hp} max={p.maxHp} />
      <div class="tv-pc-foot">
        <CondChips conds={p.conditions} />
        {p.down && (
          <span class="tv-deathsaves">
            {[0, 1, 2].map((i) => <span class={`ds ${i < p.deathS ? 'ok' : ''}`}>●</span>)}
            <span class="ds-sep">·</span>
            {[0, 1, 2].map((i) => <span class={`ds ${i < p.deathF ? 'bad' : ''}`}>●</span>)}
          </span>
        )}
      </div>
      {allies.map((a) => <AllyRow a={a} key={a.id} />)}
    </div>
  );
}

export function CombatView({ v, flash = false, roundPulse = false }: {
  v: PlayerView; flash?: boolean; roundPulse?: boolean;
}) {
  const combat = v.combat!;
  return (
    <div class="tv-combat">
      <section class="tv-init">
        <div class="tv-panel-head">
          <h2>INITIATIVE</h2>
          <span class={`tv-round ${roundPulse ? 'pulse' : ''}`}>ROUND {combat.round}</span>
        </div>
        <div class="tv-init-list">
          {combat.combatants.map((c) => <InitRow c={c} flash={flash} key={c.id} />)}
        </div>
      </section>
      <section class="tv-party">
        <div class="tv-panel-head"><h2>PARTY</h2></div>
        {v.party.map((p) => (
          <PartyCard p={p} key={p.id}
            allies={v.allies.filter((a) => a.linkedPcId === p.id)} />
        ))}
        {v.allies.filter((a) => !a.linkedPcId || !v.party.some((p) => p.id === a.linkedPcId)).map((a) => (
          <AllyRow a={a} key={a.id} />
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- exploration

export function ExplorationView({ v }: { v: PlayerView }) {
  const j = v.travel;
  const scene = sceneById(v.sceneId) ?? SCENES[0];
  const linked = (pcId: string) => v.allies.filter((a) => a.linkedPcId === pcId);
  const orphans = v.allies.filter((a) => !a.linkedPcId || !v.party.some((p) => p.id === a.linkedPcId));
  const r = v.resources;
  const lowFood = r.rations < r.partySize;

  return (
    <div class="tv-explore">
      {/* The party, stacked on the left — allies ride under their PC */}
      <section class="tv-party-col">
        <div class="tv-panel-head"><h2>PARTY</h2></div>
        {v.party.map((p) => <PartyCard p={p} allies={linked(p.id)} key={p.id} />)}
        {orphans.length > 0 && (
          <div class="tv-orphans">
            {orphans.map((a) => (
              <div class="tv-ally" key={a.id}>
                <span class="tv-ally-name">{a.emoji} {a.name}</span>
                <HpPill s={a.hpState} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div class="tv-main-col">
        {/* Where the party is — the DM-chosen scene (pixel mood or module art) */}
        <section class={`tv-scene${scene.cat !== 'pixel' ? ' fit-contain' : ''}`}>
          <img src={scene.url} alt="" class="tv-scene-art" />
          {scene.cat === 'pixel' && <IdleParty />}
          <div class="tv-scene-caption">
            <span class="tv-scene-loc">{scene.cat === 'pixel' ? v.location : scene.name}</span>
            <span class="tv-scene-wx">{v.weather.icon} {v.weather.name}</span>
          </div>
        </section>

        {/* Party resources — the ledger of survival */}
        <section class="tv-resources">
          <span class="tv-res"><PixelIcon name="gold" />{r.gold}<span class="tv-res-label">GOLD</span></span>
          <span class={`tv-res${lowFood ? ' low' : ''}`}><PixelIcon name="meat" />{r.rations}<span class="tv-res-label">RATIONS</span></span>
          <span class="tv-res"><PixelIcon name="sun" />{v.day}<span class="tv-res-label">DAY</span></span>
          {j && (
            <span class="tv-res journey">
              <span class="tv-journey-route">{j.origin} → {j.dest}</span>
              <span class="tv-journey-bar"><span class="tv-journey-fill" style={{ width: `${Math.min(100, (j.day / Math.max(1, j.totalDays)) * 100)}%` }} /></span>
              <span class="tv-res-label">DAY {j.day}/{j.totalDays}</span>
            </span>
          )}
        </section>

        {/* Ambience — DM-chosen YouTube; starts muted per browser policy */}
        {v.youtubeId && (
          <section class="tv-ambience">
            <iframe
              class="tv-ambience-frame"
              src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}?autoplay=1&mute=1&loop=1&playlist=${v.youtubeId}&rel=0`}
              allow="autoplay; encrypted-media"
              title="Ambience"
            />
          </section>
        )}

        {/* Objectives */}
        <section class="tv-quests">
          <div class="tv-panel-head"><h2>OBJECTIVES</h2></div>
          {v.quests.length === 0 && <p class="tv-dim">No active objectives</p>}
          {v.quests.map((q) => (
            <div class={`tv-quest ${q.status === 'escalating' ? 'escalating' : ''}`} key={q.id}>
              <span class="tv-quest-mark">{q.status === 'escalating' ? '⚠' : q.mainHook ? '✦' : '·'}</span>
              <span class="tv-quest-name">{q.name}</span>
              {q.town && <span class="tv-quest-town">{q.town}</span>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pairing

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

// ---------------------------------------------------------------- root

export function TvApp() {
  useEffect(() => { boot(); return () => transport?.close(); }, []);
  const v = view.value;

  // Frame-based spectacle triggers: flash on turn change, pulse on round change.
  const [flash, setFlash] = useState(false);
  const [roundPulse, setRoundPulse] = useState(false);
  const prevActive = useRef<string | null>(null);
  const prevRound = useRef<number>(-1);

  useEffect(() => {
    const activeId = v?.combat?.combatants.find((c) => c.active)?.id ?? null;
    if (activeId && prevActive.current && activeId !== prevActive.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
    prevActive.current = activeId;
  }, [v?.combat?.combatants.find((c) => c.active)?.id]);

  useEffect(() => {
    const activeId = v?.combat?.combatants.find((c) => c.active)?.id ?? null;
    prevActive.current = activeId;
  }, [v]);

  useEffect(() => {
    const r = v?.combat?.round ?? -1;
    if (r > 0 && prevRound.current > 0 && r !== prevRound.current) {
      setRoundPulse(true);
      const t = setTimeout(() => setRoundPulse(false), 800);
      prevRound.current = r;
      return () => clearTimeout(t);
    }
    prevRound.current = r;
  }, [v?.combat?.round]);

  return (
    <div class="tv-frame">
      <TvBackdrop weatherId={v?.weather.id ?? 'light_snow'} />
      <div class="tv-safe">
        {v && status.value !== 'error' ? (
          <>
            <TopStrip v={v} />
            {v.mode === 'combat' && v.combat
              ? <CombatView v={v} flash={flash} roundPulse={roundPulse} />
              : <ExplorationView v={v} />}
          </>
        ) : <PairingScreen />}
      </div>
    </div>
  );
}
