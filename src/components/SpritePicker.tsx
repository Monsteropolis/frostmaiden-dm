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

/** Idle frame 0, zoomed so the (measured) character fills the thumb box.
 *
 *  Wave 9 (QA #2): TWO nested boxes, because a background image cannot
 *  overflow — it paints across its whole element. The old single box was a
 *  fixed square showing the sheet, so whenever one scaled frame was narrower
 *  than the square (every 16px-wide dungeon character), the NEIGHBOURING
 *  frame painted beside it — Ben's "doubled" sprites. Now the inner box is
 *  exactly one scaled frame (the same one-frame-box rule that fixed
 *  SpriteActor in Wave 7) and the outer square clips whatever the zoom
 *  pushes past its edges. footOffsetX re-centers off-center art (added, not
 *  subtracted — the Wave 8 QA #9 lesson). */
export function SpriteThumb({ a, size = 44, class: cls }: {
  a: ActorSprite; size?: number; class?: string;
}) {
  const idle = a.anims.idle;
  const box = { width: `${size}px`, height: `${size}px` };
  if (!idle) return <span class={`sprite-thumb ${cls ?? ''}`} style={box} />;
  const z = (0.72 * size) / a.contentH;
  // Scale the WHOLE native sheet by z (aspect preserved off the width), so
  // multi-column sheets like the frost guardian — whose sheet is far wider than
  // one anim's strip — index their grid correctly instead of squishing. sheetW
  // defaults to a single strip's width.
  const sheetW = (idle.sheetW ?? idle.frames * a.frameW) * z;
  return (
    <span class={`sprite-thumb ${cls ?? ''}`} style={box}>
      <span
        class="sprite-thumb-frame"
        style={{
          width: `${a.frameW * z}px`,
          height: `${a.frameH * z}px`,
          left: `${size / 2 - (a.frameW * z) / 2 + (a.footOffsetX ?? 0) * z}px`,
          top: `${size - (a.frameH - a.footPad) * z - 2}px`,
          backgroundImage: `url(${idle.file})`,
          backgroundSize: `${sheetW}px auto`,
          backgroundPosition: `0px ${-(idle.row ?? 0) * a.frameH * z}px`,
        }}
      />
    </span>
  );
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
            <SpriteThumb a={a} class="sprite-pick-thumb" />
            <span class="sprite-pick-name">{a.label}</span>
          </button>
        ))}
        {!shown.length && <p class="stat-fine sprite-picker-empty">No sprites match “{q}”.</p>}
      </div>
    </div>
  );
}
