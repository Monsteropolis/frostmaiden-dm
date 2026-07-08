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
import { SCENES, SCENE_CATS, SceneCat } from '../tv/scenes';

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
  const [catF, setCatF] = useState<SceneCat | 'all'>('all');
  const [yt, setYt] = useState(state.value.tv.youtubeId);
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

      <div class="field">
        <label>Scene slot — what fills the big space on the TV</label>
        <div class="chip-row" style={{ margin: '4px 0 10px' }}>
          {(['scene', 'idle', 'video'] as const).map((sv) => (
            <button
              key={sv}
              class={`cond-chip${state.value.tv.slotView === sv ? ' on' : ''}`}
              disabled={sv === 'video' && !state.value.tv.youtubeId}
              onClick={() => patch((d) => { d.tv.slotView = sv; })}
            >{sv === 'scene' ? '🖼 Scene art' : sv === 'idle' ? '⛺ Idle party' : '📺 Video'}</button>
          ))}
          <button
            class={`cond-chip${state.value.tv.idleFull ? ' on' : ''}`}
            onClick={() => patch((d) => { d.tv.idleFull = !d.tv.idleFull; })}
          >⛶ Idle fullscreen</button>
          <button class="cond-chip" onClick={() => patch((d) => { d.tv.poke = { seq: (d.tv.poke?.seq ?? 0) + 1, pcId: '', kind: 'cheer' }; })}>🎉 Celebrate!</button>
        </div>
        <p class="stat-fine">Idle party: your PCs mill about in the pixel scene, reacting to HP, weather, rations, and the place they're in. Fullscreen takes over the whole exploration view. 🎉 makes everyone cheer once.</p>
        <label style={{ marginTop: '10px' }}>Scene art</label>
        <div class="chip-row" style={{ margin: '4px 0 8px' }}>
          <button class={`cond-chip${catF === 'all' ? ' on' : ''}`} onClick={() => setCatF('all')}>All</button>
          {SCENE_CATS.map((c) => (
            <button key={c.id} class={`cond-chip${catF === c.id ? ' on' : ''}`} onClick={() => setCatF(c.id)}>{c.label}</button>
          ))}
        </div>
        <div class="scene-grid">
          <button
            class={`scene-pick${state.value.tv.sceneId === 'auto' ? ' on' : ''}`}
            onClick={() => patch((d) => { d.tv.sceneId = 'auto'; })}
          ><span class="scene-auto">✦</span><span class="scene-name">Auto</span></button>
          {SCENES.filter((sc) => catF === 'all' || sc.cat === catF).map((sc) => (
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
        <p class="stat-fine">Auto picks a pixel mood from weather and travel. Module art (locations, maps, monsters, NPCs) is always your deliberate choice.</p>
      </div>

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
            <button class="btn" onClick={() => patch((d) => { d.tv.slotView = d.tv.slotView === 'video' ? 'scene' : 'video'; })}>
              {state.value.tv.slotView === 'video' ? '🖼 Show scene' : '📺 Show video'}
            </button>
          )}
          {state.value.tv.youtubeId && (
            <button class="btn ghost" onClick={() => { setYt(''); patch((d) => { d.tv.youtubeId = ''; if (d.tv.slotView === 'video') d.tv.slotView = 'scene'; }); }}>Stop</button>
          )}
        </div>
        <p class="stat-fine">
          {state.value.tv.youtubeId
            ? state.value.tv.slotView === 'video'
              ? `Video is on the TV screen (${state.value.tv.youtubeId}). It starts muted — one click on the TV player unmutes.`
              : `Playing in the background (${state.value.tv.youtubeId}) — the scene stays on screen. Toggle to show the video.`
            : 'The player shares the scene slot on the TV: show it for visuals, hide it to keep music playing under the scene art.'}
        </p>
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
