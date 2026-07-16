// ============================================================
// SPRITE PICKER — "who wears which sprite". One component for
// every editor (PCs, allies, custom NPCs, preset-NPC overrides,
// monsters). Wave 6: 50+ sprites landed, so a flat grid became
// category tabs + a search field. Each surface opens on the tab
// its subject most likely lives in (monster editor → Monsters).
// Thumbnails show idle frame 0, zoomed to the measured content
// box so the tiny characters actually fill the tile.
// ============================================================

import { useMemo, useState } from 'preact/hooks';
import { ACTOR_SPRITES, ActorSprite, ActorCategory } from '../data/actor-sprites';

/** Idle frame 0, zoomed so the (measured) character fills the thumb box. */
export function spriteThumbStyle(a: ActorSprite, size = 44): Record<string, string> {
  const idle = a.anims.idle;
  if (!idle) return {};
  const z = (0.72 * size) / a.contentH;
  // Scale the WHOLE native sheet by z (aspect preserved off the width), so
  // multi-column sheets like the frost guardian — whose sheet is far wider than
  // one anim's strip — index their grid correctly instead of squishing. sheetW
  // defaults to a single strip's width. footOffsetX re-centers off-center art.
  const sheetW = (idle.sheetW ?? idle.frames * a.frameW) * z;
  // Wave 8 (QA #9): the offset must be ADDED, not subtracted. A descriptor's
  // content sits at native x = frameW/2 − footOffsetX (footOffsetX is the LEFT-
  // ward correction the stage applies via translateX). Centering that content in
  // the thumb needs `+ off`; the old `− off` pushed the bringer's right-of-centre
  // figure a further ~20px right — clean off the 44px tile, so the icon read blank.
  const off = (a.footOffsetX ?? 0) * z;
  return {
    width: `${size}px`, height: `${size}px`,
    backgroundImage: `url(${idle.file})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sheetW}px auto`,
    backgroundPosition: `${size / 2 - (a.frameW * z) / 2 + off}px ${size - (a.frameH - a.footPad) * z - 2 - (idle.row ?? 0) * a.frameH * z}px`,
    imageRendering: 'pixelated',
  };
}

const TABS: { id: ActorCategory; label: string }[] = [
  { id: 'hero', label: 'Heroes' },
  { id: 'npc', label: 'NPCs' },
  { id: 'monster', label: 'Monsters' },
  { id: 'beast', label: 'Beasts' },
  { id: 'boss', label: 'Bosses' },
];

export function SpritePicker({ value, onPick, surface = 'hero' }: {
  value?: string;
  onPick: (id?: string) => void;
  /** which tab this editor opens on */
  surface?: ActorCategory;
}) {
  // the current pick's own tab wins over the surface default, so editing
  // someone never hides their sprite behind another tab
  const current = ACTOR_SPRITES.find((a) => a.id === value);
  const [tab, setTab] = useState<ActorCategory>(current?.category ?? surface);
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();
  const shown = useMemo(
    () => ACTOR_SPRITES.filter((a) => query
      ? a.label.toLowerCase().includes(query) || a.id.toLowerCase().includes(query)
      : a.category === tab),
    [tab, query],
  );

  return (
    <div class="sprite-picker-panel">
      <div class="sprite-picker-bar">
        <div class="chip-row tight sprite-picker-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              class={`cond-chip${!query && tab === t.id ? ' on' : ''}`}
              onClick={() => { setTab(t.id); setQ(''); }}
            >{t.label}</button>
          ))}
        </div>
        {/* deliberately NOT class="input": it's a picker control, not a form
            field — keeps every form's field order (and the sim's) intact */}
        <input
          class="sprite-picker-search"
          type="search"
          placeholder="Search all sprites…"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="sprite-picker">
        <button
          class={`sprite-pick${!value ? ' on' : ''}`}
          onClick={() => onPick(undefined)}
          title="Classic atlas / emoji look"
        ><span class="sprite-pick-default">✦</span><span class="sprite-pick-name">Default</span></button>
        {shown.map((a) => (
          <button
            key={a.id}
            class={`sprite-pick${value === a.id ? ' on' : ''}`}
            onClick={() => onPick(a.id)}
            title={a.label}
          >
            <span class="sprite-pick-thumb" style={spriteThumbStyle(a)} />
            <span class="sprite-pick-name">{a.label}</span>
          </button>
        ))}
        {!shown.length && <p class="stat-fine sprite-picker-empty">No sprites match “{q}”.</p>}
      </div>
    </div>
  );
}
