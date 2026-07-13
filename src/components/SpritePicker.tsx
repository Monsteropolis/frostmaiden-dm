// ============================================================
// SPRITE PICKER — "who wears which sprite". One component for
// every editor (PCs, allies, custom NPCs, preset-NPC overrides).
// Thumbnails show idle frame 0, zoomed to the measured content
// box so the tiny characters actually fill the tile.
// ============================================================

import { ACTOR_SPRITES, ActorSprite } from '../data/actor-sprites';

/** Idle frame 0, zoomed so the (measured) character fills the thumb box. */
export function spriteThumbStyle(a: ActorSprite, size = 44): Record<string, string> {
  const idle = a.anims.idle;
  if (!idle) return {};
  const z = (0.72 * size) / a.contentH;
  return {
    width: `${size}px`, height: `${size}px`,
    backgroundImage: `url(${idle.file})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${idle.frames * a.frameW * z}px auto`,
    backgroundPosition: `${size / 2 - (a.frameW * z) / 2}px ${size - (a.frameH - a.footPad) * z - 2 - (idle.row ?? 0) * a.frameH * z}px`,
    imageRendering: 'pixelated',
  };
}

export function SpritePicker({ value, onPick }: { value?: string; onPick: (id?: string) => void }) {
  return (
    <div class="sprite-picker">
      <button
        class={`sprite-pick${!value ? ' on' : ''}`}
        onClick={() => onPick(undefined)}
        title="Classic atlas / emoji look"
      ><span class="sprite-pick-default">✦</span><span class="sprite-pick-name">Default</span></button>
      {ACTOR_SPRITES.map((a) => (
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
    </div>
  );
}
