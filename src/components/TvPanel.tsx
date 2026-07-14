// ============================================================
// TV PANEL (DM side) — pair with the Player TV View.
// Opened from the 📺 header button. Type the room code shown on
// the TV, connect, done. Last code persists in state so next
// session's reconnect is one tap.
// ============================================================

import { useState } from 'preact/hooks';
import { state, patch } from '../state/store';
import { Sheet } from './ui';
import { startBroadcast, stopBroadcast, unmuteTv, tvStatus, tvStatusDetail } from '../tv/broadcaster';
import { normalizeRoomCode } from '../tv/transport';
import { SCENES, SCENE_CATS, SceneCat } from '../tv/scenes';
import { projectPlayerView, type PokeKind } from '../tv/projection';

/** Accepts full URLs (watch?v=, youtu.be/, shorts/, embed/) or a bare 11-char id. */
export function parseYouTubeId(input: string): string | null {
  const t = input.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

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
  const [openCat, setOpenCat] = useState<SceneCat | null>(null);
  const [yt, setYt] = useState(state.value.tv.youtubeId);
  const [copied, setCopied] = useState<{ kb: string; withheld: number } | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [soundSent, setSoundSent] = useState(false);
  const status = tvStatus.value;
  const live = status === 'open' || status === 'connecting' || status === 'reconnecting';

  const connect = () => {
    const c = normalizeRoomCode(code);
    if (c.length < 4) return;
    patch((d) => { d.tv.lastRoomCode = c; });
    startBroadcast(c);
  };

  // Moments fire once — bump the poke seq and the TV plays the reaction.
  const fireMoment = (target: string, kind: PokeKind) =>
    patch((d) => { d.tv.poke = { seq: (d.tv.poke?.seq ?? 0) + 1, target, kind }; });

  // Copy the player-safe projection to the clipboard so the DM can paste it over
  // public/snapshot.json on GitHub. Everything goes through projectPlayerView —
  // the raw AppState (dormant quests, monster stats, prep) never leaves the phone.
  const copySnapshot = () => {
    const view = projectPlayerView(state.value);
    const json = JSON.stringify(view, null, 2);
    const withheld = Math.round((1 - JSON.stringify(view).length / JSON.stringify(state.value).length) * 100);
    const kb = (json.length / 1024).toFixed(1);
    navigator.clipboard.writeText(json).then(
      () => { setCopied({ kb, withheld }); setFallback(null); },
      () => { setCopied({ kb, withheld }); setFallback(json); }, // clipboard blocked — show the JSON to hand-copy
    );
  };

  return (
    <Sheet open title="Player TV View" onClose={onClose}>
      {/* 1 — header: code + status + connect, pinned at the top */}
      <div class="tv-panel-header">
        <div class="tv-header-row">
          <input
            class="input tv-code-input"
            value={code}
            placeholder="Room code"
            maxLength={8}
            onInput={(e) => setCode(normalizeRoomCode((e.target as HTMLInputElement).value))}
          />
          {!live
            ? <button class="btn primary" disabled={normalizeRoomCode(code).length < 4} onClick={connect}>Connect to TV</button>
            : <button class="btn" onClick={stopBroadcast}>Disconnect</button>}
        </div>
        <div class="tv-status-row">
          <span class={tvPipClass()} aria-hidden="true" />
          <span>{STATUS_LABEL[status] ?? status}</span>
          {tvStatusDetail.value && <span class="tv-status-detail">{tvStatusDetail.value}</span>}
        </div>
        <p class="tv-help">Open <strong>tv.html</strong> on the TV — it shows the code. Everything player-safe mirrors live; secrets stay on this phone.</p>
      </div>

      {/* 2 — display */}
      <div class="field">
        <label>Display — what fills the big space on the TV</label>
        <div class="chip-row tight">
          {(['scene', 'realm', 'video'] as const).map((sv) => (
            <button
              key={sv}
              class={`cond-chip${state.value.tv.slotView === sv ? ' on' : ''}`}
              disabled={sv === 'video' && !state.value.tv.youtubeId}
              onClick={() => patch((d) => { d.tv.slotView = sv; })}
            >{sv === 'scene' ? '🖼 Scene art' : sv === 'realm' ? '⛺ The Realm' : '📺 Video'}</button>
          ))}
        </div>
      </div>

      {/* 3 — layout (only meaningful for the Realm) */}
      <div class="field">
        <label>Layout</label>
        <div class="chip-row tight">
          {([['▭ Inset', false], ['⛶ Fullscreen', true]] as const).map(([lbl, full]) => (
            <button
              key={lbl}
              class={`cond-chip${state.value.tv.idleFull === full ? ' on' : ''}`}
              disabled={state.value.tv.slotView !== 'realm'}
              onClick={() => patch((d) => { d.tv.idleFull = full; })}
            >{lbl}</button>
          ))}
        </div>
        <p class="stat-fine">The Realm: your party mills about the scene, reacting to HP, weather, and the fight. Fullscreen takes over the whole exploration view.</p>
      </div>

      {/* 4 — moments: one-shots that fire, distinct from the radios above */}
      <div class="field">
        <label>Moments — fire a one-shot reaction on the Realm</label>
        <div class="chip-row tight">
          <button class="btn moment" onClick={() => fireMoment('party', 'cheer')}>🎉 Party cheer</button>
          <button class="btn moment" onClick={() => fireMoment('party', 'wave')}>👋 Wave</button>
          <button class="btn moment" disabled={!state.value.combat.active} onClick={() => fireMoment('foes', 'taunt')}>😈 Foes taunt</button>
        </div>
      </div>

      {/* 5 — scene art: collapsed. Auto is pinned; a category opens its grid. */}
      <div class="field">
        <label>Scene art</label>
        <button
          class={`scene-auto-tile${state.value.tv.sceneId === 'auto' ? ' on' : ''}`}
          onClick={() => patch((d) => { d.tv.sceneId = 'auto'; })}
        >✨ Auto — follows the weather and your journey</button>
        <div class="chip-row tight" style={{ marginTop: '8px' }}>
          {SCENE_CATS.map((c) => (
            <button
              key={c.id}
              class={`cond-chip${openCat === c.id ? ' on' : ''}`}
              onClick={() => setOpenCat(openCat === c.id ? null : c.id)}
            >{c.label}</button>
          ))}
        </div>
        {openCat && (
          <div class="scene-grid">
            {SCENES.filter((sc) => sc.cat === openCat).map((sc) => (
              <button
                key={sc.id}
                class={`scene-pick${state.value.tv.sceneId === sc.id ? ' on' : ''}`}
                onClick={() => patch((d) => { d.tv.sceneId = sc.id; })}
              >
                <img src={sc.url} alt="" class="scene-thumb" />
                <span class="scene-name">{sc.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 6 — ambience */}
      <div class="field">
        <label>Ambience — YouTube on the TV (lofi, tavern noise, storm howl…)</label>
        <div class="supply-row" style={{ gap: '8px' }}>
          <input
            class="input"
            style={{ flex: 1 }}
            placeholder="Paste a YouTube link or video id"
            value={yt}
            onInput={(e) => setYt((e.target as HTMLInputElement).value)}
          />
          <button class="btn" disabled={!parseYouTubeId(yt)} onClick={() => {
            const id = parseYouTubeId(yt);
            if (id) patch((d) => { d.tv.youtubeId = id; });
          }}>Play</button>
          {state.value.tv.youtubeId && (
            <button class="btn ghost" onClick={() => { setYt(''); patch((d) => { d.tv.youtubeId = ''; if (d.tv.slotView === 'video') d.tv.slotView = 'scene'; }); }}>Stop</button>
          )}
        </div>
        {state.value.tv.youtubeId && (
          <button
            class="btn wide"
            style={{ marginTop: '8px' }}
            disabled={status !== 'open'}
            onClick={() => { unmuteTv(); setSoundSent(true); }}
          >🔊 Enable sound on TV</button>
        )}
        {soundSent && (
          <p class="stat-fine" style={{ color: 'var(--frost)' }}>
            Sound command sent. The TV keeps retrying for a few seconds — if it stays
            silent, its browser wants one real press: click or hit OK on the TV once
            and the sound comes on.
          </p>
        )}
        <p class="stat-fine">
          {state.value.tv.youtubeId
            ? status === 'open'
              ? `Loaded (${state.value.tv.youtubeId}). Choose 📺 Video above to show it, or leave it as audio under the scene. It starts muted — tap 🔊 Enable sound on TV (here on your phone) to turn it up.`
              : `Loaded (${state.value.tv.youtubeId}). Connect to the TV first, then 🔊 Enable sound on TV — the sound turns on from your phone, since the TV can't be tapped.`
            : 'Paste a link, then choose 📺 Video to show it — or keep it playing as audio under the scene art.'}
        </p>
      </div>

      {/* 7 — publish (unchanged) */}
      <div class="field">
        <label>Publish to the Realm — a snapshot players open on their own phones</label>
        <div class="supply-row" style={{ gap: '8px' }}>
          <button class="btn" onClick={copySnapshot}>📸 Copy snapshot</button>
        </div>
        {copied && (
          <p class="stat-fine">
            Copied — <strong>{copied.kb} KB</strong>. <strong style={{ color: 'var(--frost)' }}>{copied.withheld}% of your state withheld</strong> from players.
            Paste it over <code>public/snapshot.json</code> on GitHub and commit.
          </p>
        )}
        {fallback && (
          <textarea
            class="input"
            readOnly
            rows={6}
            style={{ width: '100%', marginTop: '6px', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
            value={fallback}
            onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
          />
        )}
        {!copied && (
          <p class="stat-fine">Copies the same player-safe view the TV receives — dormant quests, monster stats and DM prep stay on this phone. Paste it into <code>public/snapshot.json</code> and commit to publish.</p>
        )}
      </div>
    </Sheet>
  );
}
