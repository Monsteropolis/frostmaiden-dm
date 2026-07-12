// ============================================================
// TV APP (player side) — purely presentational. Hosts a room,
// waits for the DM's phone, renders whatever PlayerView arrives.
//
// Layout philosophy (the "one focal element" rule):
//  - COMBAT: the initiative order IS the screen. It already carries
//    every HP/health descriptor, so there is no separate party panel.
//    The list is rotated so the active combatant is always the top
//    row — now / next / then — and long fights truncate to a
//    "+N MORE" footer instead of sliding off-screen.
//  - EXPLORATION: the scene art is the hero. Party lives in one
//    compact roster column (PCs one line each, familiars nested,
//    gold/rations/day as the roster's footer). Threads sit quietly
//    top-right under the thread-of-fate rule.
//  - The YouTube ambience player is mounted ONCE at the root so it
//    survives mode switches; it either overlays the scene slot
//    (mediaVisible) or collapses to an invisible speck and keeps
//    playing audio underneath everything.
// ============================================================

import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { PlayerView, PvCombatant, PvPc, PvAlly, HpState, PokeActive } from './projection';
import { TransportStatus, makeRoomCode } from './transport';
import { PeerTransport } from './peer-transport';
import { TvBackdrop } from './vfx';
import { sceneById, SCENES } from './scenes';
import { RealmStage } from './realm-stage';

const CODE_KEY = 'fmdm_tv_room';

const roomCode = signal<string>('');
const status = signal<TransportStatus>('idle');
const statusDetail = signal<string>('');
const view = signal<PlayerView | null>(null);
// Bumped when the DM taps "Enable sound" on their phone — the TV is passive.
const unmuteSignal = signal<number>(0);

let transport: PeerTransport | null = null;

function boot() {
  // Stable code across reloads so the DM's saved code keeps working.
  let code = localStorage.getItem(CODE_KEY) ?? '';
  if (!code) { code = makeRoomCode(); localStorage.setItem(CODE_KEY, code); }
  roomCode.value = code;

  transport = new PeerTransport();
  transport.onStatus((s, d) => { status.value = s; statusDetail.value = d ?? ''; });
  transport.onMessage((m) => {
    if (m.t === 'view') view.value = m.view;
    else if (m.t === 'unmute') unmuteSignal.value++;
  });
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

function DeathPips({ s, f }: { s: number; f: number }) {
  return (
    <span class="tv-deathsaves">
      {[0, 1, 2].map((i) => <span class={`ds ${i < s ? 'ok' : ''}`}>●</span>)}
      <span class="ds-sep">·</span>
      {[0, 1, 2].map((i) => <span class={`ds ${i < f ? 'bad' : ''}`}>●</span>)}
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

// The scene card — shared by both modes. Module art letterboxes (contain),
// pixel scenes fill (cover). The ambience player overlays this exact slot
// when the DM toggles the video visible.
function SceneCard({ v }: { v: PlayerView }) {
  const scene = sceneById(v.sceneId) ?? SCENES[0];
  return (
    <section class={`tv-scene${scene.cat !== 'pixel' ? ' fit-contain' : ''}`}>
      <img src={scene.url} alt="" class="tv-scene-art" />
      <div class="tv-scene-caption">
        <span class="tv-scene-loc">{scene.cat === 'pixel' ? v.location : scene.name}</span>
        <span class="tv-scene-wx">{v.weather.icon} {v.weather.name}</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- combat mode

const MAX_INIT_ROWS = 9;

function InitRow({ c, flash }: { c: PvCombatant; flash: boolean }) {
  return (
    <div class={`tv-init-row ${c.active ? 'active' : ''} ${flash && c.active ? 'flash' : ''} ${c.hpState === 'down' ? 'down' : ''}`}>
      <span class="tv-init-marker">{c.active ? '▶' : c.next ? '›' : ''}</span>
      <span class="tv-init-num">{c.init ?? '—'}</span>
      <span class="tv-init-name">{c.emoji} {c.name}{c.next && <span class="tv-next-tag">NEXT</span>}</span>
      <CondChips conds={c.conditions} />
      {c.deathS !== null && c.deathF !== null && <DeathPips s={c.deathS} f={c.deathF} />}
      <span class="tv-init-hp">
        {c.friendly && c.hp !== null && c.maxHp !== null
          ? <TvHpBar hp={c.hp} max={c.maxHp} />
          : <HpPill s={c.hpState} />}
      </span>
    </div>
  );
}

export function CombatView({ v, flash = false, roundPulse = false, pokeActive = null }: {
  v: PlayerView; flash?: boolean; roundPulse?: boolean; pokeActive?: PokeActive | null;
}) {
  const combat = v.combat!;
  // Rotate so the active combatant leads: now, next, then. The order the
  // table actually thinks in — and long fights never push it off-screen.
  const list = combat.combatants;
  const activeIdx = Math.max(0, list.findIndex((c) => c.active));
  const rotated = [...list.slice(activeIdx), ...list.slice(0, activeIdx)];
  const shown = rotated.slice(0, MAX_INIT_ROWS);
  const hidden = rotated.length - shown.length;

  return (
    <div class="tv-combat">
      <section class="tv-init">
        <div class="tv-panel-head">
          <h2>INITIATIVE</h2>
          <span class={`tv-round ${roundPulse ? 'pulse' : ''}`}>ROUND {combat.round}</span>
        </div>
        <div class="tv-init-list">
          {shown.map((c) => <InitRow c={c} flash={flash} key={c.id} />)}
          {hidden > 0 && <div class="tv-init-more">+{hidden} MORE</div>}
        </div>
      </section>
      {v.slotView === 'realm'
        ? <section class="tv-scene idle-slot"><RealmStage v={v} pokeActive={pokeActive} /></section>
        : <SceneCard v={v} />}
    </div>
  );
}

// ---------------------------------------------------------------- exploration

// One line per soul: everything scannable at couch distance,
// familiars tucked under their person, the ledger as the roster's footer.
function RosterAlly({ a }: { a: PvAlly }) {
  return (
    <div class={`tv-roster-ally${a.down ? ' down' : ''}`}>
      <span class="tv-ally-tie">└</span>
      <span class="tv-roster-name">{a.emoji} {a.name}</span>
      {a.down
        ? <DeathPips s={a.deathS} f={a.deathF} />
        : <CondChips conds={a.conditions} />}
      <HpPill s={a.hpState} />
    </div>
  );
}

function RosterPc({ p, allies }: { p: PvPc; allies: PvAlly[] }) {
  return (
    <div class={`tv-roster-pc${p.down ? ' down' : ''}`}>
      <div class="tv-roster-row">
        <span class="tv-roster-name">{p.name}{p.inspiration && <span class="tv-inspo">✦</span>}</span>
        {p.down
          ? <DeathPips s={p.deathS} f={p.deathF} />
          : <CondChips conds={p.conditions} />}
        <span class="tv-roster-hp"><TvHpBar hp={p.hp} max={p.maxHp} /></span>
      </div>
      {allies.map((a) => <RosterAlly a={a} key={a.id} />)}
    </div>
  );
}

export function ExplorationView({ v, pokeActive = null }: { v: PlayerView; pokeActive?: PokeActive | null }) {
  const j = v.travel;
  const linked = (pcId: string) => v.allies.filter((a) => a.linkedPcId === pcId);
  const orphans = v.allies.filter((a) => !a.linkedPcId || !v.party.some((p) => p.id === a.linkedPcId));
  const r = v.resources;
  const lowFood = r.rations < r.partySize;

  return (
    <div class="tv-explore">
      {/* The roster — every soul, one line each, ledger at its feet */}
      <section class="tv-party-col">
        <div class="tv-panel-head"><h2>PARTY</h2></div>
        <div class="tv-roster">
          {v.party.map((p) => <RosterPc p={p} allies={linked(p.id)} key={p.id} />)}
          {orphans.map((a) => <RosterAlly a={a} key={a.id} />)}
        </div>
        <div class="tv-roster-ledger">
          <span class="tv-res">💰 {r.gold}<span class="tv-res-label">GOLD</span></span>
          <span class={`tv-res${lowFood ? ' low' : ''}`}>🍖 {r.rations}<span class="tv-res-label">RATIONS</span></span>
          <span class="tv-res">📅 {v.day}<span class="tv-res-label">DAY</span></span>
          {j && (
            <span class="tv-res journey">
              <span class="tv-journey-route">{j.origin} → {j.dest}</span>
              <span class="tv-journey-bar"><span class="tv-journey-fill" style={{ width: `${Math.min(100, (j.day / Math.max(1, j.totalDays)) * 100)}%` }} /></span>
              <span class="tv-res-label">{j.day}/{j.totalDays}</span>
            </span>
          )}
        </div>
      </section>

      <div class="tv-main-col">
        {/* Threads — quiet, top-right, under the thread of fate */}
        <div class="tv-threads">
          <span class="tv-threads-head">THREADS</span>
          {v.quests.length === 0 && <span class="tv-dim">No open threads</span>}
          {v.quests.map((q) => (
            <span class={`tv-thread ${q.status === 'escalating' ? 'escalating' : ''}`} key={q.id}>
              <span class="tv-thread-mark">{q.status === 'escalating' ? '⚠' : q.mainHook ? '✦' : '·'}</span>
              {q.name}
            </span>
          ))}
        </div>

        {/* The scene is the hero — or the party is, in idle mode */}
        {v.slotView === 'realm'
          ? <section class="tv-scene idle-slot"><RealmStage v={v} pokeActive={pokeActive} /></section>
          : <SceneCard v={v} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ambience

// Mounted once at the root: mode switches never unmount it, so the music
// never stops. Visible → tracks the scene card's rectangle and sits on it.
// Hidden → collapses to a 2px speck, still playing.
function AmbiencePlayer({ v }: { v: PlayerView | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const id = v?.youtubeId ?? '';
  const show = !!v?.mediaVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const slot = document.querySelector('.tv-scene');
      if (!show || !slot) {
        el.style.width = '2px'; el.style.height = '2px';
        el.style.left = '-10px'; el.style.top = '-10px';
        el.style.opacity = '0';
        return;
      }
      const rc = slot.getBoundingClientRect();
      el.style.left = `${rc.left}px`; el.style.top = `${rc.top}px`;
      el.style.width = `${rc.width}px`; el.style.height = `${rc.height}px`;
      el.style.opacity = '1';
    };
    place();
    const iv = setInterval(place, 500);   // layouts shift with view updates
    window.addEventListener('resize', place);
    return () => { clearInterval(iv); window.removeEventListener('resize', place); };
  }, [show, v?.mode, v?.sceneId, id]);

  // The DM taps "Enable sound on TV" on their phone; it arrives as a signal
  // bump here and we unmute the player. (A muted autoplay is already running.)
  useEffect(() => {
    if (unmuteSignal.value <= 0) return;
    const win = iframeRef.current?.contentWindow;
    const cmd = (func: string, args: unknown[] = []) =>
      win?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    cmd('unMute'); cmd('setVolume', [60]); cmd('playVideo');
  }, [unmuteSignal.value, id]);

  if (!id) return null;
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return (
    <div ref={ref} class="tv-yt" aria-hidden={!show}>
      <iframe
        ref={iframeRef}
        class="tv-yt-frame"
        src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&rel=0&enablejsapi=1&origin=${encodeURIComponent(origin)}`}
        allow="autoplay; encrypted-media"
        title="Ambience"
      />
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

  // Poke one-shot: DM bumps tv.poke.seq → play the reaction for 2.6s.
  const [pokeActive, setPokeActive] = useState<PokeActive | null>(null);
  const prevPoke = useRef<number>(-1);
  useEffect(() => {
    const seq = v?.poke?.seq ?? 0;
    if (prevPoke.current >= 0 && seq > prevPoke.current && v?.poke) {
      setPokeActive({ seq, target: v.poke.target, kind: v.poke.kind });
      const t = setTimeout(() => setPokeActive(null), 2600);
      prevPoke.current = seq;
      return () => clearTimeout(t);
    }
    prevPoke.current = seq;
  }, [v?.poke?.seq]);

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
              ? <CombatView v={v} flash={flash} roundPulse={roundPulse} pokeActive={pokeActive} />
              : v.idleFull
                ? <section class="tv-scene idle-slot full"><RealmStage v={v} full pokeActive={pokeActive} /></section>
                : <ExplorationView v={v} pokeActive={pokeActive} />}
          </>
        ) : <PairingScreen />}
      </div>
      <AmbiencePlayer v={v && status.value !== 'error' ? v : null} />
    </div>
  );
}

export { AmbiencePlayer };
